package com.niyamstack.propel.placement;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PasswordPolicy;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class PlacementService {
    private final Store store;
    private final AuditService audit;
    private final PasswordEncoder encoder;

    public PlacementService(Store store, AuditService audit, PasswordEncoder encoder) {
        this.store = store;
        this.audit = audit;
        this.encoder = encoder;
    }

    public Map<String, Object> eligibility(UUID driveId, UUID studentId) {
        PropelUser user = Auth.current();
        Drive drive = store.getOwned(Drive.class, driveId, user.organizationId());
        Student student = store.getOwned(Student.class, studentId, user.organizationId());
        int attendance = attendancePct(user.organizationId(), studentId);
        int minAtt = drive.getMinAttendancePct() == null ? parseInt(ruleJson(drive), "minAttendance", 0) : drive.getMinAttendancePct();
        int minMarks = drive.getMinMarks() == null ? parseInt(ruleJson(drive), "minMarks", 0) : drive.getMinMarks();
        boolean pass = attendance >= minAtt;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("driveId", driveId);
        out.put("studentId", studentId);
        out.put("student", student.getFullName());
        out.put("attendancePct", attendance);
        out.put("minAttendancePct", minAtt);
        out.put("minMarks", minMarks);
        out.put("eligible", pass);
        out.put("reason", pass ? "Eligible" : "Attendance below drive threshold");
        return out;
    }

    @Transactional
    public Application apply(UUID driveId, UUID studentId) {
        PropelUser user = Auth.current();
        Drive drive = store.getOwned(Drive.class, driveId, user.organizationId());
        Student student = resolveStudent(user, studentId);
        Map<String, Object> check = eligibility(driveId, student.getId());
        boolean ok = Boolean.TRUE.equals(check.get("eligible"));
        Application app = new Application();
        app.setOrganizationId(user.organizationId());
        app.setDriveId(drive.getId());
        app.setStudentId(student.getId());
        app.setEligibilityPassed(ok);
        app.setStatus(ok ? "APPLIED" : "INELIGIBLE");
        app.setCurrentRound(ok ? "APPLIED" : "BLOCKED");
        app = store.save(app);
        audit.log("DRIVE_APPLY", "Application", app.getId(), app.getStatus());
        return app;
    }

    @Transactional
    public DriveRound addRoundTemplate(UUID driveId, int seq, String name, String type) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        Drive drive = store.getOwned(Drive.class, driveId, user.organizationId());
        DriveRound round = new DriveRound();
        round.setOrganizationId(user.organizationId());
        round.setDriveId(drive.getId());
        round.setSeqNo(seq);
        round.setRoundName(name);
        round.setRoundType(type);
        return store.save(round);
    }

    @Transactional
    public InterviewRound recordRound(UUID applicationId, String roundName, String outcome, String feedback, String panel, String scheduledAt) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.RECRUITER);
        Application app = store.getOwned(Application.class, applicationId, user.organizationId());
        InterviewRound round = new InterviewRound();
        round.setOrganizationId(user.organizationId());
        round.setApplicationId(app.getId());
        round.setRoundName(roundName);
        round.setOutcome(outcome);
        round.setFeedback(feedback);
        round.setPanel(panel);
        Instant when = Instant.now();
        if (scheduledAt != null && !scheduledAt.isBlank()) {
            try {
                when = Instant.parse(scheduledAt);
            } catch (Exception e) {
                when = LocalDate.parse(scheduledAt.substring(0, Math.min(10, scheduledAt.length())))
                        .atStartOfDay(java.time.ZoneId.systemDefault()).toInstant();
            }
        }
        round.setScheduledAt(when);
        round = store.save(round);
        if ("PASS".equalsIgnoreCase(outcome)) {
            app.setStatus("INTERVIEWED");
            app.setCurrentRound(roundName);
        } else if ("FAIL".equalsIgnoreCase(outcome)) {
            app.setStatus("REJECTED");
            app.setCurrentRound(roundName);
        }
        store.save(app);
        audit.log("ATS_ROUND", "InterviewRound", round.getId(), outcome);
        return round;
    }

    @Transactional
    public Offer offer(UUID applicationId, BigDecimal packageLpa, LocalDate joining, String notes) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        Access.requirePackage(user, "GROWTH");
        Application app = store.getOwned(Application.class, applicationId, user.organizationId());
        Offer offer = new Offer();
        offer.setOrganizationId(user.organizationId());
        offer.setApplicationId(app.getId());
        offer.setPackageLpa(packageLpa);
        offer.setJoiningDate(joining);
        offer.setNotes(notes);
        offer.setStatus("OFFERED");
        offer = store.save(offer);
        app.setStatus("OFFERED");
        store.save(app);
        audit.log("OFFER", "Offer", offer.getId(), String.valueOf(packageLpa));
        return offer;
    }

    @Transactional
    public Offer acceptOffer(UUID offerId, boolean accept) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.STUDENT);
        Offer offer = store.getOwned(Offer.class, offerId, user.organizationId());
        if (!"OFFERED".equalsIgnoreCase(offer.getStatus()) && !"ACCEPTED".equalsIgnoreCase(offer.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This offer is already closed");
        }
        if (Roles.STUDENT.equals(user.role())) {
            Application app = store.getOwned(Application.class, offer.getApplicationId(), user.organizationId());
            Student me = store.listBy(Student.class, user.organizationId(), "userId", user.userId()).stream().findFirst()
                    .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "No student profile"));
            if (!me.getId().equals(app.getStudentId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "That offer is not yours");
            }
        }
        offer.setStatus(accept ? "ACCEPTED" : "DECLINED");
        offer = store.save(offer);
        Application app = store.getOwned(Application.class, offer.getApplicationId(), user.organizationId());
        app.setStatus(accept ? "ACCEPTED" : "DECLINED");
        store.save(app);
        return offer;
    }

    @Transactional
    public Offer markJoined(UUID offerId, LocalDate joining) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        Offer offer = store.getOwned(Offer.class, offerId, user.organizationId());
        if (!"ACCEPTED".equalsIgnoreCase(offer.getStatus()) && !"OFFERED".equalsIgnoreCase(offer.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Accept the offer before marking joined");
        }
        if (joining != null) {
            offer.setJoiningDate(joining);
        }
        offer.setStatus("JOINED");
        offer = store.save(offer);
        Application app = store.getOwned(Application.class, offer.getApplicationId(), user.organizationId());
        app.setStatus("JOINED");
        store.save(app);
        return offer;
    }

    public Map<String, Object> offerLetter(UUID offerId) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.STUDENT);
        Offer offer = store.getOwned(Offer.class, offerId, user.organizationId());
        Application app = store.getOwned(Application.class, offer.getApplicationId(), user.organizationId());
        Student student = store.getOwned(Student.class, app.getStudentId(), user.organizationId());
        Drive drive = store.getOwned(Drive.class, app.getDriveId(), user.organizationId());
        Organization org = store.get(Organization.class, user.organizationId());
        String company = "";
        if (drive.getCompanyId() != null) {
            try {
                company = store.getOwned(Company.class, drive.getCompanyId(), user.organizationId()).getName();
            } catch (Exception ignored) {
                company = "";
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("offerId", offer.getId());
        out.put("status", offer.getStatus());
        out.put("packageLpa", offer.getPackageLpa());
        out.put("joiningDate", offer.getJoiningDate());
        out.put("studentName", student.getFullName());
        out.put("studentCode", student.getStudentCode());
        out.put("driveTitle", drive.getTitle());
        out.put("company", company);
        out.put("instituteName", org.getName());
        out.put("body", org.getName() + "\nOffer letter\n\n" + student.getFullName() + " (" + blank(student.getStudentCode()) + ")\n"
                + (company.isBlank() ? "" : "Company: " + company + "\n")
                + "Role / drive: " + blank(drive.getTitle()) + "\n"
                + "Package: " + offer.getPackageLpa() + " LPA\n"
                + "Joining date: " + (offer.getJoiningDate() == null ? "—" : offer.getJoiningDate()) + "\n"
                + (offer.getNotes() == null || offer.getNotes().isBlank() ? "" : "Notes: " + offer.getNotes() + "\n"));
        return out;
    }

    @Transactional
    public Application advance(UUID applicationId, String status) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.RECRUITER);
        Application app = store.getOwned(Application.class, applicationId, user.organizationId());
        app.setStatus(status);
        app.setCurrentRound(status);
        app = store.save(app);
        audit.log("ATS_ADVANCE", "Application", app.getId(), status);
        return app;
    }

    public List<Map<String, Object>> calendar(int calendarYear, int calendarMonth) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.RECRUITER, Roles.STUDENT);
        UUID org = user.organizationId();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Drive d : store.list(Drive.class, org)) {
            if (d.getDeadline() != null && inMonth(d.getDeadline(), calendarYear, calendarMonth)) {
                out.add(cal("DEADLINE", d.getDeadline().toString(), d.getTitle(), "Apply by " + d.getDeadline(), d.getId()));
            }
        }
        for (InterviewRound r : store.list(InterviewRound.class, org)) {
            if (r.getScheduledAt() == null) {
                continue;
            }
            LocalDate day = r.getScheduledAt().atZone(java.time.ZoneId.systemDefault()).toLocalDate();
            if (inMonth(day, calendarYear, calendarMonth)) {
                out.add(cal("INTERVIEW", day.toString(), blank(r.getRoundName()), blank(r.getOutcome()), r.getId()));
            }
        }
        for (Offer o : store.list(Offer.class, org)) {
            if (o.getJoiningDate() != null && inMonth(o.getJoiningDate(), calendarYear, calendarMonth)) {
                out.add(cal("JOINING", o.getJoiningDate().toString(), "Joining", o.getStatus(), o.getId()));
            }
        }
        for (IndustryEvent e : store.list(IndustryEvent.class, org)) {
            if (e.getEventDate() != null && inMonth(e.getEventDate(), calendarYear, calendarMonth)) {
                out.add(cal("EVENT", e.getEventDate().toString(), e.getTitle(), "Industry event", e.getId()));
            }
        }
        return out;
    }

    @Transactional
    public Map<String, Object> inviteRecruiter(Map<String, String> body) {
        PropelUser actor = Auth.current();
        Access.requireAny(actor, Roles.OWNER, Roles.PLACEMENT_HEAD);
        String name = str(body, "fullName");
        String email = str(body, "email").toLowerCase();
        if (name.isBlank() || email.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name and email are required");
        }
        if (store.findUserByEmail(email) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "That email already has an account");
        }
        UUID companyId = uuid(body, "companyId");
        if (companyId != null) {
            store.getOwned(Company.class, companyId, actor.organizationId());
        }
        String phone = Phones.normalize(str(body, "phone"));
        if (!phone.isBlank() && store.findUserByPhone(phone) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "That mobile already has an account");
        }
        String temp = PasswordPolicy.temporary();
        PasswordPolicy.validate(temp);
        AppUser user = new AppUser();
        user.setOrganizationId(actor.organizationId());
        user.setFullName(name);
        user.setEmail(email);
        user.setPhone(phone);
        user.setRole(Roles.RECRUITER);
        user.setActive(true);
        user.setCompanyId(companyId);
        user.setPasswordHash(encoder.encode(temp));
        user.setPasswordChangedAt(Instant.now());
        user = store.save(user);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", user.getId());
        out.put("email", user.getEmail());
        out.put("fullName", user.getFullName());
        out.put("role", user.getRole());
        out.put("companyId", user.getCompanyId());
        out.put("tempPassword", temp);
        return out;
    }

    @Transactional
    public Internship saveInternship(Map<String, String> body) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        Internship row = new Internship();
        row.setOrganizationId(user.organizationId());
        row.setStudentId(uuid(body, "studentId"));
        row.setCompanyId(uuid(body, "companyId"));
        if (row.getStudentId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a student");
        }
        store.getOwned(Student.class, row.getStudentId(), user.organizationId());
        if (row.getCompanyId() != null) {
            store.getOwned(Company.class, row.getCompanyId(), user.organizationId());
        }
        row.setRole(blank(str(body, "role"), "Intern"));
        if (!str(body, "stipend").isBlank()) {
            row.setStipend(new BigDecimal(str(body, "stipend")));
        }
        if (!str(body, "startDate").isBlank()) {
            row.setStartDate(LocalDate.parse(str(body, "startDate")));
        }
        row.setStatus(blank(str(body, "status"), "APPLIED").toUpperCase());
        return store.save(row);
    }

    @Transactional
    public Internship setInternshipStatus(UUID id, String status) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        Internship row = store.getOwned(Internship.class, id, user.organizationId());
        String next = status == null ? "" : status.trim().toUpperCase();
        if (!Set.of("APPLIED", "ONGOING", "COMPLETED", "CONVERTED").contains(next)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Use applied, ongoing, completed, or converted");
        }
        row.setStatus(next);
        return store.save(row);
    }

    @Transactional
    public Drive routeAlumniJob(UUID jobId) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        AlumniJob job = store.getOwned(AlumniJob.class, jobId, user.organizationId());
        Company company = store.list(Company.class, user.organizationId()).stream()
                .filter(c -> job.getCompany() != null && job.getCompany().equalsIgnoreCase(c.getName()))
                .findFirst()
                .orElse(null);
        if (company == null && job.getCompany() != null && !job.getCompany().isBlank()) {
            company = new Company();
            company.setOrganizationId(user.organizationId());
            company.setName(job.getCompany());
            company.setIndustry("Alumni referral");
            company = store.save(company);
        }
        Drive drive = new Drive();
        drive.setOrganizationId(user.organizationId());
        drive.setCompanyId(company == null ? null : company.getId());
        drive.setTitle(blank(job.getTitle(), "Alumni referral"));
        drive.setStatus("OPEN");
        drive.setLocations("Campus");
        drive.setDeadline(LocalDate.now().plusDays(14));
        drive.setPackageLpa(BigDecimal.ZERO);
        drive = store.save(drive);
        job.setStatus("ROUTED");
        store.save(job);
        return drive;
    }

    @Transactional
    public IndustryAccount toggleMou(UUID id, boolean mou) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        IndustryAccount acct = store.getOwned(IndustryAccount.class, id, user.organizationId());
        acct.setMou(mou);
        return store.save(acct);
    }

    @Transactional
    public IndustryEvent markAttendance(UUID eventId, int count) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        IndustryEvent event = store.getOwned(IndustryEvent.class, eventId, user.organizationId());
        int next = (event.getAttendanceCount() == null ? 0 : event.getAttendanceCount()) + Math.max(count, 1);
        event.setAttendanceCount(next);
        return store.save(event);
    }

    public List<Map<String, Object>> atRisk() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.COUNSELOR, Roles.FACULTY);
        UUID org = user.organizationId();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Student s : store.list(Student.class, org)) {
            List<String> reasons = riskReasons(org, s);
            if (reasons.isEmpty()) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("student", s);
            row.put("reason", String.join("; ", reasons));
            row.put("reasons", reasons);
            row.put("taskOpen", hasOpenFollowUp(org, s.getId()));
            out.add(row);
        }
        return out;
    }

    @Transactional
    public SupportTicket assignFollowUp(UUID studentId) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.COUNSELOR, Roles.FACULTY);
        Student student = store.getOwned(Student.class, studentId, user.organizationId());
        List<String> reasons = riskReasons(user.organizationId(), student);
        if (reasons.isEmpty()) {
            reasons = List.of("Counsellor follow-up requested");
        }
        SupportTicket ticket = store.list(SupportTicket.class, user.organizationId()).stream()
                .filter(t -> "FOLLOW_UP".equals(t.getCategory()) && "OPEN".equals(t.getStatus())
                        && t.getSubject() != null && t.getSubject().contains(student.getId().toString()))
                .findFirst()
                .orElse(null);
        if (ticket == null) {
            ticket = new SupportTicket();
            ticket.setOrganizationId(user.organizationId());
            ticket.setRaisedBy(user.name());
            ticket.setCategory("FOLLOW_UP");
            ticket.setSubject("Follow-up " + student.getId());
            ticket.setStatus("OPEN");
        }
        ticket.setBody(student.getFullName() + ": " + String.join("; ", reasons));
        ticket = store.save(ticket);
        Inquiry inq = store.list(Inquiry.class, user.organizationId()).stream()
                .filter(i -> student.getId().equals(i.getStudentId()))
                .findFirst()
                .orElse(null);
        if (inq != null) {
            CounselingNote note = new CounselingNote();
            note.setOrganizationId(user.organizationId());
            note.setInquiryId(inq.getId());
            note.setAuthorUserId(user.userId());
            note.setStage("FOLLOW_UP");
            note.setNote(ticket.getBody());
            store.save(note);
        }
        return ticket;
    }

    public List<Map<String, Object>> salaryBenchmarks() {
        Access.requirePackage(Auth.current(), "GROWTH");
        return List.of(
                Map.of("role", "Java Developer", "city", "Pune", "medianLpa", 6.5, "course", "Java Full Stack"),
                Map.of("role", "Data Analyst", "city", "Hyderabad", "medianLpa", 5.8, "course", "Data Analytics"),
                Map.of("role", "QA Engineer", "city", "Bengaluru", "medianLpa", 5.2, "course", "Testing")
        );
    }

    private List<String> riskReasons(UUID org, Student student) {
        List<String> reasons = new ArrayList<>();
        List<AttendanceRecord> att = store.listBy(AttendanceRecord.class, org, "studentId", student.getId());
        if (!att.isEmpty()) {
            long present = att.stream().filter(a -> "PRESENT".equals(a.getStatus())).count();
            int pct = (int) (present * 100 / att.size());
            if (att.size() >= 3 && pct < 75) {
                reasons.add("Marked present in under 75% of classes");
            }
        }
        List<Resume> resumes = store.listBy(Resume.class, org, "studentId", student.getId());
        int completeness = resumes.stream().map(Resume::getCompleteness).filter(java.util.Objects::nonNull).mapToInt(i -> i).max().orElse(0);
        if (resumes.isEmpty() || completeness < 40) {
            reasons.add("No usable resume on file");
        }
        boolean failed = store.listBy(ExamAttempt.class, org, "studentId", student.getId()).stream()
                .anyMatch(a -> a.getScore() != null && a.getMaxScore() != null && a.getMaxScore() > 0
                        && a.getScore() * 100 / a.getMaxScore() < 40
                        && a.getSubmittedAt() != null);
        if (failed) {
            reasons.add("Failed a test");
        }
        return reasons;
    }

    private boolean hasOpenFollowUp(UUID org, UUID studentId) {
        return store.list(SupportTicket.class, org).stream()
                .anyMatch(t -> "FOLLOW_UP".equals(t.getCategory()) && "OPEN".equals(t.getStatus())
                        && t.getSubject() != null && t.getSubject().contains(studentId.toString()));
    }

    private Student resolveStudent(PropelUser user, UUID studentId) {
        if (Roles.STUDENT.equals(user.role())) {
            List<Student> mine = store.listBy(Student.class, user.organizationId(), "userId", user.userId());
            if (mine.isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "No student profile");
            }
            return mine.getFirst();
        }
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.FACULTY);
        return store.getOwned(Student.class, studentId, user.organizationId());
    }

    private int attendancePct(UUID org, UUID studentId) {
        List<AttendanceRecord> att = store.listBy(AttendanceRecord.class, org, "studentId", studentId);
        if (att.isEmpty()) {
            return 100;
        }
        long present = att.stream().filter(a -> "PRESENT".equals(a.getStatus())).count();
        return (int) (present * 100 / att.size());
    }

    private String ruleJson(Drive drive) {
        if (drive.getEligibilityRuleId() == null) {
            return "";
        }
        try {
            return store.getOwned(EligibilityRule.class, drive.getEligibilityRuleId(), Auth.current().organizationId()).getRulesJson();
        } catch (Exception e) {
            return "";
        }
    }

    private static int parseInt(String json, String key, int fallback) {
        if (json == null || json.isBlank()) {
            return fallback;
        }
        String needle = "\"" + key + "\":";
        int idx = json.indexOf(needle);
        if (idx < 0) {
            needle = "\"" + key + "\": ";
            idx = json.indexOf("\"" + key + "\"");
            if (idx < 0) {
                return fallback;
            }
            int colon = json.indexOf(':', idx);
            String num = json.substring(colon + 1).replaceAll("[^0-9].*", "");
            try {
                return Integer.parseInt(num);
            } catch (NumberFormatException e) {
                return fallback;
            }
        }
        String rest = json.substring(idx + needle.length()).trim().replaceAll("[^0-9].*", "");
        try {
            return Integer.parseInt(rest);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static boolean inMonth(LocalDate day, int calendarYear, int calendarMonth) {
        return day != null && day.getYear() == calendarYear && day.getMonthValue() == calendarMonth;
    }

    private static Map<String, Object> cal(String kind, String date, String title, String detail, UUID id) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("kind", kind);
        row.put("date", date);
        row.put("title", title);
        row.put("detail", detail);
        row.put("id", id);
        return row;
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
}
