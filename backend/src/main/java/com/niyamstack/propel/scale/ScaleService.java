package com.niyamstack.propel.scale;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.integration.MessagingGateway;
import com.niyamstack.propel.integration.OrgSecrets;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class ScaleService {
    private final Store store;
    private final MessagingGateway messaging;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    public ScaleService(Store store, MessagingGateway messaging) {
        this.store = store;
        this.messaging = messaging;
    }

    public Map<String, Object> mobileHome() {
        PropelUser user = Auth.current();
        Access.requireTenant(user);
        UUID org = user.organizationId();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("role", user.role());
        out.put("name", user.name());
        if (Roles.STUDENT.equals(user.role()) || Roles.PARENT.equals(user.role())) {
            List<Student> mine = Roles.STUDENT.equals(user.role())
                    ? store.listBy(Student.class, org, "userId", user.userId())
                    : store.list(Student.class, org);
            Student me = mine.isEmpty() ? null : mine.getFirst();
            out.put("student", me);
            if (me != null) {
                out.put("attendance", store.listBy(AttendanceRecord.class, org, "studentId", me.getId()).stream().limit(12).toList());
                out.put("invoices", store.listBy(Invoice.class, org, "studentId", me.getId()).stream()
                        .filter(i -> !"PAID".equals(i.getStatus())).toList());
            } else {
                out.put("attendance", List.of());
                out.put("invoices", List.of());
            }
            out.put("notices", store.list(Announcement.class, org).stream().limit(10).toList());
            out.put("content", store.list(ContentItem.class, org).stream().filter(ContentItem::isPublished).limit(12).toList());
            out.put("drives", store.list(Drive.class, org).stream().filter(d -> "OPEN".equals(d.getStatus())).toList());
        } else {
            out.put("batches", store.list(Batch.class, org));
            out.put("submissions", store.list(Submission.class, org).stream()
                    .filter(s -> s.getGrade() == null || s.getGrade().isBlank()).limit(20).toList());
            out.put("live", store.list(LiveSession.class, org).stream().limit(8).toList());
            out.put("students", store.list(Student.class, org).stream().limit(80).toList());
        }
        return out;
    }

    public List<Map<String, Object>> datasets() {
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.ACCOUNTANT, Roles.PLACEMENT_HEAD, Roles.FACULTY, Roles.COUNSELOR);
        return List.of(
                Map.of("id", "students", "label", "Students", "columns", List.of("fullName", "studentCode", "status", "email", "phone")),
                Map.of("id", "invoices", "label", "Invoices", "columns", List.of("invoiceNo", "amount", "status", "student")),
                Map.of("id", "attendance", "label", "Attendance", "columns", List.of("sessionDate", "status", "student")),
                Map.of("id", "applications", "label", "Applications", "columns", List.of("status", "currentRound", "student"))
        );
    }

    @Transactional
    public ReportDefinition saveReport(Map<String, String> body) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT, Roles.PLACEMENT_HEAD);
        Access.requirePackage(user, "GROWTH");
        String name = str(body, "name");
        String dataset = str(body, "dataset").toLowerCase();
        if (name.isBlank() || dataset.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name and dataset are required");
        }
        if (!Set.of("students", "invoices", "attendance", "applications").contains(dataset)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown dataset");
        }
        ReportDefinition row = new ReportDefinition();
        row.setOrganizationId(user.organizationId());
        row.setName(name);
        row.setDataset(dataset);
        row.setColumnsCsv(blank(str(body, "columnsCsv"), "fullName,status"));
        row.setFiltersJson(str(body, "filtersJson"));
        row.setCreatedBy(user.userId());
        return store.save(row);
    }

    public Map<String, Object> runReport(UUID id) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT, Roles.PLACEMENT_HEAD, Roles.FACULTY);
        ReportDefinition def = store.getOwned(ReportDefinition.class, id, user.organizationId());
        return run(def);
    }

    @Transactional
    public ScheduledReport schedule(UUID reportId, Map<String, String> body) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER);
        Access.requirePackage(user, "GROWTH");
        ReportDefinition def = store.getOwned(ReportDefinition.class, reportId, user.organizationId());
        String cadence = blank(str(body, "cadence"), "WEEKLY").toUpperCase();
        if (!Set.of("WEEKLY", "MONTHLY").contains(cadence)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Use weekly or monthly");
        }
        String email = str(body, "emailTo");
        if (email.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Email is required");
        }
        ScheduledReport row = new ScheduledReport();
        row.setOrganizationId(user.organizationId());
        row.setReportId(def.getId());
        row.setCadence(cadence);
        row.setEmailTo(email);
        row.setEnabled(true);
        row.setNextRunAt(Instant.now());
        return store.save(row);
    }

    @Transactional
    public Map<String, Object> sendReport(UUID reportId) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER);
        ReportDefinition def = store.getOwned(ReportDefinition.class, reportId, user.organizationId());
        String to = store.list(ScheduledReport.class, user.organizationId()).stream()
                .filter(s -> reportId.equals(s.getReportId()))
                .map(ScheduledReport::getEmailTo)
                .filter(e -> e != null && !e.isBlank())
                .findFirst()
                .orElse(user.email());
        return emailReport(def, to);
    }

    @Transactional
    public int runDueReports() {
        Instant now = Instant.now();
        List<ScheduledReport> due = store.em().createQuery(
                        "select s from ScheduledReport s where s.enabled = true and (s.nextRunAt is null or s.nextRunAt <= :n)",
                        ScheduledReport.class)
                .setParameter("n", now)
                .setMaxResults(100)
                .getResultList();
        int sent = 0;
        for (ScheduledReport row : due) {
            try {
                ReportDefinition def = store.getOwned(ReportDefinition.class, row.getReportId(), row.getOrganizationId());
                Map<String, Object> result = emailReport(def, row.getEmailTo());
                row.setLastRunAt(now);
                row.setLastStatus(String.valueOf(result.getOrDefault("status", "SENT")));
                row.setNextRunAt("MONTHLY".equals(row.getCadence()) ? now.plus(Duration.ofDays(30)) : now.plus(Duration.ofDays(7)));
                store.save(row);
                sent++;
            } catch (Exception e) {
                row.setLastStatus("FAILED");
                row.setNextRunAt(now.plus(Duration.ofHours(6)));
                store.save(row);
            }
        }
        return sent;
    }

    public List<Map<String, Object>> facultyPerformance() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.FACULTY);
        Access.requirePackage(user, "GROWTH");
        UUID org = user.organizationId();
        List<Map<String, Object>> out = new ArrayList<>();
        for (AppUser faculty : store.listUsers(org)) {
            if (!Set.of(Roles.FACULTY, Roles.OWNER).contains(faculty.getRole())) {
                continue;
            }
            List<Batch> batches = store.list(Batch.class, org).stream()
                    .filter(b -> faculty.getId().equals(b.getFacultyUserId()))
                    .toList();
            Set<UUID> batchIds = batches.stream().map(Batch::getId).collect(java.util.stream.Collectors.toSet());
            Set<UUID> courseIds = batches.stream().map(Batch::getCourseId).filter(java.util.Objects::nonNull).collect(java.util.stream.Collectors.toSet());
            long content = store.list(ContentItem.class, org).stream()
                    .filter(c -> c.getCourseId() != null && courseIds.contains(c.getCourseId()) && c.isPublished())
                    .count();
            List<AttendanceRecord> att = store.list(AttendanceRecord.class, org).stream()
                    .filter(a -> a.getBatchId() != null && batchIds.contains(a.getBatchId()))
                    .toList();
            long present = att.stream().filter(a -> "PRESENT".equals(a.getStatus())).count();
            int presentPct = att.isEmpty() ? 0 : (int) (present * 100 / att.size());
            long graded = store.list(Submission.class, org).stream()
                    .filter(s -> s.getGrade() != null && !s.getGrade().isBlank())
                    .count();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("userId", faculty.getId());
            row.put("fullName", faculty.getFullName());
            row.put("batches", batches.size());
            row.put("contentPublished", content);
            row.put("attendanceMarked", att.size());
            row.put("presentPct", presentPct);
            row.put("graded", graded);
            out.add(row);
        }
        return out;
    }

    @Transactional
    public XapiStatement recordXapi(Map<String, String> body) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.FACULTY, Roles.STUDENT);
        XapiStatement row = new XapiStatement();
        row.setOrganizationId(user.organizationId());
        UUID studentId = uuid(body, "studentId");
        if (Roles.STUDENT.equals(user.role())) {
            Student me = store.listBy(Student.class, user.organizationId(), "userId", user.userId()).stream().findFirst()
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "No student profile"));
            studentId = me.getId();
        }
        if (studentId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a student");
        }
        store.getOwned(Student.class, studentId, user.organizationId());
        row.setStudentId(studentId);
        row.setCourseId(uuid(body, "courseId"));
        row.setVerb(blank(str(body, "verb"), "experienced").toLowerCase());
        row.setObjectId(blank(str(body, "objectId"), "activity"));
        row.setResultJson(str(body, "resultJson"));
        row.setStatementAt(Instant.now());
        return store.save(row);
    }

    public List<Map<String, Object>> learningOutcomes() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.FACULTY);
        UUID org = user.organizationId();
        Map<UUID, int[]> byCourse = new LinkedHashMap<>();
        for (XapiStatement s : store.list(XapiStatement.class, org)) {
            UUID courseId = s.getCourseId() == null ? UUID.fromString("00000000-0000-0000-0000-000000000000") : s.getCourseId();
            byCourse.computeIfAbsent(courseId, k -> new int[]{0, 0, 0});
            int[] n = byCourse.get(courseId);
            n[0]++;
            if ("completed".equalsIgnoreCase(s.getVerb()) || "passed".equalsIgnoreCase(s.getVerb())) {
                n[1]++;
            }
            if ("failed".equalsIgnoreCase(s.getVerb())) {
                n[2]++;
            }
        }
        for (ExamAttempt a : store.list(ExamAttempt.class, org)) {
            if (a.getSubmittedAt() == null) {
                continue;
            }
            Assessment exam;
            try {
                exam = store.getOwned(Assessment.class, a.getAssessmentId(), org);
            } catch (Exception e) {
                continue;
            }
            UUID courseId = exam.getCourseId() == null ? UUID.fromString("00000000-0000-0000-0000-000000000000") : exam.getCourseId();
            byCourse.computeIfAbsent(courseId, k -> new int[]{0, 0, 0});
            int[] n = byCourse.get(courseId);
            n[0]++;
            boolean pass = a.getScore() != null && a.getMaxScore() != null && a.getMaxScore() > 0
                    && a.getScore() * 100 / a.getMaxScore() >= 40;
            if (pass) {
                n[1]++;
            } else {
                n[2]++;
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<UUID, int[]> e : byCourse.entrySet()) {
            String courseName = "Unassigned";
            if (!e.getKey().toString().startsWith("00000000")) {
                try {
                    courseName = store.getOwned(Course.class, e.getKey(), org).getName();
                } catch (Exception ignored) {
                    courseName = "Course";
                }
            }
            int[] n = e.getValue();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("courseId", e.getKey().toString().startsWith("00000000") ? "" : e.getKey());
            row.put("course", courseName);
            row.put("activities", n[0]);
            row.put("completed", n[1]);
            row.put("failed", n[2]);
            row.put("completionPct", n[0] == 0 ? 0 : n[1] * 100 / n[0]);
            out.add(row);
        }
        return out;
    }

    public Map<String, Object> ltiLaunch(UUID packageId) {
        PropelUser user = Auth.current();
        LmsPackage pkg = store.getOwned(LmsPackage.class, packageId, user.organizationId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("standard", pkg.getStandard());
        out.put("launchUrl", pkg.getLaunchUrl());
        out.put("iss", "niyamstack-propel");
        out.put("loginHint", user.userId());
        out.put("version", pkg.getVersionLabel());
        return out;
    }

    @Transactional
    public AccreditationFolder saveFolder(Map<String, String> body) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER);
        AccreditationFolder folder = new AccreditationFolder();
        folder.setOrganizationId(user.organizationId());
        folder.setFramework(blank(str(body, "framework"), "NAAC").toUpperCase());
        folder.setTitle(blank(str(body, "title"), folder.getFramework() + " evidence"));
        folder.setStatus("OPEN");
        return store.save(folder);
    }

    @Transactional
    public AccreditationEvidence saveEvidence(Map<String, String> body) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER);
        UUID folderId = uuid(body, "folderId");
        if (folderId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a folder");
        }
        store.getOwned(AccreditationFolder.class, folderId, user.organizationId());
        AccreditationEvidence row = new AccreditationEvidence();
        row.setOrganizationId(user.organizationId());
        row.setFolderId(folderId);
        row.setTitle(blank(str(body, "title"), "Evidence"));
        row.setFileUrl(str(body, "fileUrl"));
        row.setNote(str(body, "note"));
        row.setStatus("DRAFT");
        return store.save(row);
    }

    @Transactional
    public AccreditationEvidence submitEvidence(UUID id) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER);
        AccreditationEvidence row = store.getOwned(AccreditationEvidence.class, id, user.organizationId());
        ApprovalRequest req = new ApprovalRequest();
        req.setOrganizationId(user.organizationId());
        req.setKind("ACCREDITATION");
        req.setStatus("PENDING");
        req.setNote(row.getTitle());
        req.setRequestedBy(user.userId());
        req.setPayloadJson("{\"evidenceId\":\"" + row.getId() + "\"}");
        req = store.save(req);
        row.setApprovalRequestId(req.getId());
        row.setStatus("SUBMITTED");
        return store.save(row);
    }

    public Map<String, Object> aiStatus() {
        Organization org = store.get(Organization.class, Auth.current().organizationId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", OrgSecrets.has(org, "openaiApiKey"));
        out.put("provider", OrgSecrets.has(org, "openaiApiKey") ? "openai" : "none");
        return out;
    }

    public Map<String, String> aiCoach(Map<String, String> body) {
        return Map.of("answer", complete("You are an academic and placement coach for an Indian coaching institute.",
                blank(str(body, "question"), "How do I get placement ready this month?")));
    }

    public Map<String, String> aiResume(Map<String, String> body) {
        return Map.of("suggestion", complete("You rewrite student resumes for campus placement in India. Be concrete.",
                blank(str(body, "content"), "Improve this resume for a Java developer role.")));
    }

    public Map<String, Object> aiCareer(Map<String, String> body) {
        String text = complete("You map coaching-institute students to IT career paths in India.",
                blank(str(body, "question"), "Suggest a career path after Java full stack."));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("path", text);
        out.put("skills", List.of("Spring Boot", "SQL", "DSA"));
        out.put("matches", List.of("SDE-1", "QA automation", "Backend intern"));
        return out;
    }

    @Transactional
    public Map<String, Object> syncOffline(Map<String, Object> body) {
        PropelUser user = Auth.current();
        Access.requireTenant(user);
        Object raw = body == null ? List.of() : body.get("events");
        if (!(raw instanceof List<?> events)) {
            return Map.of("applied", 0);
        }
        int applied = 0;
        for (Object item : events) {
            if (!(item instanceof Map<?, ?> ev)) {
                continue;
            }
            String type = mapStr(ev, "type", "").toUpperCase();
            try {
                if ("ATTENDANCE".equals(type)) {
                    AttendanceRecord row = new AttendanceRecord();
                    row.setOrganizationId(user.organizationId());
                    String sid = mapStr(ev, "studentId", "");
                    if (!sid.isBlank()) {
                        row.setStudentId(UUID.fromString(sid));
                    }
                    String bid = mapStr(ev, "batchId", "");
                    if (!bid.isBlank()) {
                        row.setBatchId(UUID.fromString(bid));
                    }
                    String day = mapStr(ev, "sessionDate", LocalDate.now().toString());
                    row.setSessionDate(LocalDate.parse(day.length() >= 10 ? day.substring(0, 10) : LocalDate.now().toString()));
                    row.setStatus(mapStr(ev, "status", "PRESENT"));
                    row.setSource("OFFLINE");
                    store.save(row);
                    applied++;
                } else if ("NOTICE".equals(type)) {
                    Announcement n = new Announcement();
                    n.setOrganizationId(user.organizationId());
                    n.setTitle(mapStr(ev, "title", "Notice"));
                    n.setBody(mapStr(ev, "body", ""));
                    store.save(n);
                    applied++;
                }
            } catch (Exception ignored) {
                /* skip bad queued rows */
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("applied", applied);
        out.put("queued", events.size());
        return out;
    }

    private Map<String, Object> run(ReportDefinition def) {
        UUID org = def.getOrganizationId();
        String csv = def.getColumnsCsv() == null || def.getColumnsCsv().isBlank() ? "fullName" : def.getColumnsCsv();
        List<String> columns = java.util.Arrays.stream(csv.split("\\s*,\\s*")).toList();
        List<List<String>> rows = new ArrayList<>();
        switch (def.getDataset()) {
            case "invoices" -> {
                Map<UUID, String> names = studentNames(org);
                for (Invoice i : store.list(Invoice.class, org)) {
                    rows.add(List.of(
                            blank(i.getInvoiceNo()),
                            i.getAmount() == null ? "0" : i.getAmount().toPlainString(),
                            blank(i.getStatus()),
                            names.getOrDefault(i.getStudentId(), "")));
                }
                columns = List.of("invoiceNo", "amount", "status", "student");
            }
            case "attendance" -> {
                Map<UUID, String> names = studentNames(org);
                for (AttendanceRecord a : store.list(AttendanceRecord.class, org)) {
                    rows.add(List.of(
                            a.getSessionDate() == null ? "" : a.getSessionDate().toString(),
                            blank(a.getStatus()),
                            names.getOrDefault(a.getStudentId(), "")));
                }
                columns = List.of("sessionDate", "status", "student");
            }
            case "applications" -> {
                Map<UUID, String> names = studentNames(org);
                for (Application a : store.list(Application.class, org)) {
                    rows.add(List.of(blank(a.getStatus()), blank(a.getCurrentRound()), names.getOrDefault(a.getStudentId(), "")));
                }
                columns = List.of("status", "currentRound", "student");
            }
            default -> {
                for (Student s : store.list(Student.class, org)) {
                    rows.add(List.of(blank(s.getFullName()), blank(s.getStudentCode()), blank(s.getStatus()),
                            blank(s.getEmail()), blank(s.getPhone())));
                }
                columns = List.of("fullName", "studentCode", "status", "email", "phone");
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", def.getId());
        out.put("name", def.getName());
        out.put("dataset", def.getDataset());
        out.put("columns", columns);
        out.put("rows", rows);
        return out;
    }

    private Map<String, Object> emailReport(ReportDefinition def, String to) {
        Map<String, Object> data = run(def);
        @SuppressWarnings("unchecked")
        List<String> columns = (List<String>) data.get("columns");
        @SuppressWarnings("unchecked")
        List<List<String>> rows = (List<List<String>>) data.get("rows");
        StringBuilder csv = new StringBuilder(String.join(",", columns)).append('\n');
        for (List<String> row : rows) {
            csv.append(String.join(",", row.stream().map(v -> v.replace(",", " ")).toList())).append('\n');
        }
        var result = messaging.send(def.getOrganizationId(), "EMAIL", to, "Report: " + def.getName(), csv.toString());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", result.status());
        out.put("detail", result.message());
        out.put("to", to);
        out.put("rows", rows.size());
        return out;
    }

    private Map<UUID, String> studentNames(UUID org) {
        Map<UUID, String> names = new LinkedHashMap<>();
        for (Student s : store.list(Student.class, org)) {
            names.put(s.getId(), s.getFullName());
        }
        return names;
    }

    private String complete(String system, String prompt) {
        Organization org = store.get(Organization.class, Auth.current().organizationId());
        String key = OrgSecrets.live(org, "openaiApiKey");
        if (key.isBlank()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "AI is not configured for this institute");
        }
        String base = OrgSecrets.live(org, "openaiBaseUrl");
        if (base.isBlank()) {
            base = "https://api.openai.com/v1";
        }
        String model = blank(OrgSecrets.live(org, "openaiModel"), "gpt-4o-mini");
        try {
            String payload = mapper.writeValueAsString(Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", system),
                            Map.of("role", "user", "content", prompt)
                    )
            ));
            HttpRequest req = HttpRequest.newBuilder(URI.create(base.replaceAll("/$", "") + "/chat/completions"))
                    .timeout(Duration.ofSeconds(25))
                    .header("Authorization", "Bearer " + key)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 400) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "AI provider returned " + res.statusCode());
            }
            JsonNode root = mapper.readTree(res.body());
            String text = root.path("choices").path(0).path("message").path("content").asText("");
            if (text.isBlank()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "AI provider returned an empty answer");
            }
            return text;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Could not reach the AI provider");
        }
    }

    private static String str(Map<String, String> body, String key) {
        if (body == null || body.get(key) == null) {
            return "";
        }
        return body.get(key).trim();
    }

    private static UUID uuid(Map<String, String> body, String key) {
        String value = str(body, key);
        if (value.isBlank()) {
            return null;
        }
        return UUID.fromString(value);
    }

    private static String blank(String value) {
        return value == null ? "" : value;
    }

    private static String blank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static String mapStr(Map<?, ?> ev, String key, String fallback) {
        Object value = ev.get(key);
        if (value == null || value.toString().isBlank()) {
            return fallback;
        }
        return value.toString();
    }
}
