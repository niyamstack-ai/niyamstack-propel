package com.niyamstack.propel.grow;

import com.niyamstack.propel.compensation.CompensationService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.fees.FeeService;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.Roles;
import com.niyamstack.propel.sis.StudentAccountService;
import org.springframework.http.HttpStatus;
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
public class GrowService {
    private static final Set<String> STAGES = Set.of("NEW", "COUNSELING", "DEMO", "CONVERTED");

    private final Store store;
    private final FeeService fees;
    private final StudentAccountService students;
    private final CompensationService compensation;

    public GrowService(Store store, FeeService fees, StudentAccountService students, CompensationService compensation) {
        this.store = store;
        this.fees = fees;
        this.students = students;
        this.compensation = compensation;
    }

    @Transactional
    public Inquiry setStage(UUID inquiryId, String stage, String note) {
        Access.requireWrite(Auth.current(), "CRM");
        Inquiry inq = store.getOwned(Inquiry.class, inquiryId, orgId());
        String next = stage == null ? "" : stage.trim().toUpperCase();
        if (!STAGES.contains(next)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Stage must be new, counselling, demo, or converted");
        }
        if ("CONVERTED".equals(next) && inq.getStudentId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enrol the lead as a student to mark converted");
        }
        inq.setStage(next);
        store.save(inq);
        if (note != null && !note.isBlank()) {
            CounselingNote row = new CounselingNote();
            row.setOrganizationId(orgId());
            row.setInquiryId(inq.getId());
            row.setAuthorUserId(Auth.current().userId());
            row.setStage(next);
            row.setNote(note.trim());
            store.save(row);
        }
        return inq;
    }

    @Transactional
    public CounselingNote addNote(Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "CRM");
        UUID inquiryId = uuid(body, "inquiryId");
        if (inquiryId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a lead");
        }
        Inquiry inq = store.getOwned(Inquiry.class, inquiryId, orgId());
        String stage = str(body, "stage").toUpperCase();
        if (stage.isBlank()) {
            stage = "COUNSELING";
        }
        if (!STAGES.contains(stage)) {
            stage = "COUNSELING";
        }
        CounselingNote row = new CounselingNote();
        row.setOrganizationId(orgId());
        row.setInquiryId(inq.getId());
        row.setAuthorUserId(Auth.current().userId());
        row.setStage(stage);
        row.setNote(str(body, "note"));
        row.setNextAction(str(body, "nextAction"));
        String nextAt = str(body, "nextActionAt");
        if (!nextAt.isBlank()) {
            try {
                row.setNextActionAt(Instant.parse(nextAt));
            } catch (Exception ex) {
                row.setNextActionAt(LocalDate.parse(nextAt.length() >= 10 ? nextAt.substring(0, 10) : nextAt)
                        .atStartOfDay(java.time.ZoneId.systemDefault()).toInstant());
            }
        }
        row = store.save(row);
        if (!"CONVERTED".equals(inq.getStage())) {
            inq.setStage(stage);
            store.save(inq);
        }
        return row;
    }

    @Transactional
    public Map<String, Object> convert(UUID inquiryId, Map<String, String> body) {
        Access.requireWrite(Auth.current(), "CRM");
        Inquiry inquiry = store.getOwned(Inquiry.class, inquiryId, orgId());
        Student seed = new Student();
        seed.setCenterId(inquiry.getCenterId());
        seed.setCourseId(inquiry.getCourseId());
        if (body != null && body.get("courseId") != null && !body.get("courseId").isBlank()) {
            seed.setCourseId(UUID.fromString(body.get("courseId")));
        }
        if (body != null && body.get("batchId") != null && !body.get("batchId").isBlank()) {
            seed.setBatchId(UUID.fromString(body.get("batchId")));
        }
        seed.setStudentCode("STU-" + System.currentTimeMillis() % 100000);
        seed.setFullName(inquiry.getFullName());
        seed.setEmail(inquiry.getEmail());
        String phone = StudentAccountService.requireMobile(inquiry.getPhone());
        seed.setPhone(phone);
        seed.setStatus("ENROLLED");
        boolean phoneTaken = store.findUserByPhone(phone) != null;
        boolean emailTaken = inquiry.getEmail() != null && !inquiry.getEmail().isBlank()
                && store.findUserByEmail(inquiry.getEmail().trim().toLowerCase()) != null;
        Map<String, Object> enrolled;
        if (phoneTaken || emailTaken) {
            seed.setOrganizationId(orgId());
            seed.setEnrollmentDate(LocalDate.now());
            Student saved = store.save(seed);
            enrolled = new LinkedHashMap<>();
            enrolled.put("id", saved.getId());
            enrolled.put("fullName", saved.getFullName());
            enrolled.put("studentCode", saved.getStudentCode());
        } else {
            enrolled = students.enrollFromOwner(seed);
        }
        Object id = enrolled.get("id");
        UUID studentId = id instanceof UUID u ? u : UUID.fromString(String.valueOf(id));
        inquiry.setStage("CONVERTED");
        inquiry.setStudentId(studentId);
        if (inquiry.getCounselorUserId() == null) {
            inquiry.setCounselorUserId(Auth.current().userId());
        }
        store.save(inquiry);
        UUID courseId = seed.getCourseId();
        UUID batchId = seed.getBatchId();
        boolean autoFees = body == null || body.get("autoFees") == null || !"false".equalsIgnoreCase(body.get("autoFees"));
        if (autoFees && courseId != null) {
            if (body != null && body.get("feePlanId") != null && !body.get("feePlanId").isBlank()) {
                try {
                    List<FeeInstallment> inst = fees.scheduleInstallments(UUID.fromString(body.get("feePlanId")), studentId);
                    enrolled.put("feeScheduled", !inst.isEmpty());
                    enrolled.put("installments", inst.size());
                } catch (Exception ignored) {
                    enrolled.put("feeScheduled", false);
                }
            } else {
                List<FeeInstallment> inst = fees.scheduleDefaultForStudent(studentId, courseId, batchId);
                enrolled.put("feeScheduled", !inst.isEmpty());
                enrolled.put("installments", inst.size());
            }
        }
        enrolled.put("inquiryId", inquiry.getId());
        enrolled.put("stage", "CONVERTED");
        compensation.accrueOnConversion(inquiry);
        return enrolled;
    }

    @Transactional
    public Map<String, Object> importInquiries(Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "CRM");
        String csv = str(body, "csv");
        if (csv.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Paste a CSV with a header row");
        }
        List<String[]> rows = parseCsv(csv);
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CSV has no data rows");
        }
        Map<String, Integer> cols = header(rows.get(0), "fullName", "phone", "email", "source");
        int created = 0;
        int skipped = 0;
        for (int i = 1; i < rows.size(); i++) {
            String[] row = rows.get(i);
            String name = cell(row, cols, "fullName");
            String phone = Phones.normalize(cell(row, cols, "phone"));
            String email = cell(row, cols, "email");
            String source = upper(cell(row, cols, "source"), "WEB");
            if (name.isBlank() || phone.isBlank()) {
                skipped++;
                continue;
            }
            Inquiry inq = new Inquiry();
            inq.setOrganizationId(orgId());
            inq.setFullName(name);
            inq.setPhone(phone);
            inq.setEmail(email.isBlank() ? null : email.toLowerCase());
            inq.setSource(source);
            inq.setStage("NEW");
            inq.setCounselorUserId(Auth.current().userId());
            store.save(inq);
            created++;
        }
        return Map.of("created", created, "skipped", skipped);
    }

    @Transactional
    public Inquiry assignCounselor(UUID inquiryId, UUID counselorUserId) {
        Access.requireWrite(Auth.current(), "CRM");
        Inquiry inq = store.getOwned(Inquiry.class, inquiryId, orgId());
        inq.setCounselorUserId(counselorUserId);
        return store.save(inq);
    }

    @Transactional
    public Map<String, Object> publicLanding(String slug, String pageSlug) {
        Organization org = store.findOrgBySlug(slug);
        if (org == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Institute not found");
        }
        LandingPage page = store.list(LandingPage.class, org.getId()).stream()
                .filter(p -> pageSlug.equalsIgnoreCase(blank(p.getSlug(), "")))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Landing page not found"));
        if (!page.isPublished()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "This landing page is not published");
        }
        page.setViewsCount((page.getViewsCount() == null ? 0 : page.getViewsCount()) + 1);
        store.save(page);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", page.getId());
        out.put("name", page.getName());
        out.put("slug", page.getSlug());
        out.put("pageKind", page.getPageKind());
        out.put("headline", page.getHeadline());
        out.put("body", page.getBody());
        out.put("ctaLabel", page.getCtaLabel() == null || page.getCtaLabel().isBlank() ? "Register now" : page.getCtaLabel());
        out.put("courseId", page.getCourseId());
        out.put("formJson", page.getFormJson() == null ? "" : page.getFormJson());
        out.put("instituteName", org.getName());
        out.put("viewsCount", page.getViewsCount());
        out.put("leadsCount", page.getLeadsCount());
        return out;
    }

    @Transactional
    public void attributeLead(Inquiry inquiry, String landingSlug, String referralCode) {
        if (inquiry == null) {
            return;
        }
        if (landingSlug != null && !landingSlug.isBlank()) {
            store.list(LandingPage.class, inquiry.getOrganizationId()).stream()
                    .filter(p -> landingSlug.equalsIgnoreCase(blank(p.getSlug(), "")))
                    .findFirst()
                    .ifPresent(page -> {
                        inquiry.setLandingPageId(page.getId());
                        inquiry.setSource("CAMPAIGN");
                        page.setLeadsCount((page.getLeadsCount() == null ? 0 : page.getLeadsCount()) + 1);
                        store.save(page);
                    });
        }
        if (referralCode != null && !referralCode.isBlank()) {
            String code = referralCode.trim().toUpperCase();
            inquiry.setReferralCode(code);
            inquiry.setSource("REFERRAL");
            store.list(Referral.class, inquiry.getOrganizationId()).stream()
                    .filter(r -> code.equalsIgnoreCase(blank(r.getCode(), "")))
                    .findFirst()
                    .ifPresent(ref -> {
                        ref.setInquiryId(inquiry.getId());
                        ref.setStatus("ATTRIBUTED");
                        store.save(ref);
                    });
        }
        store.save(inquiry);
    }

    @Transactional
    public Referral issueReferral(Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "CRM");
        Referral ref = new Referral();
        ref.setOrganizationId(orgId());
        ref.setReferrerName(blank(str(body, "referrerName"), "Referrer"));
        ref.setReferrerType(blank(str(body, "referrerType"), "STUDENT"));
        ref.setStudentId(uuid(body, "studentId"));
        ref.setIncentiveAmount(decimal(body, "incentiveAmount"));
        ref.setStatus("ACTIVE");
        String code = str(body, "code").toUpperCase();
        if (code.isBlank()) {
            code = "REF-" + Long.toString(System.currentTimeMillis() % 1_000_000, 36).toUpperCase();
        }
        ref.setCode(code);
        return store.save(ref);
    }

    @Transactional
    public Scholarship requestScholarship(Map<String, Object> body) {
        Access.requireWrite(Auth.current(), "CRM");
        Scholarship sch = new Scholarship();
        sch.setOrganizationId(orgId());
        sch.setName(blank(str(body, "name"), "Scholarship"));
        sch.setPercent(decimal(body, "percent"));
        sch.setAmount(decimal(body, "amount"));
        sch.setStudentId(uuid(body, "studentId"));
        sch.setApprovalStatus("PENDING");
        ApprovalRequest req = new ApprovalRequest();
        req.setOrganizationId(orgId());
        req.setKind("DISCOUNT");
        req.setStatus("PENDING");
        req.setStudentId(sch.getStudentId());
        req.setAmount(sch.getAmount());
        req.setNote(sch.getName());
        req.setRequestedBy(Auth.current().userId());
        req = store.save(req);
        sch.setApprovalRequestId(req.getId());
        sch = store.save(sch);
        req.setPayloadJson("{\"scholarshipId\":\"" + sch.getId() + "\"}");
        store.save(req);
        return sch;
    }

    @Transactional
    public void onApprovalDecided(ApprovalRequest req) {
        if (req == null || req.getPayloadJson() == null || req.getPayloadJson().isBlank()) {
            return;
        }
        String json = req.getPayloadJson();
        int i = json.indexOf("scholarshipId");
        if (i < 0) {
            return;
        }
        int q = json.indexOf('"', json.indexOf(':', i));
        int q2 = json.indexOf('"', q + 1);
        if (q < 0 || q2 < 0) {
            return;
        }
        UUID schId = UUID.fromString(json.substring(q + 1, q2));
        Scholarship sch = store.getOwned(Scholarship.class, schId, orgId());
        sch.setApprovalStatus(req.getStatus());
        if ("APPROVED".equals(req.getStatus()) && sch.getStudentId() != null) {
            BigDecimal credit = sch.getAmount();
            if (credit == null || credit.signum() <= 0) {
                Invoice due = store.listBy(Invoice.class, orgId(), "studentId", sch.getStudentId()).stream()
                        .filter(inv -> !"PAID".equals(inv.getStatus()) && !"CANCELLED".equals(inv.getStatus()))
                        .findFirst()
                        .orElse(null);
                if (due != null && sch.getPercent() != null && sch.getPercent().signum() > 0) {
                    credit = due.getAmount().multiply(sch.getPercent()).divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
                }
            }
            if (credit != null && credit.signum() > 0) {
                Invoice due = store.listBy(Invoice.class, orgId(), "studentId", sch.getStudentId()).stream()
                        .filter(inv -> !"PAID".equals(inv.getStatus()) && !"CANCELLED".equals(inv.getStatus()))
                        .findFirst()
                        .orElse(null);
                if (due != null) {
                    fees.collect(due.getId(), credit, "SCHOLARSHIP", "SCH-" + sch.getId().toString().substring(0, 8));
                    sch.setInvoiceId(due.getId());
                }
            }
        }
        store.save(sch);
    }

    public List<Map<String, Object>> publicOfferings(String slug) {
        Organization org = store.findOrgBySlug(slug);
        if (org == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Institute not found");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (OneToOneSession s : store.list(OneToOneSession.class, org.getId())) {
            if (!"OPEN".equalsIgnoreCase(blank(s.getStatus(), "")) || s.getStudentId() != null) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", s.getId());
            row.put("title", s.getTitle());
            row.put("mentorName", s.getMentorName());
            row.put("durationMinutes", s.getDurationMinutes());
            row.put("price", s.getPrice());
            row.put("status", s.getStatus());
            out.add(row);
        }
        return out;
    }

    public List<Map<String, Object>> publicBanners(String slug) {
        Organization org = store.findOrgBySlug(slug);
        if (org == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Institute not found");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (AppBanner b : store.list(AppBanner.class, org.getId())) {
            if (!b.isLive()) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", b.getId());
            row.put("title", b.getTitle());
            row.put("imageUrl", b.getImageUrl());
            row.put("linkUrl", b.getLinkUrl());
            out.add(row);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> bookSession(UUID offeringId, Map<String, Object> body) {
        Access.requireTenant(Auth.current());
        if (!Roles.STUDENT.equals(Auth.current().role()) && !Roles.OWNER.equals(Auth.current().role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Students book 1:1 sessions from the institute website");
        }
        OneToOneSession offering = store.getOwned(OneToOneSession.class, offeringId, orgId());
        if (offering.getStudentId() != null || !"OPEN".equalsIgnoreCase(blank(offering.getStatus(), "OPEN"))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "That session is not open to book");
        }
        Student me = currentStudent();
        OneToOneSession booking = new OneToOneSession();
        booking.setOrganizationId(orgId());
        booking.setTitle(offering.getTitle());
        booking.setMentorName(offering.getMentorName());
        booking.setDurationMinutes(offering.getDurationMinutes());
        booking.setPrice(offering.getPrice());
        booking.setMeetingUrl(offering.getMeetingUrl());
        booking.setOfferingId(offering.getId());
        booking.setStudentId(me.getId());
        booking.setStatus("BOOKED");
        Instant starts = Instant.now().plusSeconds(86400);
        if (!str(body, "startsAt").isBlank()) {
            starts = Instant.parse(str(body, "startsAt"));
        }
        booking.setStartsAt(starts);
        booking = store.save(booking);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", booking.getId());
        out.put("status", booking.getStatus());
        out.put("meetingUrl", booking.getMeetingUrl());
        out.put("startsAt", booking.getStartsAt());
        out.put("title", booking.getTitle());
        if (booking.getPrice() != null && booking.getPrice().signum() > 0) {
            Invoice invoice = new Invoice();
            invoice.setOrganizationId(orgId());
            invoice.setStudentId(me.getId());
            invoice.setAmount(booking.getPrice());
            invoice.setBuyerName(me.getFullName());
            invoice.setGstRate(BigDecimal.ZERO);
            invoice.setStatus("DUE");
            invoice.setDueDate(LocalDate.now().plusDays(3));
            invoice.setSacCode("999293");
            invoice = fees.finalizeInvoice(invoice);
            booking.setInvoiceId(invoice.getId());
            store.save(booking);
            out.put("invoiceId", invoice.getId());
            out.put("invoiceNo", invoice.getInvoiceNo());
            out.put("amount", invoice.getAmount());
        }
        return out;
    }

    public void ensureTemplates() {
        Access.requireTenant(Auth.current());
        List<String[]> seeds = List.of(
                new String[]{"FEE_REMINDER", "WHATSAPP", "Fee reminder: {{amount}} is due for {{name}}. Pay on your institute website."},
                new String[]{"FEE_REMINDER", "EMAIL", "Hello {{name}}, a fee of {{amount}} is due. Open your student login to pay."},
                new String[]{"ATTENDANCE", "WHATSAPP", "{{name}} was marked {{status}} today."},
                new String[]{"ATTENDANCE", "EMAIL", "Attendance update for {{name}}: {{status}}."},
                new String[]{"TEST", "WHATSAPP", "{{name}}, a test is published. Open the student app to attempt it."},
                new String[]{"TEST", "EMAIL", "A new test is ready for {{name}}. Log in to attempt it."}
        );
        for (String[] seed : seeds) {
            boolean exists = store.list(MessageTemplate.class, orgId()).stream()
                    .anyMatch(t -> seed[0].equalsIgnoreCase(blank(t.getEventType(), "")) && seed[1].equalsIgnoreCase(blank(t.getChannel(), "")));
            if (exists) {
                continue;
            }
            MessageTemplate t = new MessageTemplate();
            t.setOrganizationId(orgId());
            t.setEventType(seed[0]);
            t.setChannel(seed[1]);
            t.setBody(seed[2]);
            store.save(t);
        }
    }

    private Student currentStudent() {
        if (Roles.OWNER.equals(Auth.current().role())) {
            return store.list(Student.class, orgId()).stream().findFirst()
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "No student to book for"));
        }
        return store.list(Student.class, orgId()).stream()
                .filter(s -> Auth.current().userId().equals(s.getUserId()))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "Student record not found"));
    }

    private UUID orgId() {
        return Auth.current().organizationId();
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

    private static BigDecimal decimal(Map<String, ?> body, String key) {
        String s = str(body, key);
        if (s.isBlank()) {
            return null;
        }
        return new BigDecimal(s);
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }

    private static String upper(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim().toUpperCase();
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
                idx = cols.get("name");
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
