package com.niyamstack.propel.compensation;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

@Service
public class CompensationService {
    private final Store store;

    public CompensationService(Store store) {
        this.store = store;
    }

    public Map<String, Object> settingsView() {
        requireHr();
        return settingsMap(settings());
    }

    @Transactional
    public Map<String, Object> saveSettings(Map<String, Object> body) {
        requireHr();
        CommissionSettings s = settings();
        if (body != null) {
            if (body.get("conversionFlat") != null) {
                s.setConversionFlat(decimal(body.get("conversionFlat")));
            }
            if (body.get("feePercent") != null) {
                s.setFeePercent(decimal(body.get("feePercent")));
            }
            if (body.get("enabled") != null) {
                s.setEnabled(Boolean.TRUE.equals(body.get("enabled")) || "true".equalsIgnoreCase(String.valueOf(body.get("enabled"))));
            }
        }
        return settingsMap(store.save(s));
    }

    public List<Map<String, Object>> plans() {
        requireHr();
        UUID org = orgId();
        Map<UUID, Employee> employees = employeeMap(org);
        return store.list(CompensationPlan.class, org).stream()
                .map(p -> planView(p, employees.get(p.getEmployeeId())))
                .toList();
    }

    @Transactional
    public Map<String, Object> savePlan(Map<String, Object> body) {
        requireHr();
        UUID employeeId = uuid(body, "employeeId");
        if (employeeId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "employeeId is required");
        }
        store.getOwned(Employee.class, employeeId, orgId());
        String planType = str(body, "planType", "FIXED").toUpperCase();
        if (!Set.of("FIXED", "HOURLY", "PER_BATCH").contains(planType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "planType must be FIXED, HOURLY, or PER_BATCH");
        }
        CompensationPlan plan = store.list(CompensationPlan.class, orgId()).stream()
                .filter(p -> employeeId.equals(p.getEmployeeId()) && Boolean.TRUE.equals(p.getActive()))
                .findFirst()
                .orElse(new CompensationPlan());
        plan.setOrganizationId(orgId());
        plan.setEmployeeId(employeeId);
        plan.setPlanType(planType);
        plan.setRateAmount(decimal(body == null ? null : body.get("rateAmount")));
        plan.setRatePercent(decimal(body == null ? null : body.get("ratePercent")));
        if (body != null && body.get("effectiveFrom") != null && !String.valueOf(body.get("effectiveFrom")).isBlank()) {
            plan.setEffectiveFrom(LocalDate.parse(String.valueOf(body.get("effectiveFrom"))));
        }
        if (plan.getEffectiveFrom() == null) {
            plan.setEffectiveFrom(LocalDate.now());
        }
        plan.setActive(true);
        plan = store.save(plan);
        Employee e = store.getOwned(Employee.class, employeeId, orgId());
        return planView(plan, e);
    }

    public List<Map<String, Object>> ledger(Integer year, Integer month, UUID employeeId, String status) {
        requireHr();
        UUID org = orgId();
        return store.list(CommissionLedger.class, org).stream()
                .filter(row -> year == null || year.equals(row.getPeriodYear()))
                .filter(row -> month == null || month.equals(row.getPeriodMonth()))
                .filter(row -> employeeId == null || employeeId.equals(row.getEmployeeId()))
                .filter(row -> status == null || status.isBlank() || status.equalsIgnoreCase(row.getStatus()))
                .sorted(Comparator.comparing(CommissionLedger::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(row -> ledgerView(row, employeeMap(org).get(row.getEmployeeId())))
                .toList();
    }

    public Map<String, Object> myCommissions() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.COUNSELOR, Roles.OWNER, Roles.PLACEMENT_HEAD);
        Employee e = employeeByUser(user.organizationId(), user.userId());
        if (e == null) {
            return Map.of("totalApproved", BigDecimal.ZERO, "totalPaid", BigDecimal.ZERO, "rows", List.of());
        }
        LocalDate now = LocalDate.now();
        List<Map<String, Object>> rows = store.list(CommissionLedger.class, user.organizationId()).stream()
                .filter(row -> e.getId().equals(row.getEmployeeId()))
                .filter(row -> now.getYear() == (row.getPeriodYear() == null ? 0 : row.getPeriodYear())
                        && now.getMonthValue() == (row.getPeriodMonth() == null ? 0 : row.getPeriodMonth()))
                .map(row -> ledgerView(row, e))
                .toList();
        BigDecimal approved = rows.stream()
                .filter(r -> "APPROVED".equals(r.get("status")))
                .map(r -> (BigDecimal) r.get("amount"))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal paid = rows.stream()
                .filter(r -> "PAID".equals(r.get("status")))
                .map(r -> (BigDecimal) r.get("amount"))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("employeeId", e.getId());
        out.put("employeeName", e.getFullName());
        out.put("totalApproved", approved);
        out.put("totalPaid", paid);
        out.put("rows", rows);
        return out;
    }

    @Transactional
    public void accrueOnConversion(Inquiry inquiry) {
        if (inquiry == null || inquiry.getCounselorUserId() == null) {
            return;
        }
        CommissionSettings cfg = settings(inquiry.getOrganizationId());
        if (!Boolean.TRUE.equals(cfg.getEnabled())) {
            return;
        }
        Employee counselor = employeeByUser(inquiry.getOrganizationId(), inquiry.getCounselorUserId());
        if (counselor == null) {
            return;
        }
        if (ledgerExists(inquiry.getOrganizationId(), "CONVERSION", inquiry.getId())) {
            return;
        }
        LocalDate day = inquiry.getCreatedAt() == null
                ? LocalDate.now()
                : inquiry.getCreatedAt().atZone(ZoneId.systemDefault()).toLocalDate();
        CommissionLedger row = new CommissionLedger();
        row.setOrganizationId(inquiry.getOrganizationId());
        row.setEmployeeId(counselor.getId());
        row.setSourceType("CONVERSION");
        row.setSourceId(inquiry.getId());
        row.setPeriodYear(day.getYear());
        row.setPeriodMonth(day.getMonthValue());
        row.setAmount(nz(cfg.getConversionFlat()));
        row.setDescription("Admission conversion — " + blank(inquiry.getFullName(), "Lead"));
        row.setStatus("APPROVED");
        store.save(row);
    }

    @Transactional
    public void accrueOnFeeCollected(UUID orgId, Payment payment, UUID studentId) {
        if (payment == null || studentId == null || payment.getAmount() == null || payment.getAmount().signum() <= 0) {
            return;
        }
        CommissionSettings cfg = settings(orgId);
        if (!Boolean.TRUE.equals(cfg.getEnabled()) || nz(cfg.getFeePercent()).signum() <= 0) {
            return;
        }
        UUID counselorUserId = counselorForStudent(orgId, studentId);
        if (counselorUserId == null) {
            return;
        }
        Employee counselor = employeeByUser(orgId, counselorUserId);
        if (counselor == null) {
            return;
        }
        if (ledgerExists(orgId, "FEE_COLLECTED", payment.getId())) {
            return;
        }
        Instant when = payment.getReceivedAt() == null ? Instant.now() : payment.getReceivedAt();
        LocalDate day = when.atZone(ZoneId.systemDefault()).toLocalDate();
        BigDecimal amount = payment.getAmount().multiply(cfg.getFeePercent()).setScale(2, RoundingMode.HALF_UP);
        if (amount.signum() <= 0) {
            return;
        }
        CommissionLedger row = new CommissionLedger();
        row.setOrganizationId(orgId);
        row.setEmployeeId(counselor.getId());
        row.setSourceType("FEE_COLLECTED");
        row.setSourceId(payment.getId());
        row.setPeriodYear(day.getYear());
        row.setPeriodMonth(day.getMonthValue());
        row.setAmount(amount);
        row.setDescription("Fee collection commission");
        row.setStatus("APPROVED");
        store.save(row);
    }

    public BigDecimal commissionForPayroll(UUID orgId, UUID employeeId, int year, int month) {
        return store.list(CommissionLedger.class, orgId).stream()
                .filter(row -> employeeId.equals(row.getEmployeeId()))
                .filter(row -> year == (row.getPeriodYear() == null ? 0 : row.getPeriodYear()))
                .filter(row -> month == (row.getPeriodMonth() == null ? 0 : row.getPeriodMonth()))
                .filter(row -> "APPROVED".equalsIgnoreCase(row.getStatus()))
                .map(CommissionLedger::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    @Transactional
    public void markCommissionsPaid(UUID orgId, UUID employeeId, int year, int month) {
        for (CommissionLedger row : store.list(CommissionLedger.class, orgId)) {
            if (!employeeId.equals(row.getEmployeeId())) {
                continue;
            }
            if (year != (row.getPeriodYear() == null ? 0 : row.getPeriodYear())) {
                continue;
            }
            if (month != (row.getPeriodMonth() == null ? 0 : row.getPeriodMonth())) {
                continue;
            }
            if ("APPROVED".equalsIgnoreCase(row.getStatus())) {
                row.setStatus("PAID");
                store.save(row);
            }
        }
    }

    public BigDecimal facultyVariablePay(UUID orgId, Employee employee, int year, int month) {
        if (employee == null || employee.getUserId() == null) {
            return BigDecimal.ZERO;
        }
        CompensationPlan plan = activePlan(orgId, employee.getId());
        if (plan == null) {
            return BigDecimal.ZERO;
        }
        return switch (blank(plan.getPlanType(), "FIXED")) {
            case "HOURLY" -> hourlyPay(orgId, employee.getId(), year, month, plan.getRateAmount());
            case "PER_BATCH" -> perBatchPay(orgId, employee.getUserId(), plan.getRateAmount());
            default -> BigDecimal.ZERO;
        };
    }

    public List<Map<String, Object>> facultyPreview(int year, int month) {
        requireHr();
        UUID org = orgId();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Employee e : store.list(Employee.class, org)) {
            if (!"FACULTY".equalsIgnoreCase(e.getEmploymentType())) {
                continue;
            }
            CompensationPlan plan = activePlan(org, e.getId());
            BigDecimal variable = facultyVariablePay(org, e, year, month);
            if (plan == null && variable.signum() == 0) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("employeeId", e.getId());
            row.put("employeeName", e.getFullName());
            row.put("planType", plan == null ? "—" : plan.getPlanType());
            row.put("variablePay", variable);
            out.add(row);
        }
        return out;
    }

    /** Hours from staff punch IN→OUT for the pay month — not invented from timetable. */
    private BigDecimal hourlyPay(UUID orgId, UUID employeeId, int year, int month, BigDecimal hourlyRate) {
        if (hourlyRate == null || hourlyRate.signum() <= 0 || employeeId == null) {
            return BigDecimal.ZERO;
        }
        long minutes = 0;
        for (StaffAttendance a : store.listBy(StaffAttendance.class, orgId, "employeeId", employeeId)) {
            if (a.getWorkDate() == null || a.getWorkDate().getYear() != year || a.getWorkDate().getMonthValue() != month) {
                continue;
            }
            if (a.getInTime() == null || a.getOutTime() == null) {
                continue;
            }
            minutes += Math.max(0, Duration.between(a.getInTime(), a.getOutTime()).toMinutes());
        }
        BigDecimal hours = BigDecimal.valueOf(minutes).divide(BigDecimal.valueOf(60), 4, RoundingMode.HALF_UP);
        return hours.multiply(hourlyRate).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal perBatchPay(UUID orgId, UUID facultyUserId, BigDecimal rate) {
        if (rate == null || rate.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        long batches = store.list(Batch.class, orgId).stream()
                .filter(b -> facultyUserId.equals(b.getFacultyUserId()))
                .count();
        return rate.multiply(BigDecimal.valueOf(batches)).setScale(2, RoundingMode.HALF_UP);
    }

    private CompensationPlan activePlan(UUID orgId, UUID employeeId) {
        return store.list(CompensationPlan.class, orgId).stream()
                .filter(p -> employeeId.equals(p.getEmployeeId()) && Boolean.TRUE.equals(p.getActive()))
                .filter(p -> p.getEffectiveFrom() == null || !p.getEffectiveFrom().isAfter(LocalDate.now()))
                .max(Comparator.comparing(CompensationPlan::getEffectiveFrom, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
    }

    private UUID counselorForStudent(UUID orgId, UUID studentId) {
        return store.list(Inquiry.class, orgId).stream()
                .filter(i -> studentId.equals(i.getStudentId()) && i.getCounselorUserId() != null)
                .map(Inquiry::getCounselorUserId)
                .findFirst()
                .orElse(null);
    }

    private Employee employeeByUser(UUID orgId, UUID userId) {
        return store.list(Employee.class, orgId).stream()
                .filter(e -> userId.equals(e.getUserId()))
                .findFirst()
                .orElse(null);
    }

    private boolean ledgerExists(UUID orgId, String sourceType, UUID sourceId) {
        if (sourceId == null) {
            return false;
        }
        return store.list(CommissionLedger.class, orgId).stream()
                .anyMatch(row -> sourceType.equals(row.getSourceType()) && sourceId.equals(row.getSourceId()));
    }

    private CommissionSettings settings() {
        return settings(orgId());
    }

    private CommissionSettings settings(UUID orgId) {
        return store.list(CommissionSettings.class, orgId).stream()
                .findFirst()
                .orElseGet(() -> {
                    CommissionSettings s = new CommissionSettings();
                    s.setOrganizationId(orgId);
                    return store.save(s);
                });
    }

    private Map<UUID, Employee> employeeMap(UUID orgId) {
        Map<UUID, Employee> map = new LinkedHashMap<>();
        for (Employee e : store.list(Employee.class, orgId)) {
            map.put(e.getId(), e);
        }
        return map;
    }

    private Map<String, Object> settingsMap(CommissionSettings s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("conversionFlat", s.getConversionFlat());
        out.put("feePercent", s.getFeePercent());
        out.put("enabled", s.getEnabled());
        return out;
    }

    private Map<String, Object> planView(CompensationPlan p, Employee e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", p.getId());
        out.put("employeeId", p.getEmployeeId());
        out.put("employeeName", e == null ? "" : e.getFullName());
        out.put("planType", p.getPlanType());
        out.put("rateAmount", p.getRateAmount());
        out.put("ratePercent", p.getRatePercent());
        out.put("effectiveFrom", p.getEffectiveFrom());
        out.put("active", p.getActive());
        return out;
    }

    private Map<String, Object> ledgerView(CommissionLedger row, Employee e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.getId());
        out.put("employeeId", row.getEmployeeId());
        out.put("employeeName", e == null ? "" : e.getFullName());
        out.put("sourceType", row.getSourceType());
        out.put("amount", row.getAmount());
        out.put("description", row.getDescription());
        out.put("periodYear", row.getPeriodYear());
        out.put("periodMonth", row.getPeriodMonth());
        out.put("status", row.getStatus());
        return out;
    }

    private void requireHr() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        Access.requirePackage(user, "GROWTH");
    }

    private UUID orgId() {
        return Auth.current().organizationId();
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static BigDecimal decimal(Object v) {
        if (v == null || String.valueOf(v).isBlank()) {
            return BigDecimal.ZERO;
        }
        return new BigDecimal(String.valueOf(v));
    }

    private static String str(Map<String, Object> body, String key, String fallback) {
        if (body == null || body.get(key) == null) {
            return fallback;
        }
        return String.valueOf(body.get(key));
    }

    private static UUID uuid(Map<String, Object> body, String key) {
        if (body == null || body.get(key) == null || String.valueOf(body.get(key)).isBlank()) {
            return null;
        }
        return UUID.fromString(String.valueOf(body.get(key)));
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }
}
