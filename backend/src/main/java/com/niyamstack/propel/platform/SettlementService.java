package com.niyamstack.propel.platform;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.domain.Model.Payment;
import com.niyamstack.propel.domain.Model.PayoutBatch;
import com.niyamstack.propel.domain.Model.SettlementEntry;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.OrgAccess;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class SettlementService {
    public static final String SETTING_PAYOUT_MODE = "payoutMode";
    public static final BigDecimal DEFAULT_FEE = new BigDecimal("0.0500");

    private final Store store;

    public SettlementService(Store store) {
        this.store = store;
    }

    public BigDecimal feePercent(Organization org) {
        if (org.getPlatformFeePercent() == null || org.getPlatformFeePercent().signum() < 0) {
            return DEFAULT_FEE;
        }
        return org.getPlatformFeePercent().setScale(4, RoundingMode.HALF_UP);
    }

    public String feeMode(Organization org) {
        String mode = org.getPlatformFeeMode() == null ? "ABSORB" : org.getPlatformFeeMode().trim().toUpperCase();
        return "PASS_STUDENT".equals(mode) ? "PASS_STUDENT" : "ABSORB";
    }

    /** Amount the student should pay at checkout for a listed course price. */
    public BigDecimal checkoutAmount(Organization org, BigDecimal listPrice) {
        BigDecimal list = listPrice == null ? BigDecimal.ZERO : listPrice;
        if (list.signum() <= 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        if ("PASS_STUDENT".equals(feeMode(org))) {
            BigDecimal fee = list.multiply(feePercent(org)).setScale(2, RoundingMode.HALF_UP);
            return list.add(fee);
        }
        return list.setScale(2, RoundingMode.HALF_UP);
    }

    @Transactional
    public SettlementEntry recordCapture(Organization org, Payment payment, UUID invoiceId, UUID studentId, UUID courseId) {
        if (payment == null || payment.getAmount() == null || payment.getAmount().signum() <= 0) {
            return null;
        }
        boolean exists = store.listBy(SettlementEntry.class, org.getId(), "paymentId", payment.getId()).stream().findAny().isPresent();
        if (exists) {
            return null;
        }
        BigDecimal gross = payment.getAmount().setScale(2, RoundingMode.HALF_UP);
        BigDecimal pct = feePercent(org);
        String mode = feeMode(org);
        BigDecimal platformFee;
        BigDecimal net;
        if ("PASS_STUDENT".equals(mode)) {
            // Student paid list + fee; institute gets list (= gross / (1+pct)), platform gets the rest.
            BigDecimal divisor = BigDecimal.ONE.add(pct);
            BigDecimal list = gross.divide(divisor, 2, RoundingMode.HALF_UP);
            platformFee = gross.subtract(list);
            net = list;
        } else {
            platformFee = gross.multiply(pct).setScale(2, RoundingMode.HALF_UP);
            net = gross.subtract(platformFee);
        }
        SettlementEntry entry = new SettlementEntry();
        entry.setOrganizationId(org.getId());
        entry.setPaymentId(payment.getId());
        entry.setInvoiceId(invoiceId);
        entry.setStudentId(studentId);
        entry.setCourseId(courseId);
        entry.setGrossAmount(gross);
        entry.setPlatformFeePercent(pct);
        entry.setPlatformFeeAmount(platformFee);
        entry.setFeeMode(mode);
        entry.setNetToInstitute(net);
        entry.setStatus("PENDING");
        return store.save(entry);
    }

    public String globalPayoutMode() {
        String v = store.settingValue(SETTING_PAYOUT_MODE);
        return "AUTOMATIC".equalsIgnoreCase(v) ? "AUTOMATIC" : "MANUAL";
    }

    public String effectivePayoutMode(Organization org) {
        String local = org.getPayoutMode() == null ? "INHERIT" : org.getPayoutMode().trim().toUpperCase();
        if ("MANUAL".equals(local) || "AUTOMATIC".equals(local)) {
            return local;
        }
        return globalPayoutMode();
    }

    @Transactional
    public Map<String, Object> setGlobalPayoutMode(String mode) {
        requirePlatformFinance();
        String normalized = "AUTOMATIC".equalsIgnoreCase(mode) ? "AUTOMATIC" : "MANUAL";
        store.putSetting(SETTING_PAYOUT_MODE, normalized);
        return Map.of("payoutMode", normalized);
    }

    public Map<String, Object> payoutSettings() {
        requirePlatformFinance();
        return Map.of("payoutMode", globalPayoutMode());
    }

    @Transactional
    public List<Map<String, Object>> runWeeklyPayouts() {
        requirePlatformFinance();
        LocalDate end = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
        LocalDate start = end.minusDays(6);
        List<Map<String, Object>> created = new ArrayList<>();
        for (Organization org : store.listOrganizations()) {
            Map<String, Object> batch = buildBatch(org, start, end);
            if (batch != null) {
                created.add(batch);
            }
        }
        return created;
    }

    @Transactional
    public Map<String, Object> buildBatch(Organization org, LocalDate start, LocalDate end) {
        List<SettlementEntry> pending = store.list(SettlementEntry.class, org.getId()).stream()
                .filter(e -> "PENDING".equalsIgnoreCase(e.getStatus()))
                .filter(e -> e.getCreatedAt() != null)
                .filter(e -> {
                    LocalDate day = e.getCreatedAt().atZone(java.time.ZoneId.systemDefault()).toLocalDate();
                    return !day.isBefore(start) && !day.isAfter(end);
                })
                .toList();
        if (pending.isEmpty()) {
            return null;
        }
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal fee = BigDecimal.ZERO;
        BigDecimal net = BigDecimal.ZERO;
        for (SettlementEntry e : pending) {
            gross = gross.add(nvl(e.getGrossAmount()));
            fee = fee.add(nvl(e.getPlatformFeeAmount()));
            net = net.add(nvl(e.getNetToInstitute()));
        }
        PayoutBatch batch = new PayoutBatch();
        batch.setOrganizationId(org.getId());
        batch.setPeriodStart(start);
        batch.setPeriodEnd(end);
        batch.setGrossAmount(gross);
        batch.setPlatformFeeAmount(fee);
        batch.setNetAmount(net);
        String mode = effectivePayoutMode(org);
        batch.setMode(mode);
        batch.setBankAccountName(org.getBankAccountName());
        batch.setBankAccountNumber(org.getBankAccountNumber());
        batch.setBankIfsc(org.getBankIfsc());
        if (!OrgAccess.hasBankDetails(org)) {
            batch.setStatus("HOLD_NO_BANK");
        } else if ("AUTOMATIC".equals(mode)) {
            // v1: queue as ready for automatic transfer; actual RazorpayX call can plug in here.
            batch.setStatus("READY_AUTO");
        } else {
            batch.setStatus("READY");
        }
        batch = store.save(batch);
        for (SettlementEntry e : pending) {
            e.setPayoutBatchId(batch.getId());
            e.setStatus("IN_BATCH");
            store.save(e);
        }
        return batchView(batch, org);
    }

    @Transactional
    public Map<String, Object> markBatchPaid(UUID batchId, String gatewayRef) {
        requirePlatformFinance();
        PayoutBatch batch = store.get(PayoutBatch.class, batchId);
        batch.setStatus("PAID");
        batch.setPaidAt(Instant.now());
        if (gatewayRef != null && !gatewayRef.isBlank()) {
            batch.setGatewayRef(gatewayRef.trim());
        }
        store.save(batch);
        for (SettlementEntry e : store.list(SettlementEntry.class, batch.getOrganizationId())) {
            if (batch.getId().equals(e.getPayoutBatchId())) {
                e.setStatus("PAID");
                store.save(e);
            }
        }
        Organization org = store.get(Organization.class, batch.getOrganizationId());
        return batchView(batch, org);
    }

    public List<Map<String, Object>> report(UUID orgId) {
        requirePlatformFinance();
        List<Map<String, Object>> rows = new ArrayList<>();
        List<Organization> orgs = orgId == null
                ? store.listOrganizations()
                : List.of(store.get(Organization.class, orgId));
        for (Organization org : orgs) {
            BigDecimal gross = BigDecimal.ZERO;
            BigDecimal fee = BigDecimal.ZERO;
            BigDecimal net = BigDecimal.ZERO;
            BigDecimal pendingNet = BigDecimal.ZERO;
            int txns = 0;
            for (SettlementEntry e : store.list(SettlementEntry.class, org.getId())) {
                txns++;
                gross = gross.add(nvl(e.getGrossAmount()));
                fee = fee.add(nvl(e.getPlatformFeeAmount()));
                net = net.add(nvl(e.getNetToInstitute()));
                if ("PENDING".equalsIgnoreCase(e.getStatus()) || "IN_BATCH".equalsIgnoreCase(e.getStatus())) {
                    pendingNet = pendingNet.add(nvl(e.getNetToInstitute()));
                }
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("organizationId", org.getId());
            row.put("name", org.getName());
            row.put("slug", org.getSlug());
            row.put("platformFeePercent", feePercent(org));
            row.put("platformFeeMode", feeMode(org));
            row.put("payoutMode", effectivePayoutMode(org));
            row.put("transactions", txns);
            row.put("grossAmount", gross);
            row.put("platformFeeAmount", fee);
            row.put("netToInstitute", net);
            row.put("pendingPayout", pendingNet);
            row.put("hasBank", OrgAccess.hasBankDetails(org));
            row.put("bankAccountName", org.getBankAccountName());
            row.put("bankIfsc", org.getBankIfsc());
            rows.add(row);
        }
        return rows;
    }

    public List<Map<String, Object>> batches(UUID orgId) {
        requirePlatformFinance();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Organization org : store.listOrganizations()) {
            if (orgId != null && !org.getId().equals(orgId)) {
                continue;
            }
            for (PayoutBatch b : store.list(PayoutBatch.class, org.getId())) {
                rows.add(batchView(b, org));
            }
        }
        rows.sort((a, b) -> String.valueOf(b.get("periodEnd")).compareTo(String.valueOf(a.get("periodEnd"))));
        return rows;
    }

    private Map<String, Object> batchView(PayoutBatch batch, Organization org) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", batch.getId());
        row.put("organizationId", org.getId());
        row.put("organizationName", org.getName());
        row.put("periodStart", batch.getPeriodStart());
        row.put("periodEnd", batch.getPeriodEnd());
        row.put("grossAmount", batch.getGrossAmount());
        row.put("platformFeeAmount", batch.getPlatformFeeAmount());
        row.put("netAmount", batch.getNetAmount());
        row.put("status", batch.getStatus());
        row.put("mode", batch.getMode());
        row.put("bankAccountName", batch.getBankAccountName());
        row.put("bankAccountNumber", maskAccount(batch.getBankAccountNumber()));
        row.put("bankIfsc", batch.getBankIfsc());
        row.put("gatewayRef", batch.getGatewayRef());
        row.put("paidAt", batch.getPaidAt());
        return row;
    }

    private void requirePlatformFinance() {
        Access.requirePlatform(Auth.current());
    }

    private static BigDecimal nvl(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String maskAccount(String number) {
        if (number == null || number.length() < 4) {
            return number;
        }
        return "****" + number.substring(number.length() - 4);
    }
}
