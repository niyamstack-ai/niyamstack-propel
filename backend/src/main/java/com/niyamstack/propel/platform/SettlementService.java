package com.niyamstack.propel.platform;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.domain.Model.Payment;
import com.niyamstack.propel.domain.Model.PayoutBatch;
import com.niyamstack.propel.domain.Model.Refund;
import com.niyamstack.propel.domain.Model.PlatformRole;
import com.niyamstack.propel.domain.Model.PlatformUserRole;
import com.niyamstack.propel.domain.Model.SettlementEntry;
import com.niyamstack.propel.integration.RazorpayXClient;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.OrgAccess;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class SettlementService {
    private static final Logger log = LoggerFactory.getLogger(SettlementService.class);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    public static final String SETTING_PAYOUT_MODE = "payoutMode";
    public static final BigDecimal DEFAULT_FEE = new BigDecimal("0.0500");

    private final Store store;
    private final RazorpayXClient razorpayX;

    public SettlementService(Store store, RazorpayXClient razorpayX) {
        this.store = store;
        this.razorpayX = razorpayX;
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
            BigDecimal divisor = BigDecimal.ONE.add(pct);
            BigDecimal list = gross.divide(divisor, 2, RoundingMode.HALF_UP);
            platformFee = gross.subtract(list);
            net = list;
        } else {
            platformFee = gross.multiply(pct).setScale(2, RoundingMode.HALF_UP);
            // Tiny ABSORB checkouts can HALF_UP to ₹0; keep a minimum 1-paisa fee when % > 0.
            if (platformFee.signum() == 0 && pct.signum() > 0) {
                platformFee = new BigDecimal("0.01");
            }
            if (platformFee.compareTo(gross) > 0) {
                platformFee = gross;
            }
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

    @Transactional
    public SettlementEntry recordRefund(Organization org, Payment payment, Refund refund) {
        if (payment == null || refund == null) {
            return null;
        }
        BigDecimal refundAmt = refund.getAmount() == null ? BigDecimal.ZERO : refund.getAmount();
        if (refundAmt.signum() <= 0) {
            return null;
        }
        String note = "refund:" + refund.getId();
        boolean already = store.listBy(SettlementEntry.class, org.getId(), "paymentId", payment.getId()).stream()
                .anyMatch(e -> note.equals(e.getNotes()));
        if (already) {
            return null;
        }
        SettlementEntry original = store.listBy(SettlementEntry.class, org.getId(), "paymentId", payment.getId()).stream()
                .filter(e -> e.getNotes() == null || !e.getNotes().startsWith("refund:"))
                .filter(e -> nvl(e.getGrossAmount()).signum() > 0)
                .findFirst()
                .orElse(null);
        if (original == null) {
            return null;
        }
        BigDecimal payAmt = payment.getAmount() == null ? BigDecimal.ZERO : payment.getAmount();
        if (payAmt.signum() <= 0) {
            return null;
        }
        BigDecimal ratio = refundAmt.divide(payAmt, 8, RoundingMode.HALF_UP);
        if (ratio.compareTo(BigDecimal.ONE) > 0) {
            ratio = BigDecimal.ONE;
        }
        BigDecimal gross = nvl(original.getGrossAmount()).multiply(ratio).setScale(2, RoundingMode.HALF_UP).negate();
        BigDecimal fee = nvl(original.getPlatformFeeAmount()).multiply(ratio).setScale(2, RoundingMode.HALF_UP).negate();
        BigDecimal net = nvl(original.getNetToInstitute()).multiply(ratio).setScale(2, RoundingMode.HALF_UP).negate();
        SettlementEntry entry = new SettlementEntry();
        entry.setOrganizationId(org.getId());
        entry.setPaymentId(payment.getId());
        entry.setInvoiceId(original.getInvoiceId());
        entry.setStudentId(original.getStudentId());
        entry.setCourseId(original.getCourseId());
        entry.setGrossAmount(gross);
        entry.setPlatformFeePercent(original.getPlatformFeePercent());
        entry.setPlatformFeeAmount(fee);
        entry.setFeeMode(original.getFeeMode() != null ? original.getFeeMode() : feeMode(org));
        entry.setNetToInstitute(net);
        entry.setStatus("PENDING");
        entry.setNotes(note);
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
        if ("AUTOMATIC".equals(normalized) && !razorpayX.live()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Set RazorpayX keys and account number before switching payouts to AUTOMATIC. Use MANUAL until then.");
        }
        store.putSetting(SETTING_PAYOUT_MODE, normalized);
        return Map.of("payoutMode", normalized, "configured", razorpayX.live());
    }

    public Map<String, Object> payoutSettings() {
        requirePlatformFinance();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("payoutMode", globalPayoutMode());
        out.putAll(razorpayX.status());
        return out;
    }

    @Transactional
    public List<Map<String, Object>> runWeeklyPayouts() {
        requirePlatformFinance();
        return runWeeklyPayoutsInternal();
    }

    /** Cron / internal entry — no auth principal required. Settles prior Mon–Sun IST week. */
    @Transactional
    public List<Map<String, Object>> runWeeklyPayoutsInternal() {
        LocalDate end = LocalDate.now(IST).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
        LocalDate start = end.minusDays(6); // Monday of that week
        List<Map<String, Object>> created = new ArrayList<>();
        for (Organization org : store.listOrganizations()) {
            releaseHoldsForOrg(org.getId());
            retryReadyAutoForOrg(org.getId());
            Map<String, Object> batch = buildBatch(org, start, end);
            if (batch != null) {
                created.add(batch);
            }
        }
        return created;
    }

    /** Re-open batches held for missing bank once institute adds payout details. */
    @Transactional
    public void releaseHoldsForOrg(UUID orgId) {
        Organization org = store.get(Organization.class, orgId);
        if (!OrgAccess.hasBankDetails(org)) {
            return;
        }
        for (PayoutBatch batch : store.list(PayoutBatch.class, orgId)) {
            if (!"HOLD_NO_BANK".equalsIgnoreCase(batch.getStatus())) {
                continue;
            }
            batch.setBankAccountName(org.getBankAccountName());
            batch.setBankAccountNumber(org.getBankAccountNumber());
            batch.setBankIfsc(org.getBankIfsc());
            String mode = effectivePayoutMode(org);
            batch.setStatus("AUTOMATIC".equals(mode) ? "READY_AUTO" : "READY");
            batch = store.save(batch);
            if ("READY_AUTO".equals(batch.getStatus())) {
                attemptAutomaticPayout(org, batch);
            }
        }
    }

    /** Retry automatic payout for batches waiting on RazorpayX once keys/account are live. */
    @Transactional
    public void retryReadyAutoForOrg(UUID orgId) {
        if (!razorpayX.live()) {
            return;
        }
        Organization org = store.get(Organization.class, orgId);
        for (PayoutBatch batch : store.list(PayoutBatch.class, orgId)) {
            String st = batch.getStatus() == null ? "" : batch.getStatus().trim().toUpperCase();
            if ("READY_AUTO".equals(st) || "FAILED_AUTO".equals(st)) {
                org = store.get(Organization.class, orgId);
                attemptAutomaticPayout(org, batch);
            }
        }
    }

    @Transactional
    public Map<String, Object> buildBatch(Organization org, LocalDate start, LocalDate end) {
        boolean periodExists = store.list(PayoutBatch.class, org.getId()).stream()
                .anyMatch(b -> start.equals(b.getPeriodStart()) && end.equals(b.getPeriodEnd()));
        if (periodExists) {
            return null;
        }
        List<SettlementEntry> pending = store.list(SettlementEntry.class, org.getId()).stream()
                .filter(e -> "PENDING".equalsIgnoreCase(e.getStatus()))
                .filter(e -> e.getCreatedAt() != null)
                .filter(e -> {
                    LocalDate day = e.getCreatedAt().atZone(IST).toLocalDate();
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
        if ("READY_AUTO".equals(batch.getStatus())) {
            batch = attemptAutomaticPayout(org, batch);
        }
        return batchView(batch, org);
    }

    @Transactional
    public Map<String, Object> retryAutomatic(UUID batchId) {
        requirePlatformFinance();
        PayoutBatch batch = store.get(PayoutBatch.class, batchId);
        Organization org = store.get(Organization.class, batch.getOrganizationId());
        if (!"READY_AUTO".equalsIgnoreCase(batch.getStatus()) && !"FAILED_AUTO".equalsIgnoreCase(batch.getStatus())) {
            return batchView(batch, org);
        }
        batch = attemptAutomaticPayout(org, batch);
        return batchView(batch, org);
    }

    private PayoutBatch attemptAutomaticPayout(Organization org, PayoutBatch batch) {
        RazorpayXClient.PayoutResult result = razorpayX.payout(
                org.getRazorpayContactId(),
                org.getRazorpayFundAccountId(),
                org.getBankAccountName(),
                org.getBankAccountNumber(),
                org.getBankIfsc(),
                batch.getNetAmount(),
                "batch-" + batch.getId(),
                batch.getId().toString()
        );
        if (result.contactId() != null && !result.contactId().isBlank()) {
            org.setRazorpayContactId(result.contactId());
        }
        if (result.fundAccountId() != null && !result.fundAccountId().isBlank()) {
            org.setRazorpayFundAccountId(result.fundAccountId());
        }
        store.save(org);

        if ("NOT_CONFIGURED".equals(result.status())) {
            batch.setStatus("READY_AUTO");
            batch.setFailureReason(result.message());
            log.info("RazorpayX not ready for batch {}: {}", batch.getId(), result.message());
            return store.save(batch);
        }
        if (result.ok()) {
            String payoutStatus = result.status() == null ? "" : result.status().trim().toLowerCase();
            if (isPayoutSettled(payoutStatus)) {
                batch.setStatus("PAID");
                batch.setPaidAt(Instant.now());
                batch.setGatewayRef(result.payoutId());
                batch.setFailureReason(null);
                batch = store.save(batch);
                markEntriesPaid(batch);
                return batch;
            }
            if ("failed".equals(payoutStatus) || "reversed".equals(payoutStatus) || "cancelled".equals(payoutStatus)) {
                batch.setStatus("FAILED_AUTO");
                batch.setFailureReason(trimReason(result.message()));
                if (result.payoutId() != null && !result.payoutId().isBlank()) {
                    batch.setGatewayRef(result.payoutId());
                }
                log.warn("RazorpayX payout terminal failure for batch {}: {}", batch.getId(), result.status());
                return store.save(batch);
            }
            batch.setStatus("PROCESSING");
            batch.setGatewayRef(result.payoutId());
            batch.setFailureReason(null);
            log.info("RazorpayX payout in flight for batch {}: {}", batch.getId(), result.status());
            return store.save(batch);
        }
        batch.setStatus("FAILED_AUTO");
        batch.setFailureReason(trimReason(result.message()));
        log.warn("RazorpayX payout failed for batch {}: {}", batch.getId(), result.message());
        return store.save(batch);
    }

    @Transactional
    public Map<String, Object> markBatchPaid(UUID batchId, String gatewayRef) {
        requirePlatformFinance();
        PayoutBatch batch = store.get(PayoutBatch.class, batchId);
        Organization org = store.get(Organization.class, batch.getOrganizationId());
        if ("PAID".equalsIgnoreCase(batch.getStatus())) {
            return batchView(batch, org);
        }
        String st = batch.getStatus() == null ? "" : batch.getStatus().trim().toUpperCase();
        if (!"READY".equals(st) && !"READY_AUTO".equals(st) && !"FAILED_AUTO".equals(st)
                && !"HOLD_NO_BANK".equals(st) && !"PROCESSING".equals(st)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Cannot mark batch paid from status " + batch.getStatus());
        }
        batch.setStatus("PAID");
        batch.setPaidAt(Instant.now());
        batch.setFailureReason(null);
        if (gatewayRef != null && !gatewayRef.isBlank()) {
            batch.setGatewayRef(gatewayRef.trim());
        }
        store.save(batch);
        markEntriesPaid(batch);
        return batchView(batch, org);
    }

    private void markEntriesPaid(PayoutBatch batch) {
        for (SettlementEntry e : store.list(SettlementEntry.class, batch.getOrganizationId())) {
            if (batch.getId().equals(e.getPayoutBatchId())) {
                e.setStatus("PAID");
                store.save(e);
            }
        }
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
        row.put("failureReason", batch.getFailureReason());
        return row;
    }

    private void requirePlatformFinance() {
        requireCap(PlatformCaps.MANAGE_RIGHTS);
    }

    private void requireCap(String cap) {
        Access.requirePlatform(Auth.current());
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        if (!capsForUser(user).contains(cap)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This role cannot " + PlatformCaps.label(cap).toLowerCase());
        }
    }

    private List<String> capsForUser(AppUser user) {
        if (Roles.PLATFORM_OWNER.equals(user.getRole())) {
            return PlatformCaps.ALL;
        }
        LinkedHashSet<String> caps = new LinkedHashSet<>();
        for (PlatformUserRole link : store.listUserRoles(user.getId())) {
            PlatformRole role = store.get(PlatformRole.class, link.getRoleId());
            if (role.getCapabilitiesCsv() != null) {
                caps.addAll(Arrays.stream(role.getCapabilitiesCsv().split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .toList());
            }
        }
        return new ArrayList<>(caps);
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

    private static String trimReason(String message) {
        if (message == null) {
            return null;
        }
        return message.length() <= 500 ? message : message.substring(0, 500);
    }

    private static boolean isPayoutSettled(String payoutStatus) {
        return "processed".equals(payoutStatus) || "paid".equals(payoutStatus);
    }
}
