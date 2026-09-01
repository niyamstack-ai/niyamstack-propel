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
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AnalyticsService {
    private final Store store;

    public AnalyticsService(Store store) {
        this.store = store;
    }

    public Map<String, Object> scorecard(int days) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT, Roles.PLACEMENT_HEAD, Roles.COUNSELOR);
        Access.requirePackage(user, "GROWTH");
        UUID org = user.organizationId();
        Instant from = days > 0 ? Instant.now().minus(days, ChronoUnit.DAYS) : Instant.EPOCH;

        List<Inquiry> inquiries = store.list(Inquiry.class, org).stream()
                .filter(i -> i.getCreatedAt() == null || !i.getCreatedAt().isBefore(from))
                .toList();
        long converted = inquiries.stream().filter(i -> "CONVERTED".equals(i.getStage())).count();
        int conversionPct = inquiries.isEmpty() ? 0 : (int) (converted * 100 / inquiries.size());

        List<Invoice> invoices = store.list(Invoice.class, org).stream()
                .filter(i -> i.getCreatedAt() == null || !i.getCreatedAt().isBefore(from))
                .filter(i -> !"CANCELLED".equalsIgnoreCase(i.getStatus()))
                .toList();
        List<Payment> payments = store.list(Payment.class, org).stream()
                .filter(p -> p.getReceivedAt() == null || !p.getReceivedAt().isBefore(from))
                .filter(p -> "CAPTURED".equalsIgnoreCase(p.getStatus()) || "REFUNDED".equalsIgnoreCase(p.getStatus()))
                .toList();
        BigDecimal due = invoices.stream()
                .filter(i -> !"PAID".equalsIgnoreCase(i.getStatus()))
                .map(i -> nvl(i.getAmount()).subtract(nvl(i.getPaidAmount())).max(BigDecimal.ZERO))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal paid = payments.stream().map(Payment::getAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal total = paid.add(due);
        int collectionPct = total.signum() == 0 ? 0 : paid.multiply(BigDecimal.valueOf(100)).divide(total, 0, RoundingMode.HALF_UP).intValue();

        List<AttendanceRecord> attendance = store.list(AttendanceRecord.class, org).stream()
                .filter(a -> a.getSessionDate() != null && !a.getSessionDate().isBefore(LocalDate.now().minusDays(days > 0 ? days : 3650)))
                .toList();
        long presentMarks = attendance.stream()
                .filter(a -> "PRESENT".equalsIgnoreCase(a.getStatus()) || "LATE".equalsIgnoreCase(a.getStatus()))
                .count();
        int attendancePct = attendance.isEmpty() ? 0 : (int) Math.min(100, presentMarks * 100 / attendance.size());

        List<Student> students = store.list(Student.class, org);
        int readinessSum = 0;
        int readinessCount = 0;
        for (Student s : students) {
            if (!"ACTIVE".equalsIgnoreCase(s.getStatus()) && s.getStatus() != null && !s.getStatus().isBlank()) {
                continue;
            }
            readinessSum += readinessScore(org, s.getId());
            readinessCount++;
        }
        int avgReadiness = readinessCount == 0 ? 0 : readinessSum / readinessCount;

        Map<UUID, Application> appById = store.list(Application.class, org).stream()
                .collect(Collectors.toMap(Application::getId, a -> a, (a, b) -> a));
        long placed = store.list(Offer.class, org).stream()
                .filter(o -> "ACCEPTED".equalsIgnoreCase(o.getStatus()))
                .count();
        long eligible = students.stream()
                .filter(s -> "ACTIVE".equalsIgnoreCase(s.getStatus()) || s.getStatus() == null || s.getStatus().isBlank())
                .count();
        int placementPct = eligible == 0 ? 0 : (int) Math.min(100, placed * 100 / eligible);

        int atRisk = 0;
        for (Student s : students) {
            if (atRisk(org, s)) {
                atRisk++;
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("conversionPct", conversionPct);
        out.put("inquiries", inquiries.size());
        out.put("converted", converted);
        out.put("collectionPct", collectionPct);
        out.put("collected", paid);
        out.put("outstanding", due);
        out.put("attendancePct", attendancePct);
        out.put("attendanceMarked", attendance.size());
        out.put("avgReadiness", avgReadiness);
        out.put("readinessStudents", readinessCount);
        out.put("placementPct", placementPct);
        out.put("placed", placed);
        out.put("eligibleStudents", eligible);
        out.put("applications", appById.size());
        out.put("offers", store.list(Offer.class, org).size());
        out.put("atRisk", atRisk);
        out.put("students", students.size());
        return out;
    }

    public Map<String, Object> funnelAnalytics(int days) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.COUNSELOR, Roles.PLACEMENT_HEAD);
        Access.requirePackage(user, "GROWTH");
        UUID org = user.organizationId();
        Instant from = days > 0 ? Instant.now().minus(days, ChronoUnit.DAYS) : Instant.EPOCH;

        List<Inquiry> inquiries = store.list(Inquiry.class, org).stream()
                .filter(i -> i.getCreatedAt() == null || !i.getCreatedAt().isBefore(from))
                .toList();

        Map<String, Long> byStage = inquiries.stream()
                .collect(Collectors.groupingBy(i -> blank(i.getStage(), "NEW"), Collectors.counting()));

        Map<String, int[]> bySource = new LinkedHashMap<>();
        for (Inquiry inq : inquiries) {
            String key = blank(inq.getSource(), "UNKNOWN");
            int[] counts = bySource.computeIfAbsent(key, k -> new int[2]);
            counts[0]++;
            if ("CONVERTED".equals(inq.getStage())) {
                counts[1]++;
            }
        }

        Map<UUID, String> userNames = userNames(org);
        Map<UUID, String> landingNames = new HashMap<>();
        for (LandingPage lp : store.list(LandingPage.class, org)) {
            landingNames.put(lp.getId(), lp.getName());
        }

        Map<String, int[]> byCounselor = new LinkedHashMap<>();
        Map<String, int[]> byLanding = new LinkedHashMap<>();
        for (Inquiry inq : inquiries) {
            String counselor = inq.getCounselorUserId() == null
                    ? "Unassigned"
                    : userNames.getOrDefault(inq.getCounselorUserId(), "Counselor");
            int[] cCounts = byCounselor.computeIfAbsent(counselor, k -> new int[2]);
            cCounts[0]++;
            if ("CONVERTED".equals(inq.getStage())) {
                cCounts[1]++;
            }

            String landing = inq.getLandingPageId() == null
                    ? "Direct / walk-in"
                    : landingNames.getOrDefault(inq.getLandingPageId(), "Landing page");
            int[] lCounts = byLanding.computeIfAbsent(landing, k -> new int[2]);
            lCounts[0]++;
            if ("CONVERTED".equals(inq.getStage())) {
                lCounts[1]++;
            }
        }

        List<Map<String, Object>> campaigns = new ArrayList<>();
        for (Campaign camp : store.list(Campaign.class, org)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", camp.getName());
            row.put("status", camp.getStatus());
            row.put("sent", camp.getSentCount() == null ? 0 : camp.getSentCount());
            row.put("channel", camp.getChannel());
            campaigns.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("total", inquiries.size());
        out.put("converted", inquiries.stream().filter(i -> "CONVERTED".equals(i.getStage())).count());
        out.put("byStage", byStage);
        out.put("bySource", bucketRows(bySource));
        out.put("byCounselor", bucketRows(byCounselor));
        out.put("byLanding", bucketRows(byLanding));
        out.put("campaigns", campaigns);
        return out;
    }

    public Map<String, Object> placementOutcomes() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.COUNSELOR);
        Access.requirePackage(user, "GROWTH");
        UUID org = user.organizationId();

        Map<UUID, Student> students = store.list(Student.class, org).stream()
                .collect(Collectors.toMap(Student::getId, s -> s, (a, b) -> a));
        Map<UUID, String> courseNames = store.list(Course.class, org).stream()
                .collect(Collectors.toMap(Course::getId, Course::getName, (a, b) -> a));
        Map<UUID, Application> apps = store.list(Application.class, org).stream()
                .collect(Collectors.toMap(Application::getId, a -> a, (a, b) -> a));
        Map<UUID, Drive> drives = store.list(Drive.class, org).stream()
                .collect(Collectors.toMap(Drive::getId, d -> d, (a, b) -> a));
        Map<UUID, String> companyNames = store.list(Company.class, org).stream()
                .collect(Collectors.toMap(Company::getId, Company::getName, (a, b) -> a));

        List<Offer> offers = store.list(Offer.class, org);
        List<Offer> accepted = offers.stream()
                .filter(o -> "ACCEPTED".equalsIgnoreCase(o.getStatus()))
                .toList();

        BigDecimal pkgSum = accepted.stream()
                .map(Offer::getPackageLpa)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal avgLpa = accepted.isEmpty() ? BigDecimal.ZERO
                : pkgSum.divide(BigDecimal.valueOf(accepted.size()), 2, RoundingMode.HALF_UP);

        long eligible = students.values().stream()
                .filter(s -> "ACTIVE".equalsIgnoreCase(s.getStatus()) || s.getStatus() == null || s.getStatus().isBlank())
                .count();
        int placementPct = eligible == 0 ? 0 : (int) Math.min(100, accepted.size() * 100 / eligible);

        Map<String, int[]> byCourse = new LinkedHashMap<>();
        Map<String, BigDecimal[]> pkgByCourse = new LinkedHashMap<>();
        Map<String, int[]> byCompany = new LinkedHashMap<>();
        Map<String, BigDecimal[]> pkgByCompany = new LinkedHashMap<>();

        for (Offer offer : accepted) {
            Application app = offer.getApplicationId() == null ? null : apps.get(offer.getApplicationId());
            Student student = app == null || app.getStudentId() == null ? null : students.get(app.getStudentId());
            String course = student == null || student.getCourseId() == null
                    ? "Unassigned"
                    : courseNames.getOrDefault(student.getCourseId(), "Course");
            int[] c = byCourse.computeIfAbsent(course, k -> new int[2]);
            c[0]++;
            bumpPkg(pkgByCourse, course, offer.getPackageLpa());

            Drive drive = app == null || app.getDriveId() == null ? null : drives.get(app.getDriveId());
            String company = drive == null || drive.getCompanyId() == null
                    ? "Unknown"
                    : companyNames.getOrDefault(drive.getCompanyId(), "Company");
            int[] co = byCompany.computeIfAbsent(company, k -> new int[2]);
            co[0]++;
            bumpPkg(pkgByCompany, company, offer.getPackageLpa());
        }

        for (Student s : students.values()) {
            if (!"ACTIVE".equalsIgnoreCase(s.getStatus()) && s.getStatus() != null && !s.getStatus().isBlank()) {
                continue;
            }
            String course = s.getCourseId() == null ? "Unassigned" : courseNames.getOrDefault(s.getCourseId(), "Course");
            int[] c = byCourse.computeIfAbsent(course, k -> new int[2]);
            c[1]++;
        }

        Map<String, Long> appStatus = store.list(Application.class, org).stream()
                .collect(Collectors.groupingBy(a -> blank(a.getStatus(), "APPLIED"), Collectors.counting()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("eligibleStudents", eligible);
        out.put("placed", accepted.size());
        out.put("placementPct", placementPct);
        out.put("avgPackageLpa", avgLpa);
        out.put("offersTotal", offers.size());
        out.put("offersAccepted", accepted.size());
        out.put("offersPending", offers.stream().filter(o -> "OFFERED".equalsIgnoreCase(o.getStatus())).count());
        out.put("applicationStatus", appStatus);
        out.put("byCourse", courseRows(byCourse, pkgByCourse));
        out.put("byCompany", companyRows(byCompany, pkgByCompany));
        return out;
    }

    private List<Map<String, Object>> bucketRows(Map<String, int[]> raw) {
        List<Map<String, Object>> rows = new ArrayList<>();
        raw.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue()[0], a.getValue()[0]))
                .forEach(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", e.getKey());
                    row.put("leads", e.getValue()[0]);
                    row.put("converted", e.getValue()[1]);
                    row.put("conversionPct", e.getValue()[0] == 0 ? 0 : e.getValue()[1] * 100 / e.getValue()[0]);
                    rows.add(row);
                });
        return rows;
    }

    private List<Map<String, Object>> courseRows(Map<String, int[]> counts, Map<String, BigDecimal[]> pkgs) {
        List<Map<String, Object>> rows = new ArrayList<>();
        counts.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue()[0], a.getValue()[0]))
                .forEach(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("course", e.getKey());
                    row.put("placed", e.getValue()[0]);
                    row.put("students", e.getValue()[1]);
                    row.put("placementPct", e.getValue()[1] == 0 ? 0 : e.getValue()[0] * 100 / e.getValue()[1]);
                    BigDecimal[] pkg = pkgs.get(e.getKey());
                    row.put("avgPackageLpa", pkg == null || pkg[1].signum() == 0
                            ? BigDecimal.ZERO
                            : pkg[0].divide(pkg[1], 2, RoundingMode.HALF_UP));
                    rows.add(row);
                });
        return rows;
    }

    private List<Map<String, Object>> companyRows(Map<String, int[]> counts, Map<String, BigDecimal[]> pkgs) {
        List<Map<String, Object>> rows = new ArrayList<>();
        counts.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue()[0], a.getValue()[0]))
                .forEach(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("company", e.getKey());
                    row.put("offers", e.getValue()[0]);
                    BigDecimal[] pkg = pkgs.get(e.getKey());
                    row.put("avgPackageLpa", pkg == null || pkg[1].signum() == 0
                            ? BigDecimal.ZERO
                            : pkg[0].divide(pkg[1], 2, RoundingMode.HALF_UP));
                    rows.add(row);
                });
        return rows;
    }

    private void bumpPkg(Map<String, BigDecimal[]> map, String key, BigDecimal lpa) {
        if (lpa == null) {
            return;
        }
        BigDecimal[] pair = map.computeIfAbsent(key, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
        pair[0] = pair[0].add(lpa);
        pair[1] = pair[1].add(BigDecimal.ONE);
    }

    private Map<UUID, String> userNames(UUID org) {
        Map<UUID, String> names = new HashMap<>();
        for (AppUser u : store.listUsers(org)) {
            names.put(u.getId(), u.getFullName());
        }
        return names;
    }

    private int readinessScore(UUID org, UUID studentId) {
        List<AttendanceRecord> att = store.listBy(AttendanceRecord.class, org, "studentId", studentId);
        long present = att.stream().filter(a -> "PRESENT".equals(a.getStatus())).count();
        int attendance = att.isEmpty() ? 100 : (int) (present * 100 / att.size());
        int skills = store.listBy(Skill.class, org, "studentId", studentId).size() * 12;
        int mocks = store.listBy(MockInterview.class, org, "studentId", studentId).stream()
                .map(MockInterview::getScore).filter(Objects::nonNull).mapToInt(i -> i).max().orElse(0);
        List<Resume> resumes = store.listBy(Resume.class, org, "studentId", studentId);
        int resume = resumes.stream().map(Resume::getCompleteness).filter(Objects::nonNull).mapToInt(i -> i).max().orElse(40);
        return Math.min(100, (attendance * 25 + Math.min(skills, 100) * 25 + mocks * 25 + resume * 25) / 100);
    }

    private boolean atRisk(UUID org, Student student) {
        List<AttendanceRecord> att = store.listBy(AttendanceRecord.class, org, "studentId", student.getId());
        if (!att.isEmpty()) {
            long present = att.stream().filter(a -> "PRESENT".equals(a.getStatus())).count();
            int pct = (int) (present * 100 / att.size());
            if (att.size() >= 3 && pct < 75) {
                return true;
            }
        }
        List<Resume> resumes = store.listBy(Resume.class, org, "studentId", student.getId());
        int completeness = resumes.stream().map(Resume::getCompleteness).filter(Objects::nonNull).mapToInt(i -> i).max().orElse(0);
        if (resumes.isEmpty() || completeness < 40) {
            return true;
        }
        return store.listBy(ExamAttempt.class, org, "studentId", student.getId()).stream()
                .anyMatch(a -> a.getScore() != null && a.getMaxScore() != null && a.getMaxScore() > 0
                        && a.getScore() * 100 / a.getMaxScore() < 40
                        && a.getSubmittedAt() != null);
    }

    private static BigDecimal nvl(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }
}
