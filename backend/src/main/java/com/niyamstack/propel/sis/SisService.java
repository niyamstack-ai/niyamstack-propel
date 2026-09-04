package com.niyamstack.propel.sis;

import com.niyamstack.propel.catalog.Packs;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.enterprise.EnterpriseService;
import com.niyamstack.propel.grow.GrowService;
import com.niyamstack.propel.ess.EssService;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.DataScope;
import com.niyamstack.propel.security.PasswordPolicy;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class SisService {
    private final Store store;
    private final PasswordEncoder encoder;
    private final StudentAccountService students;
    private final EssService ess;
    private final GrowService grow;
    private final EnterpriseService enterprise;
    private final DataScope scope;
    private final TransactionTemplate isolated;

    public SisService(Store store, PasswordEncoder encoder, StudentAccountService students, EssService ess,
                      PlatformTransactionManager txManager, GrowService grow, EnterpriseService enterprise,
                      DataScope scope) {
        this.store = store;
        this.encoder = encoder;
        this.students = students;
        this.scope = scope;
        this.ess = ess;
        this.grow = grow;
        this.enterprise = enterprise;
        this.isolated = new TransactionTemplate(txManager);
        this.isolated.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional
    public TimetableSlot saveSlot(TimetableSlot body) {
        Access.requireTenant(Auth.current());
        Access.requireWrite(Auth.current(), "LMS");
        if (body.getDayOfWeek() == null || body.getStartTime() == null || body.getEndTime() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Day, start time, and end time are required");
        }
        if (!body.getEndTime().isAfter(body.getStartTime())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "End time must be after start time");
        }
        UUID org = orgId();
        UUID ignore = body.getId();
        for (TimetableSlot other : store.list(TimetableSlot.class, org)) {
            if (ignore != null && ignore.equals(other.getId())) {
                continue;
            }
            if (other.getDayOfWeek() == null || !other.getDayOfWeek().equals(body.getDayOfWeek())) {
                continue;
            }
            if (!overlaps(body.getStartTime(), body.getEndTime(), other.getStartTime(), other.getEndTime())) {
                continue;
            }
            if (body.getFacultyUserId() != null && body.getFacultyUserId().equals(other.getFacultyUserId())) {
                throw new ApiException(HttpStatus.CONFLICT, "That faculty already has a class in this slot");
            }
            if (body.getClassroomId() != null && body.getClassroomId().equals(other.getClassroomId())) {
                throw new ApiException(HttpStatus.CONFLICT, "That room is already booked in this slot");
            }
            if (body.getBatchId() != null && body.getBatchId().equals(other.getBatchId())) {
                throw new ApiException(HttpStatus.CONFLICT, "That batch already has a class in this slot");
            }
        }
        body.setId(null);
        body.setOrganizationId(org);
        return store.save(body);
    }

    @Transactional
    public Batch createBatch(Batch body) {
        Access.requireTenant(Auth.current());
        Access.requireWrite(Auth.current(), "SETUP");
        List<Term> terms = store.list(Term.class, orgId());
        if (!terms.isEmpty() && body.getTermId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a term for this batch");
        }
        if (body.getTermId() != null) {
            Term term = store.getOwned(Term.class, body.getTermId(), orgId());
            if (body.getAcademicYearId() == null) {
                body.setAcademicYearId(term.getAcademicYearId());
            }
        }
        body.setId(null);
        body.setOrganizationId(orgId());
        if (body.getStatus() == null || body.getStatus().isBlank()) {
            body.setStatus("ACTIVE");
        }
        return store.save(body);
    }

    public UUID resolveTermId(UUID termId) {
        Access.requireTenant(Auth.current());
        if (termId != null) {
            store.getOwned(Term.class, termId, orgId());
            return termId;
        }
        List<Term> terms = store.list(Term.class, orgId());
        return terms.isEmpty() ? null : terms.get(0).getId();
    }

    public Map<String, Object> importStudents(Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "SIS");
        String csv = str(body, "csv");
        if (csv.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Paste a CSV with a header row");
        }
        List<String[]> rows = parseCsv(csv);
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CSV has no data rows");
        }
        Map<String, Integer> cols = header(rows.get(0), "fullName", "phone", "email", "studentCode");
        int created = 0;
        int updated = 0;
        int skipped = 0;
        for (int i = 1; i < rows.size(); i++) {
            String[] row = rows.get(i);
            String name = cell(row, cols, "fullName");
            String phone = Phones.normalize(cell(row, cols, "phone"));
            String email = cell(row, cols, "email");
            String code = cell(row, cols, "studentCode");
            if (name.isBlank() || phone.isBlank()) {
                skipped++;
                continue;
            }
            final int rowNo = i;
            try {
                String result = isolated.execute(status -> {
                    Student existing = findStudent(phone, email, code);
                    if (existing != null) {
                        existing.setFullName(name);
                        if (!email.isBlank()) {
                            existing.setEmail(email);
                        }
                        if (!phone.isBlank()) {
                            existing.setPhone(phone);
                        }
                        store.save(existing);
                        return "updated";
                    }
                    Student s = new Student();
                    s.setFullName(name);
                    s.setPhone(phone);
                    s.setEmail(email);
                    s.setStudentCode(blank(code, "STU-" + String.format("%04d", rowNo)));
                    s.setStatus("ENROLLED");
                    s.setEnrollmentDate(LocalDate.now());
                    students.enrollFromOwner(s);
                    return "created";
                });
                if ("updated".equals(result)) {
                    updated++;
                } else {
                    created++;
                }
            } catch (Exception ex) {
                skipped++;
            }
        }
        return Map.of("created", created, "updated", updated, "skipped", skipped);
    }

    public Map<String, Object> importEmployees(Map<String, Object> body) {
        String csv = str(body, "csv");
        if (csv.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Paste a CSV with a header row");
        }
        List<String[]> rows = parseCsv(csv);
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CSV has no data rows");
        }
        Map<String, Integer> cols = header(rows.get(0), "fullName", "phone", "email", "employeeCode", "department", "designation");
        int created = 0;
        int updated = 0;
        int skipped = 0;
        for (int i = 1; i < rows.size(); i++) {
            String[] row = rows.get(i);
            String name = cell(row, cols, "fullName");
            if (name.isBlank()) {
                skipped++;
                continue;
            }
            String phone = Phones.normalize(cell(row, cols, "phone"));
            String email = cell(row, cols, "email").toLowerCase();
            String code = cell(row, cols, "employeeCode");
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("fullName", name);
            payload.put("phone", phone);
            payload.put("email", email);
            payload.put("employeeCode", code);
            payload.put("department", cell(row, cols, "department"));
            payload.put("designation", cell(row, cols, "designation"));
            payload.put("employmentType", "SUPPORT");
            try {
                String result = isolated.execute(status -> {
                    Employee existing = store.list(Employee.class, orgId()).stream()
                            .filter(e -> (!phone.isBlank() && phone.equals(Phones.normalize(e.getPhone())))
                                    || (!email.isBlank() && email.equalsIgnoreCase(blank(e.getEmail(), "")))
                                    || (!code.isBlank() && code.equalsIgnoreCase(blank(e.getEmployeeCode(), ""))))
                            .findFirst()
                            .orElse(null);
                    if (existing != null) {
                        ess.updateEmployee(existing.getId(), payload);
                        return "updated";
                    }
                    ess.createEmployee(payload);
                    return "created";
                });
                if ("updated".equals(result)) {
                    updated++;
                } else {
                    created++;
                }
            } catch (Exception ex) {
                skipped++;
            }
        }
        return Map.of("created", created, "updated", updated, "skipped", skipped);
    }

    public Map<String, Object> idCard(String kind, UUID id) {
        Access.requireTenant(Auth.current());
        Organization org = store.get(Organization.class, orgId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("instituteName", org.getName());
        out.put("logoUrl", org.getLogoUrl());
        if ("STAFF".equalsIgnoreCase(kind)) {
            Employee e = store.getOwned(Employee.class, id, orgId());
            out.put("kind", "STAFF");
            out.put("fullName", e.getFullName());
            out.put("code", e.getEmployeeCode());
            out.put("title", e.getDesignation());
            out.put("department", e.getDepartment());
            out.put("photoUrl", "");
            return out;
        }
        Student s = store.getOwned(Student.class, id, orgId());
        if (Roles.PARENT.equals(Auth.current().role())) {
            if (!scope.parentStudentIds(Auth.current()).contains(s.getId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "That student is not linked to this parent");
            }
        }
        out.put("kind", "STUDENT");
        out.put("fullName", s.getFullName());
        out.put("code", s.getStudentCode());
        out.put("title", s.getStatus());
        out.put("department", "");
        out.put("photoUrl", s.getPhotoUrl());
        return out;
    }

    @Transactional
    public Map<String, Object> inviteParent(Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "SIS");
        UUID studentId = uuid(body, "studentId");
        store.getOwned(Student.class, studentId, orgId());
        String name = blank(str(body, "fullName"), "Parent");
        String phone = Phones.normalize(str(body, "phone"));
        String email = str(body, "email").toLowerCase();
        if (phone.isBlank() || !Phones.isMobile(phone)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Parent mobile is required");
        }
        Guardian g = store.listBy(Guardian.class, orgId(), "studentId", studentId).stream()
                .filter(row -> phone.equals(Phones.normalize(row.getPhone())))
                .findFirst()
                .orElseGet(Guardian::new);
        g.setOrganizationId(orgId());
        g.setStudentId(studentId);
        g.setFullName(name);
        g.setRelation(blank(str(body, "relation"), "Parent"));
        g.setPhone(phone);
        g.setEmail(email);
        AppUser user = store.findUserByPhone(phone);
        if (user == null && !email.isBlank()) {
            user = store.findUserByEmail(email);
        }
        String temp = null;
        if (user == null) {
            if (email.isBlank()) {
                email = "parent." + phone + "@otp.local";
            }
            temp = PasswordPolicy.temporary();
            PasswordPolicy.validate(temp);
            user = new AppUser();
            user.setOrganizationId(orgId());
            user.setFullName(name);
            user.setEmail(email);
            user.setPhone(phone);
            user.setRole(Roles.PARENT);
            user.setActive(true);
            user.setPasswordHash(encoder.encode(temp));
            user.setPasswordChangedAt(Instant.now());
            user = store.save(user);
        } else if (!Roles.PARENT.equals(user.getRole()) && user.getOrganizationId() != null
                && !orgId().equals(user.getOrganizationId())) {
            throw new ApiException(HttpStatus.CONFLICT, "That mobile already has an account in another institute");
        } else if (Roles.STUDENT.equals(user.getRole())) {
            throw new ApiException(HttpStatus.CONFLICT, "That mobile belongs to a student login — use a parent mobile");
        } else if (!Roles.PARENT.equals(user.getRole())) {
            throw new ApiException(HttpStatus.CONFLICT, "That mobile already has a staff login");
        }
        g.setUserId(user.getId());
        g = store.save(g);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("guardianId", g.getId());
        out.put("phone", phone);
        out.put("email", user.getEmail());
        out.put("tempPassword", temp == null ? "" : temp);
        return out;
    }

    @Transactional
    public Map<String, Object> saveCustomValues(String entityType, UUID id, Map<String, Object> values) {
        Access.requireTenant(Auth.current());
        String json;
        try {
            json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(values == null ? Map.of() : values);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Could not save custom fields");
        }
        switch (entityType.toUpperCase()) {
            case "STUDENT" -> {
                Student s = store.getOwned(Student.class, id, orgId());
                Access.requireWrite(Auth.current(), "SIS");
                s.setCustomJson(json);
                store.save(s);
            }
            case "INQUIRY", "LEAD" -> {
                Inquiry inq = store.getOwned(Inquiry.class, id, orgId());
                Access.requireWrite(Auth.current(), "CRM");
                inq.setCustomJson(json);
                store.save(inq);
            }
            case "EMPLOYEE" -> {
                Employee e = store.getOwned(Employee.class, id, orgId());
                Access.requireWrite(Auth.current(), "ESS");
                e.setCustomJson(json);
                store.save(e);
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Custom fields apply to student, lead, or employee");
        }
        return Map.of("id", id, "customJson", json);
    }

    public Map<String, Object> getCustomValues(String entityType, UUID id) {
        Access.requireTenant(Auth.current());
        String json = "";
        switch (entityType.toUpperCase()) {
            case "STUDENT" -> {
                Student s = store.getOwned(Student.class, id, orgId());
                json = blank(s.getCustomJson(), "");
            }
            case "INQUIRY", "LEAD" -> {
                Inquiry inq = store.getOwned(Inquiry.class, id, orgId());
                json = blank(inq.getCustomJson(), "");
            }
            case "EMPLOYEE" -> {
                Employee e = store.getOwned(Employee.class, id, orgId());
                json = blank(e.getCustomJson(), "");
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Custom fields apply to student, lead, or employee");
        }
        Map<String, Object> values = new LinkedHashMap<>();
        if (!json.isBlank()) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map.class);
                if (parsed != null) values.putAll(parsed);
            } catch (Exception ignored) {
                /* return empty map if corrupt */
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("values", values);
        out.put("customJson", json);
        return out;
    }

    @Transactional
    public ApprovalRequest submitApproval(Map<String, Object> body) {
        Access.requireTenant(Auth.current());
        String kind = str(body, "kind").toUpperCase();
        if (!Set.of("DISCOUNT", "FEE_WAIVER", "ADMISSION", "OFFER", "ACCREDITATION").contains(kind)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Kind must be discount, fee waiver, admission, offer, or accreditation");
        }
        ApprovalRequest req = new ApprovalRequest();
        req.setOrganizationId(orgId());
        req.setKind(kind);
        req.setStatus("PENDING");
        req.setStudentId(uuid(body, "studentId"));
        req.setInquiryId(uuid(body, "inquiryId"));
        req.setOfferId(uuid(body, "offerId"));
        if (!str(body, "amount").isBlank()) {
            req.setAmount(new BigDecimal(str(body, "amount")));
        }
        req.setNote(str(body, "note"));
        req.setRequestedBy(Auth.current().userId());
        req.setPayloadJson(str(body, "payloadJson"));
        enterprise.enrichApproval(req);
        return store.save(req);
    }

    @Transactional
    public ApprovalRequest decideApproval(UUID id, Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "SETUP");
        ApprovalRequest req = store.getOwned(ApprovalRequest.class, id, orgId());
        if (!"PENDING".equals(req.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This request is already decided");
        }
        boolean approve = Boolean.TRUE.equals(body.get("approve")) || "APPROVED".equalsIgnoreCase(str(body, "status"));
        req.setStatus(approve ? "APPROVED" : "REJECTED");
        req.setDecidedBy(Auth.current().userId());
        req.setDecidedAt(Instant.now());
        store.save(req);
        if ("APPROVED".equals(req.getStatus()) || "REJECTED".equals(req.getStatus())) {
            grow.onApprovalDecided(req);
        }
        return req;
    }

    public List<ApprovalRequest> approvals() {
        Access.requireTenant(Auth.current());
        return store.list(ApprovalRequest.class, orgId());
    }

    public Map<String, Object> renderTemplate(String kind, UUID entityId) {
        Access.requireTenant(Auth.current());
        DocumentTemplate tpl = store.list(DocumentTemplate.class, orgId()).stream()
                .filter(t -> kind.equalsIgnoreCase(blank(t.getKind(), "")))
                .findFirst()
                .orElse(null);
        Organization org = store.get(Organization.class, orgId());
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("institute", org.getName());
        vars.put("date", LocalDate.now().toString());
        if (entityId != null && ("ID_CARD".equalsIgnoreCase(kind) || "CERTIFICATE".equalsIgnoreCase(kind) || "RECEIPT".equalsIgnoreCase(kind))) {
            try {
                Student s = store.getOwned(Student.class, entityId, orgId());
                vars.put("name", s.getFullName());
                vars.put("code", blank(s.getStudentCode(), ""));
            } catch (Exception ignored) {
                Employee e = store.getOwned(Employee.class, entityId, orgId());
                vars.put("name", e.getFullName());
                vars.put("code", blank(e.getEmployeeCode(), ""));
            }
        }
        if (entityId != null && "OFFER".equalsIgnoreCase(kind)) {
            try {
                Offer o = store.getOwned(Offer.class, entityId, orgId());
                vars.put("name", "");
                vars.put("code", o.getId().toString());
            } catch (Exception ignored) {
                StaffCandidate c = store.getOwned(StaffCandidate.class, entityId, orgId());
                vars.put("name", c.getFullName());
                vars.put("code", "");
            }
        }
        String body = tpl == null
                ? "{{institute}}\n{{name}} ({{code}})\n{{date}}"
                : tpl.getBody();
        for (Map.Entry<String, String> e : vars.entrySet()) {
            body = body.replace("{{" + e.getKey() + "}}", e.getValue() == null ? "" : e.getValue());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", kind);
        out.put("body", body);
        out.put("instituteName", org.getName());
        out.putAll(vars);
        return out;
    }

    public List<Map<String, Object>> sessionRoster(UUID sessionId) {
        Access.requireTenant(Auth.current());
        LiveSession session = store.getOwned(LiveSession.class, sessionId, orgId());
        List<Student> roster = rosterForBatch(session.getBatchId());
        List<AttendanceRecord> marks = store.list(AttendanceRecord.class, orgId()).stream()
                .filter(a -> sessionId.equals(a.getLiveSessionId()))
                .toList();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Student s : roster) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("studentId", s.getId());
            row.put("fullName", s.getFullName());
            row.put("studentCode", s.getStudentCode());
            row.put("status", marks.stream().filter(a -> s.getId().equals(a.getStudentId())).map(AttendanceRecord::getStatus).findFirst().orElse(""));
            out.add(row);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> takeSessionAttendance(UUID sessionId, Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "LMS");
        LiveSession session = store.getOwned(LiveSession.class, sessionId, orgId());
        List<String> present = listOf(body.get("presentIds"));
        LocalDate day = session.getStartsAt() == null ? LocalDate.now() : LocalDate.ofInstant(session.getStartsAt(), java.time.ZoneId.systemDefault());
        int marked = 0;
        for (Student s : rosterForBatch(session.getBatchId())) {
            AttendanceRecord rec = store.listBy(AttendanceRecord.class, orgId(), "studentId", s.getId()).stream()
                    .filter(a -> sessionId.equals(a.getLiveSessionId()))
                    .findFirst()
                    .orElseGet(AttendanceRecord::new);
            rec.setOrganizationId(orgId());
            rec.setStudentId(s.getId());
            rec.setBatchId(session.getBatchId());
            rec.setLiveSessionId(sessionId);
            rec.setSessionDate(day);
            rec.setStatus(present.contains(s.getId().toString()) ? "PRESENT" : "ABSENT");
            rec.setSource("LIVE_SESSION");
            store.save(rec);
            marked++;
        }
        session.setStatus("HELD");
        store.save(session);
        return Map.of("sessionId", sessionId, "marked", marked, "present", present.size());
    }

    @Transactional
    public Recording attachRecording(UUID sessionId, Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "LMS");
        LiveSession session = store.getOwned(LiveSession.class, sessionId, orgId());
        String url = str(body, "videoUrl");
        if (url.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Recording URL is required");
        }
        session.setRecordingUrl(url);
        store.save(session);
        Recording rec = new Recording();
        rec.setOrganizationId(orgId());
        rec.setBatchId(session.getBatchId());
        rec.setLiveSessionId(sessionId);
        rec.setTitle(blank(str(body, "title"), session.getTitle() + " recording"));
        rec.setVideoUrl(url);
        return store.save(rec);
    }

    @Transactional
    public DoubtTicket replyDoubt(UUID id, Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "LMS");
        DoubtTicket t = store.getOwned(DoubtTicket.class, id, orgId());
        t.setFacultyReply(str(body, "facultyReply"));
        t.setStatus(blank(str(body, "status"), "ANSWERED"));
        if (t.getFirstResponseAt() == null) {
            t.setFirstResponseAt(Instant.now());
        }
        if (t.getSlaHours() == null) {
            t.setSlaHours(24);
        }
        return store.save(t);
    }

    public List<Map<String, Object>> doubts() {
        Access.requireTenant(Auth.current());
        List<DoubtTicket> rows = store.list(DoubtTicket.class, orgId());
        List<Map<String, Object>> out = new ArrayList<>();
        Instant now = Instant.now();
        for (DoubtTicket t : rows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", t.getId());
            row.put("studentId", t.getStudentId());
            row.put("subject", t.getSubject());
            row.put("body", t.getBody());
            row.put("status", t.getStatus());
            row.put("facultyReply", t.getFacultyReply());
            row.put("courseId", t.getCourseId());
            row.put("slaHours", t.getSlaHours() == null ? 24 : t.getSlaHours());
            row.put("firstResponseAt", t.getFirstResponseAt());
            Instant due = t.getCreatedAt() == null ? now : t.getCreatedAt().plus(Duration.ofHours(t.getSlaHours() == null ? 24 : t.getSlaHours()));
            row.put("overdue", t.getFirstResponseAt() == null && now.isAfter(due) && !"ANSWERED".equalsIgnoreCase(blank(t.getStatus(), "")));
            out.add(row);
        }
        return out;
    }

    public List<Map<String, Object>> facultyWorkload() {
        Access.requireTenant(Auth.current());
        Map<UUID, long[]> hours = new LinkedHashMap<>();
        for (TimetableSlot slot : store.list(TimetableSlot.class, orgId())) {
            if (slot.getFacultyUserId() == null || slot.getStartTime() == null || slot.getEndTime() == null) {
                continue;
            }
            long mins = Duration.between(slot.getStartTime(), slot.getEndTime()).toMinutes();
            hours.computeIfAbsent(slot.getFacultyUserId(), k -> new long[]{0, 0});
            hours.get(slot.getFacultyUserId())[0] += Math.max(0, mins);
            hours.get(slot.getFacultyUserId())[1] += 1;
        }
        Map<UUID, Long> batches = new LinkedHashMap<>();
        for (Batch b : store.list(Batch.class, orgId())) {
            if (b.getFacultyUserId() != null) {
                batches.merge(b.getFacultyUserId(), 1L, Long::sum);
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (AppUser u : store.listUsers(orgId())) {
            if (!Set.of(Roles.FACULTY, Roles.OWNER).contains(u.getRole())) {
                continue;
            }
            long[] h = hours.getOrDefault(u.getId(), new long[]{0, 0});
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("userId", u.getId());
            row.put("fullName", u.getFullName());
            row.put("weeklyHours", Math.round(h[0] / 6.0) / 10.0);
            row.put("slots", h[1]);
            row.put("batches", batches.getOrDefault(u.getId(), 0L));
            out.add(row);
        }
        return out;
    }

    public List<Map<String, Object>> progressBoard() {
        Access.requireTenant(Auth.current());
        PropelUser user = Auth.current();
        List<Student> students = store.list(Student.class, orgId());
        if (Roles.PARENT.equals(user.role())) {
            Set<UUID> kids = scope.parentStudentIds(user);
            students = students.stream().filter(s -> kids.contains(s.getId())).toList();
        } else if (Roles.STUDENT.equals(user.role())) {
            students = students.stream().filter(s -> user.userId().equals(s.getUserId())).toList();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Student s : students) {
            out.add(progressFor(s));
        }
        return out;
    }

    public Map<String, Object> progressForStudent(UUID studentId) {
        Access.requireTenant(Auth.current());
        Student s = store.getOwned(Student.class, studentId, orgId());
        PropelUser user = Auth.current();
        if (Roles.STUDENT.equals(user.role()) && !user.userId().equals(s.getUserId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "That progress is not yours");
        }
        if (Roles.PARENT.equals(user.role()) && !scope.parentStudentIds(user).contains(studentId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "That student is not linked to this parent");
        }
        return progressFor(s);
    }

    private Map<String, Object> progressFor(Student s) {
        UUID org = orgId();
        Set<UUID> courseIds = new java.util.HashSet<>();
        if (s.getCourseId() != null) {
            courseIds.add(s.getCourseId());
        }
        store.listBy(CourseEnrollment.class, org, "studentId", s.getId()).stream()
                .filter(e -> !"CANCELLED".equals(e.getStatus()))
                .map(CourseEnrollment::getCourseId)
                .forEach(courseIds::add);
        Set<UUID> viewed = store.listBy(ContentProgress.class, org, "studentId", s.getId()).stream()
                .map(ContentProgress::getContentItemId).collect(java.util.stream.Collectors.toSet());
        Set<UUID> submittedAsg = store.listBy(Submission.class, org, "studentId", s.getId()).stream()
                .map(Submission::getAssignmentId).collect(java.util.stream.Collectors.toSet());
        Set<UUID> submittedExams = store.listBy(ExamAttempt.class, org, "studentId", s.getId()).stream()
                .map(ExamAttempt::getAssessmentId).collect(java.util.stream.Collectors.toSet());
        int filesTotal = 0, filesDone = 0, hwTotal = 0, hwDone = 0, testTotal = 0, testDone = 0;
        for (UUID courseId : courseIds) {
            Set<UUID> batchIds = store.listBy(Batch.class, org, "courseId", courseId).stream().map(Batch::getId).collect(java.util.stream.Collectors.toSet());
            List<ContentItem> materials = store.listBy(ContentItem.class, org, "courseId", courseId).stream()
                    .filter(c -> c.isPublished() && !"FOLDER".equalsIgnoreCase(c.getContentType())).toList();
            filesTotal += materials.size();
            filesDone += (int) materials.stream().filter(c -> viewed.contains(c.getId())).count();
            List<Assignment> homework = store.list(Assignment.class, org).stream()
                    .filter(Assignment::isPublished)
                    .filter(a -> courseId.equals(a.getCourseId()) || (a.getBatchId() != null && batchIds.contains(a.getBatchId())))
                    .toList();
            hwTotal += homework.size();
            hwDone += (int) homework.stream().filter(a -> submittedAsg.contains(a.getId())).count();
            List<Assessment> exams = store.list(Assessment.class, org).stream()
                    .filter(Assessment::isPublished)
                    .filter(a -> !"PRACTICE_LAB".equalsIgnoreCase(a.getKind()))
                    .filter(a -> courseId.equals(a.getCourseId()) || (a.getBatchId() != null && batchIds.contains(a.getBatchId())))
                    .toList();
            testTotal += exams.size();
            testDone += (int) exams.stream().filter(a -> submittedExams.contains(a.getId())).count();
        }
        int total = filesTotal + hwTotal + testTotal;
        int done = filesDone + hwDone + testDone;
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("studentId", s.getId());
        row.put("fullName", s.getFullName());
        row.put("studentCode", s.getStudentCode());
        row.put("syllabusPct", total == 0 ? 0 : (int) Math.min(100, done * 100L / total));
        row.put("filesDone", filesDone);
        row.put("filesTotal", filesTotal);
        row.put("homeworkDone", hwDone);
        row.put("homeworkTotal", hwTotal);
        row.put("testsDone", testDone);
        row.put("testsTotal", testTotal);
        return row;
    }

    public List<Map<String, Object>> batchAttendanceRoster(UUID batchId, LocalDate date) {
        Access.requireTenant(Auth.current());
        Access.requireAnyModule(Auth.current(), Packs.MOD_LMS);
        if (batchId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a batch");
        }
        LocalDate day = date == null ? LocalDate.now() : date;
        store.getOwned(Batch.class, batchId, orgId());
        List<Student> roster = rosterForBatch(batchId);
        List<AttendanceRecord> marks = store.list(AttendanceRecord.class, orgId()).stream()
                .filter(a -> day.equals(a.getSessionDate()) && batchId.equals(a.getBatchId()))
                .toList();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Student s : roster) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("studentId", s.getId());
            row.put("fullName", s.getFullName());
            row.put("studentCode", s.getStudentCode());
            row.put("status", marks.stream()
                    .filter(a -> s.getId().equals(a.getStudentId()))
                    .map(AttendanceRecord::getStatus)
                    .findFirst()
                    .orElse(""));
            out.add(row);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> markBatchAttendance(Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "LMS");
        UUID batchId = uuid(body, "batchId");
        if (batchId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a batch");
        }
        LocalDate day = date(body, "sessionDate");
        if (day == null) {
            day = LocalDate.now();
        }
        LocalDate sessionDay = day;
        List<String> present = listOf(body.get("presentIds"));
        int marked = 0;
        int presentCount = 0;
        for (Student s : rosterForBatch(batchId)) {
            boolean isPresent = present.contains(s.getId().toString());
            AttendanceRecord rec = store.list(AttendanceRecord.class, orgId()).stream()
                    .filter(a -> s.getId().equals(a.getStudentId()) && batchId.equals(a.getBatchId()) && sessionDay.equals(a.getSessionDate()))
                    .findFirst()
                    .orElseGet(AttendanceRecord::new);
            rec.setOrganizationId(orgId());
            rec.setStudentId(s.getId());
            rec.setBatchId(batchId);
            rec.setSessionDate(sessionDay);
            if (isPresent) {
                rec.setStatus("LATE".equalsIgnoreCase(blank(rec.getStatus(), "")) ? "LATE" : "PRESENT");
            } else {
                rec.setStatus("ABSENT");
            }
            rec.setSource("BATCH_SHEET");
            store.save(rec);
            marked++;
            if (isPresent) {
                presentCount++;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("batchId", batchId);
        out.put("sessionDate", day.toString());
        out.put("marked", marked);
        out.put("present", presentCount);
        out.put("absent", marked - presentCount);
        return out;
    }

    public Map<String, Object> attendanceSummary(UUID batchId, String date) {
        Access.requireTenant(Auth.current());
        Access.requireAnyModule(Auth.current(), Packs.MOD_LMS);
        if (batchId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a batch");
        }
        store.getOwned(Batch.class, batchId, orgId());
        List<Student> roster = rosterForBatch(batchId);
        LocalDate from = LocalDate.now().minusDays(30);
        LocalDate focus = date != null && date.length() >= 10 ? LocalDate.parse(date.substring(0, 10)) : LocalDate.now();
        List<AttendanceRecord> marks = store.list(AttendanceRecord.class, orgId()).stream()
                .filter(a -> batchId.equals(a.getBatchId()) && a.getSessionDate() != null && !a.getSessionDate().isBefore(from))
                .toList();
        long sessionDays = marks.stream().map(AttendanceRecord::getSessionDate).distinct().count();
        long presentMarks = marks.stream().filter(a -> "PRESENT".equalsIgnoreCase(a.getStatus()) || "LATE".equalsIgnoreCase(a.getStatus())).count();
        long totalMarks = marks.size();
        int presentToday = (int) marks.stream()
                .filter(a -> focus.equals(a.getSessionDate()) && ("PRESENT".equalsIgnoreCase(a.getStatus()) || "LATE".equalsIgnoreCase(a.getStatus())))
                .count();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("batchId", batchId);
        out.put("students", roster.size());
        out.put("sessionDays", sessionDays);
        out.put("presentToday", presentToday);
        out.put("absentToday", Math.max(0, roster.size() - presentToday));
        out.put("averagePresentPct", totalMarks == 0 ? 0 : (int) Math.min(100, presentMarks * 100 / totalMarks));
        out.put("sessionDate", focus.toString());
        return out;
    }

    public Map<String, Object> attendanceSummary(UUID batchId) {
        return attendanceSummary(batchId, null);
    }

    private List<Student> rosterForBatch(UUID batchId) {
        if (batchId == null) {
            return store.list(Student.class, orgId());
        }
        Batch batch = store.getOwned(Batch.class, batchId, orgId());
        return store.list(Student.class, orgId()).stream()
                .filter(s -> batchId.equals(s.getBatchId()))
                .toList();
    }

    private Student findStudent(String phone, String email, String code) {
        return store.list(Student.class, orgId()).stream()
                .filter(s -> (!phone.isBlank() && phone.equals(Phones.normalize(s.getPhone())))
                        || (!email.isBlank() && email.equalsIgnoreCase(blank(s.getEmail(), "")))
                        || (!code.isBlank() && code.equalsIgnoreCase(blank(s.getStudentCode(), ""))))
                .findFirst()
                .orElse(null);
    }

    private UUID orgId() {
        return Auth.current().organizationId();
    }

    private static boolean overlaps(LocalTime aStart, LocalTime aEnd, LocalTime bStart, LocalTime bEnd) {
        if (bStart == null || bEnd == null) {
            return false;
        }
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }

    private static String str(Map<String, ?> body, String key) {
        if (body == null || body.get(key) == null) {
            return "";
        }
        return String.valueOf(body.get(key)).trim();
    }

    private static UUID uuid(Map<String, ?> body, String key) {
        String s = str(body, key);
        if (s.isBlank() || "null".equalsIgnoreCase(s)) {
            return null;
        }
        return UUID.fromString(s);
    }

    private static LocalDate date(Map<String, ?> body, String key) {
        String s = str(body, key);
        if (s.isBlank() || s.length() < 10) {
            return null;
        }
        return LocalDate.parse(s.substring(0, 10));
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }

    @SuppressWarnings("unchecked")
    private static List<String> listOf(Object raw) {
        if (raw instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return List.of();
    }

    private static List<String[]> parseCsv(String csv) {
        List<String[]> rows = new ArrayList<>();
        for (String line : csv.split("\\R")) {
            if (line.isBlank()) {
                continue;
            }
            rows.add(line.split(",", -1));
        }
        return rows;
    }

    private static Map<String, Integer> header(String[] row, String... keys) {
        Map<String, Integer> cols = new LinkedHashMap<>();
        for (int i = 0; i < row.length; i++) {
            cols.put(row[i].trim().replace(" ", "").toLowerCase(), i);
        }
        Map<String, Integer> out = new LinkedHashMap<>();
        for (String key : keys) {
            Integer idx = cols.get(key.toLowerCase());
            if (idx == null) {
                idx = cols.get(key.replace("fullName", "name").toLowerCase());
            }
            out.put(key, idx == null ? -1 : idx);
        }
        return out;
    }

    private static String cell(String[] row, Map<String, Integer> cols, String key) {
        int i = cols.getOrDefault(key, -1);
        if (i < 0 || i >= row.length) {
            return "";
        }
        return row[i].trim();
    }
}
