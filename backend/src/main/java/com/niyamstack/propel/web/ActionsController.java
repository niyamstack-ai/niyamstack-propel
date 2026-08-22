package com.niyamstack.propel.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.niyamstack.propel.comms.OutreachService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.fees.FeeService;
import com.niyamstack.propel.integration.IntegrationStatusService;
import com.niyamstack.propel.integration.ObjectStorage;
import com.niyamstack.propel.integration.OrgSecrets;
import com.niyamstack.propel.lms.LmsService;
import com.niyamstack.propel.placement.PlacementService;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.Roles;
import com.niyamstack.propel.storefront.StorefrontService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.net.InetAddress;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/actions")
public class ActionsController {
    private final Store store;
    private final FeeService fees;
    private final LmsService lms;
    private final PlacementService placement;
    private final IntegrationStatusService integrations;

    private final StorefrontService storefront;
    private final ObjectStorage storage;
    private final OutreachService outreach;
    private final ObjectMapper mapper = new ObjectMapper();

    public ActionsController(Store store, FeeService fees, LmsService lms, PlacementService placement,
                             IntegrationStatusService integrations, StorefrontService storefront, ObjectStorage storage,
                             OutreachService outreach) {
        this.store = store;
        this.fees = fees;
        this.lms = lms;
        this.placement = placement;
        this.integrations = integrations;
        this.storefront = storefront;
        this.storage = storage;
        this.outreach = outreach;
    }

    @GetMapping("/my-courses")
    public List<Map<String, Object>> myCourses() {
        Access.requireAny(Auth.current(), Roles.STUDENT, Roles.OWNER, Roles.FACULTY);
        return storefront.myCourses(Auth.current().organizationId(), Auth.current().userId());
    }

    @GetMapping("/student-home")
    public Map<String, Object> studentHome() {
        Access.requireAny(Auth.current(), Roles.STUDENT);
        return storefront.studentHome(Auth.current().organizationId(), Auth.current().userId());
    }

    @GetMapping("/integrations")
    public Map<String, Object> integrations() {
        return integrations.status();
    }

    @PostMapping("/inquiries/{id}/convert")
    public Student convert(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Access.requireWrite(Auth.current(), "CRM");
        var org = Auth.current().organizationId();
        Inquiry inquiry = store.getOwned(Inquiry.class, id, org);
        Student student = new Student();
        student.setOrganizationId(org);
        student.setCenterId(inquiry.getCenterId());
        student.setCourseId(inquiry.getCourseId());
        if (body.get("courseId") != null && !body.get("courseId").isBlank()) {
            student.setCourseId(UUID.fromString(body.get("courseId")));
        }
        if (body.get("batchId") != null && !body.get("batchId").isBlank()) {
            student.setBatchId(UUID.fromString(body.get("batchId")));
        }
        student.setStudentCode("STU-" + System.currentTimeMillis() % 100000);
        student.setFullName(inquiry.getFullName());
        student.setEmail(inquiry.getEmail());
        student.setPhone(inquiry.getPhone());
        student.setStatus("ENROLLED");
        student.setEnrollmentDate(LocalDate.now());
        student = store.save(student);
        inquiry.setStage("CONVERTED");
        inquiry.setStudentId(student.getId());
        store.save(inquiry);
        return student;
    }

    @PostMapping("/invoices/{id}/collect")
    public Map<String, Object> collect(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        BigDecimal amount = body.get("amount") == null ? null : new BigDecimal(body.get("amount"));
        return fees.collect(id, amount, body.getOrDefault("method", "UPI"));
    }

    @PostMapping("/invoices/{id}/confirm")
    public Map<String, Object> confirmInvoice(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return fees.confirmCheckout(id, body.get("orderId"), body.get("paymentId"), body.get("signature"));
    }

    @GetMapping("/gstr1")
    public List<Map<String, Object>> gstr1(@RequestParam(required = false) String from, @RequestParam(required = false) String to) {
        LocalDate start = from == null || from.isBlank() ? null : LocalDate.parse(from);
        LocalDate end = to == null || to.isBlank() ? null : LocalDate.parse(to);
        return fees.gstr1(start, end);
    }

    @PostMapping("/campaigns/{id}/launch")
    public Campaign launchCampaign(@PathVariable UUID id) {
        return outreach.launch(id);
    }

    @PostMapping("/notices/send")
    public Map<String, Object> sendNotice(@RequestBody Map<String, String> body) {
        return outreach.sendNotice(body.get("channel"), body.get("title"), body.get("body"));
    }

    @PostMapping("/pushes/send")
    public AppPush sendPush(@RequestBody Map<String, String> body) {
        return outreach.sendPush(body.get("title"), body.get("body"), body.get("audience"));
    }

    @PostMapping("/fee-plans/{planId}/schedule/{studentId}")
    public List<FeeInstallment> schedule(@PathVariable UUID planId, @PathVariable UUID studentId) {
        return fees.scheduleInstallments(planId, studentId);
    }

    @GetMapping("/dues")
    public List<Invoice> dues() {
        return fees.dues();
    }

    @PostMapping("/payments/{id}/refunds")
    public Refund requestRefund(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        BigDecimal amount = body.get("amount") == null ? null : new BigDecimal(body.get("amount"));
        return fees.requestRefund(id, amount, body.get("reason"));
    }

    @PostMapping("/refunds/{id}/decide")
    public Refund decideRefund(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return fees.decideRefund(id, Boolean.parseBoolean(body.getOrDefault("approve", "false")));
    }

    @PostMapping("/content/upload")
    public ContentItem upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "batchId", required = false) UUID batchId,
            @RequestParam(value = "courseId", required = false) UUID courseId,
            @RequestParam(value = "contentType", required = false) String contentType,
            @RequestParam(value = "parentFolderId", required = false) UUID parentFolderId
    ) {
        return lms.upload(file, batchId, courseId, title, contentType, parentFolderId);
    }

    @PostMapping("/lms-packages")
    public LmsPackage registerPackage(@RequestBody Map<String, String> body) {
        return lms.registerPackage(
                UUID.fromString(body.get("contentItemId")),
                body.getOrDefault("standard", "SCORM_1.2"),
                body.get("launchUrl"),
                body.getOrDefault("version", "1.0"));
    }

    @PostMapping("/lms-packages/{id}/launch")
    public LmsLaunch launch(@PathVariable UUID id) {
        return lms.launch(id);
    }

    @PostMapping("/live-sessions/schedule")
    public LiveSession scheduleLive(@RequestBody Map<String, String> body) {
        Instant starts = body.get("startsAt") == null ? Instant.now().plusSeconds(3600) : Instant.parse(body.get("startsAt"));
        UUID batchId = body.get("batchId") == null ? null : UUID.fromString(body.get("batchId"));
        return lms.scheduleLive(body.getOrDefault("title", "Live class"), batchId, starts);
    }

    @PostMapping("/assignments/{id}/submit")
    public Submission submitAssignment(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return lms.submitAssignment(id, body.get("content"), body.get("fileUrl"));
    }

    @PostMapping("/submissions/upload")
    public Map<String, String> uploadSubmission(@RequestParam("file") MultipartFile file) {
        return lms.uploadSubmissionFile(file);
    }

    @PostMapping("/submissions/{id}/grade")
    public Submission grade(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return lms.grade(id, body.get("grade"), body.get("feedback"));
    }

    @PostMapping("/courses/{courseId}/quizzes")
    public Assessment saveCourseQuiz(@PathVariable UUID courseId, @RequestBody LmsService.CourseQuizInput body) {
        return lms.saveCourseQuiz(courseId, body);
    }

    @PostMapping("/quizzes")
    public Assessment saveQuiz(@RequestBody LmsService.CourseQuizInput body) {
        return lms.saveCourseQuiz(null, body);
    }

    @GetMapping("/code/languages")
    public Map<String, Object> codeLanguages(@RequestParam(required = false) UUID courseId) {
        return lms.codeLanguages(courseId);
    }

    @PostMapping("/code/run")
    public Map<String, Object> runCode(@RequestBody Map<String, String> body) {
        UUID questionId = body.get("questionId") == null ? null : UUID.fromString(body.get("questionId"));
        if (questionId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "questionId is required");
        }
        return lms.runCode(questionId, body.get("source"), body.get("stdin"));
    }

    @GetMapping("/courses/{courseId}/practice")
    public Map<String, Object> practiceLab(@PathVariable UUID courseId) {
        return lms.practiceLab(courseId);
    }

    @PostMapping("/code/practice")
    public Map<String, Object> runPractice(@RequestBody Map<String, String> body) {
        UUID courseId = body.get("courseId") == null ? null : UUID.fromString(body.get("courseId"));
        if (courseId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "courseId is required");
        }
        return lms.runPractice(courseId, body.get("language"), body.get("source"), body.get("stdin"));
    }

    @PostMapping("/courses/{courseId}/content/arrange")
    public Map<String, String> arrangeCourseContent(@PathVariable UUID courseId, @RequestBody LmsService.ArrangeRequest body) {
        lms.arrangeCourseContent(courseId, body);
        return Map.of("status", "ok");
    }

    @PostMapping("/assessments/{id}/start")
    public ExamAttempt startExam(@PathVariable UUID id) {
        return lms.startExam(id);
    }

    @GetMapping("/assessments/{id}/paper")
    public List<Map<String, Object>> examPaper(@PathVariable UUID id) {
        return lms.examPaper(id);
    }

    @PostMapping("/attempts/{id}/draft")
    public ExamAttempt saveExamDraft(@PathVariable UUID id, @RequestBody Map<String, String> answers) {
        return lms.saveExamDraft(id, answers);
    }

    @PostMapping("/attempts/{id}/submit")
    public Map<String, Object> submitExam(@PathVariable UUID id, @RequestBody(required = false) Map<String, String> answers) {
        String reason = answers == null ? null : answers.remove("_reason");
        return lms.submitExam(id, answers == null ? Map.of() : answers, reason);
    }

    @GetMapping("/attempts/{id}/result")
    public Map<String, Object> examResult(@PathVariable UUID id) {
        return lms.examResult(id);
    }

    @GetMapping("/progress/{studentId}")
    public Map<String, Object> progress(@PathVariable UUID studentId) {
        return lms.progress(studentId);
    }

    @PostMapping("/content/{id}/view")
    public Map<String, Object> markContentViewed(@PathVariable UUID id) {
        return lms.markContentViewed(id);
    }

    @GetMapping("/receipts/{id}")
    public Map<String, Object> receipt(@PathVariable UUID id) {
        return fees.receipt(id);
    }

    @GetMapping("/eligibility/{driveId}/{studentId}")
    public Map<String, Object> eligibility(@PathVariable UUID driveId, @PathVariable UUID studentId) {
        return placement.eligibility(driveId, studentId);
    }

    @PostMapping("/drives/{driveId}/apply/{studentId}")
    public Application apply(@PathVariable UUID driveId, @PathVariable UUID studentId) {
        return placement.apply(driveId, studentId);
    }

    @PostMapping("/drives/{driveId}/rounds")
    public DriveRound addRound(@PathVariable UUID driveId, @RequestBody Map<String, String> body) {
        int seq = Integer.parseInt(body.getOrDefault("seqNo", "1"));
        return placement.addRoundTemplate(driveId, seq, body.getOrDefault("roundName", "Round"), body.getOrDefault("roundType", "TECHNICAL"));
    }

    @PostMapping("/applications/{id}/rounds")
    public InterviewRound recordRound(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return placement.recordRound(id, body.getOrDefault("roundName", "Round"), body.get("outcome"), body.get("feedback"), body.get("panel"));
    }

    @PostMapping("/applications/{id}/offer")
    public Offer offer(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        BigDecimal pkg = body.get("packageLpa") == null ? BigDecimal.ZERO : new BigDecimal(body.get("packageLpa"));
        LocalDate joining = body.get("joiningDate") == null ? LocalDate.now().plusMonths(1) : LocalDate.parse(body.get("joiningDate"));
        return placement.offer(id, pkg, joining, body.get("notes"));
    }

    @PostMapping("/applications/{id}/advance")
    public Application advance(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return placement.advance(id, body.getOrDefault("status", "SHORTLISTED"));
    }

    @PostMapping("/attendance/biometric")
    public AttendanceRecord biometric(@RequestBody Map<String, String> body) {
        Access.requirePackage(Auth.current(), "ENTERPRISE");
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.FACULTY);
        AttendanceRecord rec = new AttendanceRecord();
        rec.setOrganizationId(Auth.current().organizationId());
        rec.setStudentId(UUID.fromString(body.get("studentId")));
        if (body.get("batchId") != null) rec.setBatchId(UUID.fromString(body.get("batchId")));
        rec.setSessionDate(LocalDate.parse(body.getOrDefault("sessionDate", LocalDate.now().toString())));
        rec.setStatus("PRESENT");
        rec.setSource("BIOMETRIC");
        return store.save(rec);
    }

    @GetMapping("/readiness/{studentId}")
    public Map<String, Object> readiness(@PathVariable UUID studentId) {
        UUID org = Auth.current().organizationId();
        store.getOwned(Student.class, studentId, org);
        List<AttendanceRecord> att = store.listBy(AttendanceRecord.class, org, "studentId", studentId);
        long present = att.stream().filter(a -> "PRESENT".equals(a.getStatus())).count();
        int attendance = att.isEmpty() ? 100 : (int) (present * 100 / att.size());
        int skills = store.listBy(Skill.class, org, "studentId", studentId).size() * 12;
        int mocks = store.listBy(MockInterview.class, org, "studentId", studentId).stream()
                .map(MockInterview::getScore).filter(Objects::nonNull).mapToInt(i -> i).max().orElse(0);
        List<Resume> resumes = store.listBy(Resume.class, org, "studentId", studentId);
        int resume = resumes.stream().map(Resume::getCompleteness).filter(Objects::nonNull).mapToInt(i -> i).max().orElse(40);
        int score = Math.min(100, (attendance * 25 + Math.min(skills, 100) * 25 + mocks * 25 + resume * 25) / 100);
        String band = score >= 80 ? "Placement ready" : score >= 60 ? "Near ready" : "Needs intervention";
        return Map.of("studentId", studentId, "score", score, "band", band, "attendance", attendance, "resume", resume, "mock", mocks);
    }

    @GetMapping("/at-risk")
    public List<Map<String, Object>> atRisk() {
        UUID org = Auth.current().organizationId();
        List<Student> students = store.list(Student.class, org);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Student s : students) {
            Map<String, Object> r = readiness(s.getId());
            int score = (int) r.get("score");
            int attendance = (int) r.get("attendance");
            List<AttendanceRecord> att = store.listBy(AttendanceRecord.class, org, "studentId", s.getId());
            boolean lowAttendance = att.size() >= 3 && attendance < 75;
            boolean lowReady = score < 60 && (att.size() >= 3 || ((int) r.get("mock")) > 0);
            if (!lowAttendance && !lowReady) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("student", s);
            row.put("readiness", r);
            row.put("reason", lowAttendance ? "Marked present in under 75% of classes" : "Placement readiness is below 60");
            out.add(row);
        }
        return out;
    }

    @PostMapping("/ai/resume")
    public Map<String, String> aiResume(@RequestBody Map<String, String> body) {
        Access.requirePackage(Auth.current(), "ENTERPRISE");
        return Map.of("suggestion",
                "Tighten the summary to 3 lines. Lead with Java, Spring Boot, and PostgreSQL. Quantify projects (users, latency, test coverage). Add a skills inventory matching drive JDs. Keep education after experience.");
    }

    @PostMapping("/ai/coach")
    public Map<String, String> aiCoach(@RequestBody Map<String, String> body) {
        Access.requirePackage(Auth.current(), "ENTERPRISE");
        String q = body.getOrDefault("question", "How do I prepare?");
        return Map.of("answer",
                "For '" + q + "': complete the current module assignment, revise last two recorded lectures, and attempt the aptitude set. Target roles: Java developer and QA automation. Next mock: DSA + HR.");
    }

    @PostMapping("/ai/career")
    public Map<String, Object> aiCareer(@RequestBody Map<String, String> body) {
        Access.requirePackage(Auth.current(), "ENTERPRISE");
        return Map.of(
                "path", "Java Full Stack → Backend Engineer → Platform Engineer",
                "skills", List.of("Spring Boot", "PostgreSQL", "Redis", "System design"),
                "matches", List.of("Infosys SES", "TCS Digital", "Product-startup SDE-1")
        );
    }

    @GetMapping("/salary-benchmarks")
    public List<Map<String, Object>> benchmarks() {
        Access.requirePackage(Auth.current(), "ENTERPRISE");
        return List.of(
                Map.of("role", "Java Developer", "city", "Pune", "medianLpa", 6.5, "course", "Java Full Stack"),
                Map.of("role", "Data Analyst", "city", "Hyderabad", "medianLpa", 5.8, "course", "Data Analytics"),
                Map.of("role", "QA Engineer", "city", "Bengaluru", "medianLpa", 5.2, "course", "Java Full Stack")
        );
    }

    @PostMapping("/media/upload")
    public Map<String, String> uploadMedia(@RequestParam("file") MultipartFile file) {
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.FACULTY, Roles.COUNSELOR, Roles.ACCOUNTANT);
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a file");
        }
        if (file.getSize() > 15L * 1024 * 1024) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "File must be 15 MB or smaller");
        }
        try {
            var stored = storage.put(Auth.current().organizationId(), file.getOriginalFilename(), file.getContentType(),
                    file.getInputStream(), file.getSize());
            String publicUrl = stored.url().replace("/api/files/", "/api/public/media/");
            Map<String, String> out = new LinkedHashMap<>();
            out.put("url", publicUrl);
            out.put("fileName", file.getOriginalFilename() == null ? "file" : file.getOriginalFilename());
            return out;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Upload failed");
        }
    }

    @GetMapping("/invoices/{id}/tax")
    public Map<String, Object> taxInvoice(@PathVariable UUID id) {
        return fees.taxInvoice(id);
    }

    @GetMapping("/live-keys")
    public Map<String, Object> liveKeys() {
        Access.requireAny(Auth.current(), Roles.OWNER);
        Organization org = store.get(Organization.class, Auth.current().organizationId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("razorpay", OrgSecrets.has(org, "razorpayKeyId") && OrgSecrets.has(org, "razorpayKeySecret"));
        out.put("whatsapp", OrgSecrets.has(org, "whatsappToken") && OrgSecrets.has(org, "whatsappPhoneId"));
        out.put("smtp", OrgSecrets.has(org, "smtpHost") && OrgSecrets.has(org, "smtpUser"));
        out.put("webhook", OrgSecrets.has(org, "razorpayWebhookSecret"));
        out.put("gstState", OrgSecrets.live(org, "gstState"));
        out.put("invoiceSeries", OrgSecrets.live(org, "invoiceSeries"));
        out.put("smtpHost", OrgSecrets.live(org, "smtpHost"));
        out.put("smtpPort", OrgSecrets.live(org, "smtpPort"));
        out.put("smtpUser", OrgSecrets.live(org, "smtpUser"));
        out.put("smtpFrom", OrgSecrets.live(org, "smtpFrom"));
        return out;
    }

    @PutMapping("/live-keys")
    public Map<String, Object> saveLiveKeys(@RequestBody Map<String, String> body) {
        Access.requireAny(Auth.current(), Roles.OWNER);
        Organization org = store.get(Organization.class, Auth.current().organizationId());
        ObjectNode root;
        try {
            JsonNode parsed = org.getSettingsJson() == null || org.getSettingsJson().isBlank()
                    ? mapper.createObjectNode()
                    : mapper.readTree(org.getSettingsJson());
            root = parsed.isObject() ? (ObjectNode) parsed : mapper.createObjectNode();
        } catch (Exception e) {
            root = mapper.createObjectNode();
        }
        ObjectNode live = root.has("live") && root.get("live").isObject()
                ? (ObjectNode) root.get("live")
                : root.putObject("live");
        putIfPresent(live, body, "razorpayKeyId");
        putIfPresent(live, body, "razorpayKeySecret");
        putIfPresent(live, body, "whatsappToken");
        putIfPresent(live, body, "whatsappPhoneId");
        putIfPresent(live, body, "smtpHost");
        putIfPresent(live, body, "smtpPort");
        putIfPresent(live, body, "smtpUser");
        putIfPresent(live, body, "smtpPass");
        putIfPresent(live, body, "smtpFrom");
        putIfPresent(live, body, "razorpayWebhookSecret");
        putIfPresent(live, body, "gstState");
        putIfPresent(live, body, "invoiceSeries");
        try {
            org.setSettingsJson(mapper.writeValueAsString(root));
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Could not save keys");
        }
        store.save(org);
        return liveKeys();
    }

    private static void putIfPresent(ObjectNode live, Map<String, String> body, String key) {
        if (!body.containsKey(key)) {
            return;
        }
        String value = body.get(key);
        if (value == null || value.isBlank()) {
            return;
        }
        live.put(key, value.trim());
    }

    @GetMapping("/domain/status")
    public Map<String, Object> domainStatus() {
        Access.requireAny(Auth.current(), Roles.OWNER);
        Organization org = store.get(Organization.class, Auth.current().organizationId());
        String host = org.getCustomDomain() == null ? "" : org.getCustomDomain().trim().toLowerCase()
                .replaceFirst("^https?://", "").replaceAll("/.*", "");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("host", host);
        out.put("resolves", false);
        out.put("nginx", nginxBlock(host.isBlank() ? "yourdomain.com" : host));
        if (host.isBlank()) {
            out.put("message", "Save a domain first.");
            return out;
        }
        try {
            InetAddress.getAllByName(host);
            out.put("resolves", true);
            out.put("message", "DNS has an address. Paste the nginx block on your VPS, then issue SSL with certbot.");
        } catch (Exception e) {
            out.put("message", "This domain does not resolve yet. Add the CNAME at your registrar, wait a few minutes, then check again.");
        }
        return out;
    }

    private static String nginxBlock(String host) {
        return """
                # Same VPS as Niyamstack Propel. Then: sudo certbot --nginx -d %s
                server {
                  listen 80;
                  server_name %s www.%s;
                  location /api/ {
                    proxy_pass http://127.0.0.1:8080;
                    proxy_set_header Host $host;
                    proxy_set_header X-Forwarded-Proto $scheme;
                    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                  }
                  location / {
                    proxy_pass http://127.0.0.1:5173;
                    proxy_set_header Host $host;
                    proxy_set_header X-Forwarded-Proto $scheme;
                  }
                }
                """.formatted(host, host, host);
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(@RequestParam(defaultValue = "0") int days) {
        UUID org = Auth.current().organizationId();
        Instant from = days > 0 ? Instant.now().minus(days, ChronoUnit.DAYS) : Instant.EPOCH;
        List<Inquiry> inquiries = store.list(Inquiry.class, org);
        List<Student> students = store.list(Student.class, org);
        List<Invoice> invoices = store.list(Invoice.class, org);
        List<Application> apps = store.list(Application.class, org);
        List<Payment> payments = store.list(Payment.class, org).stream()
                .filter(p -> p.getReceivedAt() == null || !p.getReceivedAt().isBefore(from))
                .toList();
        List<Invoice> rangedInvoices = invoices.stream()
                .filter(i -> i.getCreatedAt() == null || !i.getCreatedAt().isBefore(from))
                .toList();
        BigDecimal due = rangedInvoices.stream().filter(i -> !"PAID".equals(i.getStatus()))
                .map(Invoice::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal paid = payments.stream().map(Payment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        long converted = inquiries.stream().filter(i -> "CONVERTED".equals(i.getStage())).count();
        Map<String, Long> funnel = inquiries.stream().collect(Collectors.groupingBy(Inquiry::getStage, Collectors.counting()));
        Map<String, Long> ats = apps.stream().collect(Collectors.groupingBy(Application::getStatus, Collectors.counting()));
        BigDecimal total = paid.add(due);
        int collectionPct = total.signum() == 0 ? 0 : paid.multiply(BigDecimal.valueOf(100)).divide(total, 0, RoundingMode.HALF_UP).intValue();
        List<SiteHit> hits = store.list(SiteHit.class, org).stream()
                .filter(h -> h.getCreatedAt() == null || !h.getCreatedAt().isBefore(from))
                .toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("inquiries", inquiries.size());
        out.put("converted", converted);
        out.put("students", students.size());
        out.put("due", due);
        out.put("collected", paid);
        out.put("collectionPct", collectionPct);
        out.put("applications", apps.size());
        out.put("offers", store.list(Offer.class, org).size());
        out.put("funnel", funnel);
        out.put("ats", ats);
        out.put("role", Auth.current().role());
        out.put("integrations", integrations.status());
        out.put("coursesPublished", store.list(Course.class, org).stream().filter(Course::isPublished).count());
        out.put("coursesTotal", store.list(Course.class, org).size());
        out.put("landingPages", store.list(LandingPage.class, org).size());
        out.put("campaigns", store.list(Campaign.class, org).size());
        out.put("testsCreated", store.list(Assessment.class, org).size());
        out.put("couponsLive", store.list(Coupon.class, org).stream().filter(Coupon::isLive).count());
        out.put("bannersLive", store.list(AppBanner.class, org).stream().filter(AppBanner::isLive).count());
        out.put("websiteSessions", hits.stream().filter(h -> "SESSION".equals(h.getKind())).count());
        out.put("buyNowClicks", hits.stream().filter(h -> "BUY_CLICK".equals(h.getKind())).count());
        out.put("transactions", payments.size());
        out.put("revenue", paid);
        return out;
    }

    @GetMapping("/export/{resource}")
    public List<?> export(@PathVariable String resource) {
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.ACCOUNTANT, Roles.PLACEMENT_HEAD);
        return switch (resource) {
            case "students" -> store.list(Student.class, Auth.current().organizationId());
            case "invoices" -> store.list(Invoice.class, Auth.current().organizationId());
            case "applications" -> store.list(Application.class, Auth.current().organizationId());
            default -> store.list(Inquiry.class, Auth.current().organizationId());
        };
    }
}
