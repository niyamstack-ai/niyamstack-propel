package com.niyamstack.propel.compliance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.niyamstack.propel.audit.AuditService;
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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ComplianceService {
    private static final Set<String> DEFAULT_MASK = Set.of("email", "phone", "customJson");

    private final Store store;
    private final AuditService audit;
    private final ObjectMapper mapper = new ObjectMapper();

    public ComplianceService(Store store, AuditService audit) {
        this.store = store;
        this.audit = audit;
    }

    public Map<String, Object> hub() {
        requireCompliance();
        UUID org = orgId();
        Organization organization = store.get(Organization.class, org);
        Instant since = Instant.now().minus(30, ChronoUnit.DAYS);

        List<UsageEvent> usage = store.list(UsageEvent.class, org).stream()
                .filter(e -> e.getCreatedAt() != null && e.getCreatedAt().isAfter(since))
                .toList();
        Map<String, Long> byModule = usage.stream()
                .collect(Collectors.groupingBy(e -> blank(e.getModule(), "OTHER"), Collectors.counting()));

        long pendingDeletes = store.list(DataDeletionRequest.class, org).stream()
                .filter(r -> "PENDING".equalsIgnoreCase(r.getStatus()))
                .count();
        long openTickets = store.list(SupportTicket.class, org).stream()
                .filter(t -> !"CLOSED".equalsIgnoreCase(t.getStatus()) && !"RESOLVED".equalsIgnoreCase(t.getStatus()))
                .count();
        long exports = usage.stream().filter(e -> "EXPORT".equalsIgnoreCase(e.getAction())).count();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("packageTier", organization.getPackageTier());
        out.put("accessStatus", organization.getAccessStatus());
        out.put("paymentStatus", organization.getPaymentStatus());
        out.put("billingCycle", organization.getBillingCycle());
        out.put("dealAmount", organization.getDealAmount());
        out.put("exportsLast30Days", exports);
        out.put("pendingDeleteRequests", pendingDeletes);
        out.put("openSupportTickets", openTickets);
        out.put("usageByModule", byModule.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> Map.of("module", e.getKey(), "events", e.getValue()))
                .toList());
        out.put("releaseNotes", releaseNotes());
        out.put("maskedFields", DEFAULT_MASK);
        out.put("indiaDataResidency", organization.isIndiaDataResidency());
        out.put("dataMode", organization.getDataMode() == null ? "SHARED" : organization.getDataMode());
        return out;
    }

    public Map<String, Object> usageSummary() {
        requireCompliance();
        return Map.of("usageByModule", hub().get("usageByModule"));
    }

    public List<Map<String, Object>> releaseNotes() {
        requireCompliance();
        UUID org = orgId();
        List<TenantReleaseNote> notes = store.em().createQuery(
                        "select n from TenantReleaseNote n where n.organizationId is null or n.organizationId = :o order by n.publishedAt desc",
                        TenantReleaseNote.class)
                .setParameter("o", org)
                .setMaxResults(10)
                .getResultList();
        if (notes.isEmpty()) {
            return defaultReleaseNotes();
        }
        return notes.stream().map(this::noteView).toList();
    }

    @Transactional
    public Map<String, Object> exportSubject(UUID studentId) {
        requireCompliance();
        UUID org = orgId();
        Student student = store.getOwned(Student.class, studentId, org);
        recordUsage("COMPLIANCE", "SUBJECT_EXPORT");

        List<Invoice> invoices = store.list(Invoice.class, org).stream()
                .filter(i -> studentId.equals(i.getStudentId()))
                .toList();
        List<Application> applications = store.list(Application.class, org).stream()
                .filter(a -> studentId.equals(a.getStudentId()))
                .toList();
        List<AttendanceRecord> attendance = store.list(AttendanceRecord.class, org).stream()
                .filter(a -> studentId.equals(a.getStudentId()))
                .limit(200)
                .toList();
        List<StudentDocument> documents = store.list(StudentDocument.class, org).stream()
                .filter(d -> studentId.equals(d.getStudentId()))
                .toList();

        Map<String, Object> bundle = new LinkedHashMap<>();
        bundle.put("student", maskEntity(student));
        bundle.put("invoices", invoices.stream().map(this::maskEntity).toList());
        bundle.put("applications", applications.stream().map(this::maskEntity).toList());
        bundle.put("attendance", attendance);
        bundle.put("documents", documents.stream().map(this::maskEntity).toList());
        bundle.put("exportedAt", Instant.now().toString());

        audit.log("DATA_EXPORT", "Student", studentId, "Subject data bundle exported");
        return bundle;
    }

    @Transactional
    public Map<String, Object> requestDeletion(UUID studentId, String reason) {
        requireCompliance();
        PropelUser user = Auth.current();
        UUID org = orgId();
        Student student = store.getOwned(Student.class, studentId, org);

        boolean exists = store.list(DataDeletionRequest.class, org).stream()
                .anyMatch(r -> studentId.equals(r.getSubjectId()) && "PENDING".equalsIgnoreCase(r.getStatus()));
        if (exists) {
            throw new ApiException(HttpStatus.CONFLICT, "A pending deletion request already exists for this student");
        }

        DataDeletionRequest req = new DataDeletionRequest();
        req.setOrganizationId(org);
        req.setSubjectType("STUDENT");
        req.setSubjectId(studentId);
        req.setReason(blank(reason, "Owner requested erasure"));
        req.setRequestedBy(user.userId());
        req.setStatus("PENDING");
        req = store.save(req);

        recordUsage("COMPLIANCE", "DELETE_REQUEST");
        audit.log("DELETE_REQUEST", "Student", studentId, "Deletion requested: " + student.getFullName());
        return deletionView(req);
    }

    public List<Map<String, Object>> deletionRequests() {
        requireCompliance();
        return store.list(DataDeletionRequest.class, orgId()).stream()
                .sorted(Comparator.comparing(DataDeletionRequest::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::deletionView)
                .toList();
    }

    @Transactional
    public void recordUsage(String module, String action) {
        try {
            PropelUser user = Auth.current();
            UsageEvent event = new UsageEvent();
            event.setOrganizationId(user.organizationId());
            event.setModule(module);
            event.setAction(action);
            event.setActorUserId(user.userId());
            store.save(event);
        } catch (Exception ignored) {
            /* public or system paths */
        }
    }

    public List<Map<String, Object>> maskedExport(String resource, Set<String> maskFields) {
        requireCompliance();
        UUID org = orgId();
        Set<String> mask = maskFields == null || maskFields.isEmpty() ? DEFAULT_MASK : maskFields;
        List<?> rows = switch (resource.toLowerCase()) {
            case "students" -> store.list(Student.class, org);
            case "invoices" -> store.list(Invoice.class, org);
            case "applications" -> store.list(Application.class, org);
            case "inquiries" -> store.list(Inquiry.class, org);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown export resource");
        };
        recordUsage("COMPLIANCE", "EXPORT");
        audit.log("DATA_EXPORT", resource, null, "Masked export (" + mask.size() + " fields)");
        return rows.stream().map(row -> maskEntity(row, mask)).toList();
    }

    private Map<String, Object> maskEntity(Object entity) {
        return maskEntity(entity, DEFAULT_MASK);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> maskEntity(Object entity, Set<String> maskFields) {
        Map<String, Object> map = mapper.convertValue(entity, Map.class);
        for (String key : new ArrayList<>(map.keySet())) {
            if (maskFields.contains(key) && map.get(key) != null) {
                map.put(key, maskValue(String.valueOf(map.get(key))));
            }
        }
        return map;
    }

    private static String maskValue(String value) {
        if (value == null || value.length() < 4) {
            return "***";
        }
        return value.substring(0, 2) + "****" + value.substring(value.length() - 2);
    }

    private Map<String, Object> deletionView(DataDeletionRequest req) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", req.getId());
        row.put("subjectType", req.getSubjectType());
        row.put("subjectId", req.getSubjectId());
        row.put("status", req.getStatus());
        row.put("reason", req.getReason());
        row.put("requestedAt", req.getCreatedAt());
        return row;
    }

    private Map<String, Object> noteView(TenantReleaseNote note) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("version", note.getVersion());
        row.put("title", note.getTitle());
        row.put("body", note.getBody());
        row.put("publishedAt", note.getPublishedAt());
        return row;
    }

    private List<Map<String, Object>> defaultReleaseNotes() {
        return List.of(
                Map.of(
                        "version", "1.10",
                        "title", "Compliance & trust hub",
                        "body", "Subject data export, deletion requests, masked exports, usage metering, and release notes.",
                        "publishedAt", Instant.now().minus(1, ChronoUnit.DAYS).toString()
                ),
                Map.of(
                        "version", "1.9",
                        "title", "Enterprise tier",
                        "body", "Workflow builder v2, AI suite, SCORM/LTI gates, accreditation dashboard, and offline sync.",
                        "publishedAt", Instant.now().minus(14, ChronoUnit.DAYS).toString()
                )
        );
    }

    private void requireCompliance() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
    }

    private UUID orgId() {
        return Auth.current().organizationId();
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v.trim();
    }
}
