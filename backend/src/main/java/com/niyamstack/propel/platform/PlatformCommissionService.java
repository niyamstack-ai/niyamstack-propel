package com.niyamstack.propel.platform;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Course;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.domain.Model.PlatformCommission;
import com.niyamstack.propel.domain.Model.PlatformRole;
import com.niyamstack.propel.domain.Model.PlatformUserRole;
import com.niyamstack.propel.domain.Model.SettlementEntry;
import com.niyamstack.propel.domain.Model.Student;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class PlatformCommissionService {
    private static final Set<String> ONLINE_SOURCES = Set.of(
            "WEBSITE", "STOREFRONT", "CHECKOUT", "PUBLIC", "DEMO", "GATEWAY");

    private final Store store;
    private final SettlementService settlements;
    private final AuditService audit;

    public PlatformCommissionService(Store store, SettlementService settlements, AuditService audit) {
        this.store = store;
        this.settlements = settlements;
        this.audit = audit;
    }

    /**
     * Record a platform commission note when a course is allotted offline.
     * Deduped per student+course. Skips online checkout sources and when gateway settlement already covers.
     */
    @Transactional
    public PlatformCommission recordAllotment(UUID orgId, UUID studentId, UUID courseId, String source) {
        if (orgId == null || studentId == null || courseId == null) {
            return null;
        }
        if (isOnlineSource(source)) {
            return null;
        }
        boolean already = store.listBy(PlatformCommission.class, orgId, "studentId", studentId).stream()
                .anyMatch(n -> courseId.equals(n.getCourseId()));
        if (already) {
            return null;
        }
        if (coveredByGateway(orgId, studentId, courseId)) {
            return null;
        }
        Organization org = store.get(Organization.class, orgId);
        Course course = store.getOwned(Course.class, courseId, orgId);
        BigDecimal list = course.getFees() == null ? BigDecimal.ZERO : course.getFees();
        if (list.signum() <= 0) {
            return null;
        }
        BigDecimal pct = settlements.feePercent(org);
        if (pct.signum() <= 0) {
            return null;
        }
        BigDecimal fee = list.multiply(pct).setScale(2, RoundingMode.HALF_UP);
        if (fee.signum() == 0) {
            fee = new BigDecimal("0.01");
        }
        PlatformCommission note = new PlatformCommission();
        note.setOrganizationId(orgId);
        note.setStudentId(studentId);
        note.setCourseId(courseId);
        note.setCourseName(course.getName());
        note.setCourseFees(list.setScale(2, RoundingMode.HALF_UP));
        note.setPlatformFeePercent(pct);
        note.setPlatformFeeAmount(fee);
        note.setStatus("PENDING");
        note.setSource(source == null || source.isBlank() ? "OWNER" : source.trim().toUpperCase(Locale.ROOT));
        note = store.save(note);
        audit.log("PLATFORM_COMMISSION_CREATE", "PlatformCommission", note.getId(),
                org.getName() + " · " + fee);
        return note;
    }

    public Map<String, Object> summary(UUID orgId) {
        List<PlatformCommission> notes = store.list(PlatformCommission.class, orgId);
        BigDecimal pending = BigDecimal.ZERO;
        BigDecimal received = BigDecimal.ZERO;
        int pendingCount = 0;
        int receivedCount = 0;
        for (PlatformCommission n : notes) {
            BigDecimal amt = n.getPlatformFeeAmount() == null ? BigDecimal.ZERO : n.getPlatformFeeAmount();
            if ("RECEIVED".equalsIgnoreCase(n.getStatus())) {
                received = received.add(amt);
                receivedCount++;
            } else if (!"WAIVED".equalsIgnoreCase(n.getStatus()) && !"COVERED_ONLINE".equalsIgnoreCase(n.getStatus())) {
                pending = pending.add(amt);
                pendingCount++;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("offlineCommissionPending", pending);
        out.put("offlineCommissionPendingCount", pendingCount);
        out.put("offlineCommissionReceived", received);
        out.put("offlineCommissionReceivedCount", receivedCount);
        return out;
    }

    public List<Map<String, Object>> listForInstitute(UUID orgId) {
        requireFinanceOrMarkPaid();
        Organization org = store.get(Organization.class, orgId);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (PlatformCommission n : store.list(PlatformCommission.class, orgId)) {
            rows.add(toView(n, org));
        }
        rows.sort((a, b) -> String.valueOf(b.get("createdAt")).compareTo(String.valueOf(a.get("createdAt"))));
        return rows;
    }

    @Transactional
    public Map<String, Object> markReceived(UUID noteId) {
        requireFinanceOrMarkPaid();
        PlatformCommission note = store.get(PlatformCommission.class, noteId);
        if ("RECEIVED".equalsIgnoreCase(note.getStatus())) {
            Organization org = store.get(Organization.class, note.getOrganizationId());
            return toView(note, org);
        }
        note.setStatus("RECEIVED");
        note.setReceivedAt(Instant.now());
        note = store.save(note);
        Organization org = store.get(Organization.class, note.getOrganizationId());
        audit.log("PLATFORM_COMMISSION_RECEIVED", "PlatformCommission", note.getId(),
                org.getName() + " · " + note.getPlatformFeeAmount());
        return toView(note, org);
    }

    private Map<String, Object> toView(PlatformCommission n, Organization org) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", n.getId());
        row.put("organizationId", org.getId());
        row.put("organizationName", org.getName());
        row.put("studentId", n.getStudentId());
        Student student = findStudent(n.getStudentId());
        row.put("studentName", student == null ? null : student.getFullName());
        row.put("studentCode", student == null ? null : student.getStudentCode());
        row.put("courseId", n.getCourseId());
        row.put("courseName", n.getCourseName());
        row.put("courseFees", n.getCourseFees());
        row.put("platformFeePercent", n.getPlatformFeePercent());
        row.put("platformFeeAmount", n.getPlatformFeeAmount());
        row.put("status", n.getStatus());
        row.put("source", n.getSource());
        row.put("receivedAt", n.getReceivedAt());
        row.put("createdAt", n.getCreatedAt());
        row.put("notes", n.getNotes());
        return row;
    }

    private Student findStudent(UUID studentId) {
        if (studentId == null) {
            return null;
        }
        try {
            return store.get(Student.class, studentId);
        } catch (ApiException ex) {
            return null;
        }
    }

    private boolean coveredByGateway(UUID orgId, UUID studentId, UUID courseId) {
        return store.listBy(SettlementEntry.class, orgId, "studentId", studentId).stream()
                .anyMatch(e -> courseId.equals(e.getCourseId())
                        && e.getGrossAmount() != null
                        && e.getGrossAmount().signum() > 0
                        && (e.getNotes() == null || !e.getNotes().startsWith("refund:")));
    }

    private void requireFinanceOrMarkPaid() {
        Access.requirePlatform(Auth.current());
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        List<String> caps = capsForUser(user);
        if (!caps.contains(PlatformCaps.VIEW_SETTLEMENTS)
                && !caps.contains(PlatformCaps.MARK_PAID)
                && !caps.contains(PlatformCaps.MANAGE_RIGHTS)
                && !caps.contains(PlatformCaps.VIEW_INSTITUTES)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This role cannot view offline commissions");
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

    private static boolean isOnlineSource(String source) {
        if (source == null || source.isBlank()) {
            return false;
        }
        return ONLINE_SOURCES.contains(source.trim().toUpperCase(Locale.ROOT));
    }
}
