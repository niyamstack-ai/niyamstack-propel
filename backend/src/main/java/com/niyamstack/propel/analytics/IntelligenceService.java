package com.niyamstack.propel.analytics;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class IntelligenceService {
    private final Store store;
    private final AnalyticsService analytics;

    public IntelligenceService(Store store, AnalyticsService analytics) {
        this.store = store;
        this.analytics = analytics;
    }

    public List<Map<String, Object>> unifiedSearch(String query, int limit) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT, Roles.COUNSELOR, Roles.PLACEMENT_HEAD, Roles.FACULTY);
        Access.requirePackage(user, "GROWTH");
        String q = query == null ? "" : query.trim().toLowerCase();
        if (q.length() < 2) {
            return List.of();
        }
        UUID org = user.organizationId();
        int cap = Math.min(Math.max(limit, 1), 40);
        List<Map<String, Object>> hits = new ArrayList<>();

        for (Student s : store.list(Student.class, org)) {
            if (matches(q, s.getFullName(), s.getStudentCode(), s.getEmail(), s.getPhone())) {
                hits.add(hit("Students", s.getId(), s.getFullName(), blank(s.getStudentCode(), "Student"), "/people/students"));
            }
        }
        for (Inquiry inq : store.list(Inquiry.class, org)) {
            if (matches(q, inq.getFullName(), inq.getPhone(), inq.getEmail(), inq.getStage(), inq.getSource())) {
                hits.add(hit("CRM", inq.getId(), inq.getFullName(), blank(inq.getStage(), "Lead"), "/crm"));
            }
        }
        for (Employee e : store.list(Employee.class, org)) {
            if (matches(q, e.getFullName(), e.getEmployeeCode(), e.getEmail(), e.getDepartment())) {
                hits.add(hit("ESS", e.getId(), e.getFullName(), blank(e.getDepartment(), "Employee"), "/ess"));
            }
        }
        for (Invoice inv : store.list(Invoice.class, org)) {
            if (matches(q, inv.getInvoiceNo(), inv.getStatus(), inv.getBuyerName())) {
                hits.add(hit("Fees", inv.getId(), blank(inv.getInvoiceNo(), "Invoice"),
                        formatInr(inv.getAmount()) + " · " + blank(inv.getStatus(), ""), "/fees"));
            }
        }
        for (Application app : store.list(Application.class, org)) {
            Student student = store.list(Student.class, org).stream()
                    .filter(s -> s.getId().equals(app.getStudentId()))
                    .findFirst().orElse(null);
            if (student != null && matches(q, student.getFullName(), app.getStatus(), app.getCurrentRound())) {
                hits.add(hit("Placement", app.getId(), student.getFullName(),
                        blank(app.getStatus(), "Application"), "/placement"));
            }
        }
        for (Course c : store.list(Course.class, org)) {
            if (matches(q, c.getName(), c.getCode())) {
                hits.add(hit("Academics", c.getId(), c.getName(), blank(c.getCode(), "Course"), "/courses"));
            }
        }

        return hits.stream().limit(cap).toList();
    }

    public Map<String, Object> ownerHub(int days) {
        requireOwnerIntel();
        UUID org = orgId();
        Map<String, Object> scorecard = analytics.scorecard(days);
        Map<String, Object> funnel = analytics.funnelAnalytics(days);
        Map<String, Object> placement = analytics.placementOutcomes();

        long employees = store.list(Employee.class, org).stream()
                .filter(e -> "ACTIVE".equalsIgnoreCase(e.getStatus()) || e.getStatus() == null || e.getStatus().isBlank())
                .count();
        long batches = store.list(Batch.class, org).size();
        long openTickets = store.list(SupportTicket.class, org).stream()
                .filter(t -> "OPEN".equalsIgnoreCase(t.getStatus()))
                .count();
        long overdueInstallments = store.list(FeeInstallment.class, org).stream()
                .filter(i -> "DUE".equalsIgnoreCase(i.getStatus()))
                .filter(i -> i.getDueDate() != null && i.getDueDate().isBefore(LocalDate.now()))
                .count();
        BigDecimal payrollLastMonth = payrollCostForMonth(org, YearMonth.now().minusMonths(1));

        Map<String, Object> modules = new LinkedHashMap<>();
        modules.put("crm", Map.of(
                "inquiries", scorecard.get("inquiries"),
                "converted", scorecard.get("converted"),
                "conversionPct", scorecard.get("conversionPct"),
                "topSource", topName(funnel.get("bySource"))
        ));
        modules.put("fees", Map.of(
                "collected", scorecard.get("collected"),
                "outstanding", scorecard.get("outstanding"),
                "collectionPct", scorecard.get("collectionPct"),
                "overdueInstallments", overdueInstallments
        ));
        modules.put("academics", Map.of(
                "students", scorecard.get("students"),
                "batches", batches,
                "attendancePct", scorecard.get("attendancePct"),
                "avgReadiness", scorecard.get("avgReadiness")
        ));
        modules.put("placement", Map.of(
                "placementPct", placement.get("placementPct"),
                "placed", placement.get("placed"),
                "avgPackageLpa", placement.get("avgPackageLpa"),
                "applications", scorecard.get("applications")
        ));
        modules.put("people", Map.of(
                "employees", employees,
                "payrollLastMonth", payrollLastMonth,
                "atRisk", scorecard.get("atRisk"),
                "openTickets", openTickets
        ));

        List<Map<String, Object>> alerts = new ArrayList<>();
        if (((Number) scorecard.getOrDefault("atRisk", 0)).intValue() > 0) {
            alerts.add(alert("At-risk students", scorecard.get("atRisk") + " need follow-up", "/readiness"));
        }
        if (overdueInstallments > 0) {
            alerts.add(alert("Overdue fees", overdueInstallments + " installments past due", "/fees"));
        }
        if (((Number) scorecard.getOrDefault("collectionPct", 100)).intValue() < 70) {
            alerts.add(alert("Low collection", scorecard.get("collectionPct") + "% collected in period", "/analytics"));
        }
        if (openTickets > 0) {
            alerts.add(alert("Open tickets", openTickets + " support items", "/analytics"));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("modules", modules);
        out.put("alerts", alerts);
        out.put("scorecard", scorecard);
        return out;
    }

    public Map<String, Object> revenueForecast(int months) {
        requireOwnerIntel();
        UUID org = orgId();
        int horizon = Math.min(Math.max(months, 1), 12);
        YearMonth start = YearMonth.now();

        BigDecimal[] history = new BigDecimal[3];
        for (int i = 0; i < 3; i++) {
            YearMonth ym = start.minusMonths(i + 1);
            history[i] = collectedInMonth(org, ym);
        }
        BigDecimal avgMonthly = Arrays.stream(history)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(3), 2, RoundingMode.HALF_UP);

        List<Map<String, Object>> series = new ArrayList<>();
        BigDecimal scheduledTotal = BigDecimal.ZERO;
        for (int i = 0; i < horizon; i++) {
            YearMonth ym = start.plusMonths(i);
            BigDecimal scheduled = scheduledDueInMonth(org, ym);
            scheduledTotal = scheduledTotal.add(scheduled);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", ym.getMonthValue());
            row.put("year", ym.getYear());
            row.put("label", ym.toString());
            row.put("projectedCollection", avgMonthly);
            row.put("scheduledDue", scheduled);
            row.put("forecastTotal", avgMonthly.add(scheduled));
            series.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("months", horizon);
        out.put("avgMonthlyCollection", avgMonthly);
        out.put("scheduledPipeline", scheduledTotal);
        out.put("history", List.of(
                Map.of("month", start.minusMonths(3).toString(), "collected", history[2]),
                Map.of("month", start.minusMonths(2).toString(), "collected", history[1]),
                Map.of("month", start.minusMonths(1).toString(), "collected", history[0])
        ));
        out.put("series", series);
        return out;
    }

    public Map<String, Object> pnlSummary(int days) {
        requireOwnerIntel();
        UUID org = orgId();
        Instant from = days > 0 ? Instant.now().minus(days, ChronoUnit.DAYS) : Instant.EPOCH;

        BigDecimal revenue = store.list(Payment.class, org).stream()
                .filter(p -> p.getReceivedAt() == null || !p.getReceivedAt().isBefore(from))
                .filter(p -> "CAPTURED".equalsIgnoreCase(p.getStatus()))
                .map(Payment::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal payrollCost = store.list(Payslip.class, org).stream()
                .filter(p -> p.getPaidAt() != null && !p.getPaidAt().isBefore(from))
                .map(Payslip::getNet)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (payrollCost.signum() == 0) {
            payrollCost = store.list(Payslip.class, org).stream()
                    .filter(p -> "PUBLISHED".equalsIgnoreCase(p.getStatus()) || "PAID".equalsIgnoreCase(p.getStatus()))
                    .filter(p -> inPeriod(p.getPayYear(), p.getPayMonth(), from))
                    .map(Payslip::getNet)
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        BigDecimal commissionCost = store.list(CommissionLedger.class, org).stream()
                .filter(c -> "PAID".equalsIgnoreCase(c.getStatus()))
                .filter(c -> c.getUpdatedAt() != null && !c.getUpdatedAt().isBefore(from))
                .map(CommissionLedger::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalCost = payrollCost.add(commissionCost);
        BigDecimal margin = revenue.subtract(totalCost);
        int marginPct = revenue.signum() == 0 ? 0
                : margin.multiply(BigDecimal.valueOf(100)).divide(revenue, 0, RoundingMode.HALF_UP).intValue();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("revenue", revenue);
        out.put("payrollCost", payrollCost);
        out.put("commissionCost", commissionCost);
        out.put("totalCost", totalCost);
        out.put("margin", margin);
        out.put("marginPct", marginPct);
        return out;
    }

    private BigDecimal collectedInMonth(UUID org, YearMonth ym) {
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();
        Instant from = start.atStartOfDay(ZoneId.systemDefault()).toInstant();
        Instant to = end.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
        return store.list(Payment.class, org).stream()
                .filter(p -> p.getReceivedAt() != null && !p.getReceivedAt().isBefore(from) && p.getReceivedAt().isBefore(to))
                .filter(p -> "CAPTURED".equalsIgnoreCase(p.getStatus()))
                .map(Payment::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal scheduledDueInMonth(UUID org, YearMonth ym) {
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();
        return store.list(FeeInstallment.class, org).stream()
                .filter(i -> "DUE".equalsIgnoreCase(i.getStatus()))
                .filter(i -> i.getDueDate() != null && !i.getDueDate().isBefore(start) && !i.getDueDate().isAfter(end))
                .map(FeeInstallment::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal payrollCostForMonth(UUID org, YearMonth ym) {
        return store.list(Payslip.class, org).stream()
                .filter(p -> ym.getYear() == (p.getPayYear() == null ? 0 : p.getPayYear()))
                .filter(p -> ym.getMonthValue() == (p.getPayMonth() == null ? 0 : p.getPayMonth()))
                .map(Payslip::getNet)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private boolean inPeriod(Integer year, Integer month, Instant from) {
        if (year == null || month == null) {
            return false;
        }
        LocalDate start = LocalDate.of(year, month, 1);
        return !start.atStartOfDay(ZoneId.systemDefault()).toInstant().isBefore(from);
    }

    private String topName(Object bucket) {
        if (!(bucket instanceof List<?> rows) || rows.isEmpty()) {
            return "—";
        }
        Object first = rows.get(0);
        if (first instanceof Map<?, ?> map) {
            Object name = map.get("name");
            if (name == null) {
                name = map.get("course");
            }
            return name == null ? "—" : String.valueOf(name);
        }
        return "—";
    }

    private Map<String, Object> hit(String module, UUID id, String title, String subtitle, String path) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("module", module);
        row.put("id", id);
        row.put("title", title);
        row.put("subtitle", subtitle);
        row.put("path", path);
        return row;
    }

    private Map<String, Object> alert(String title, String detail, String path) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("title", title);
        row.put("detail", detail);
        row.put("path", path);
        return row;
    }

    private void requireOwnerIntel() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        Access.requirePackage(user, "GROWTH");
    }

    private UUID orgId() {
        return Auth.current().organizationId();
    }

    private static boolean matches(String q, String... fields) {
        for (String field : fields) {
            if (field != null && field.toLowerCase().contains(q)) {
                return true;
            }
        }
        return false;
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }

    private static String formatInr(BigDecimal amount) {
        if (amount == null) {
            return "₹0";
        }
        return "₹" + amount.setScale(0, RoundingMode.HALF_UP).toPlainString();
    }
}
