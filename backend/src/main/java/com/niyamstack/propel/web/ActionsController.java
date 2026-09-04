package com.niyamstack.propel.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.niyamstack.propel.analytics.AnalyticsService;
import com.niyamstack.propel.analytics.IntelligenceService;
import com.niyamstack.propel.compensation.CompensationService;
import com.niyamstack.propel.compliance.ComplianceService;
import com.niyamstack.propel.depth.DepthService;
import com.niyamstack.propel.enterprise.EnterpriseService;
import com.niyamstack.propel.comms.OutreachService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.grow.GrowService;
import com.niyamstack.propel.ess.EssService;
import com.niyamstack.propel.fees.FeeService;
import com.niyamstack.propel.sis.SisService;
import com.niyamstack.propel.integration.IntegrationStatusService;
import com.niyamstack.propel.integration.ObjectStorage;
import com.niyamstack.propel.integration.OrgSecrets;
import com.niyamstack.propel.lms.LmsService;
import com.niyamstack.propel.placement.PlacementService;
import com.niyamstack.propel.scale.ScaleService;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
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
    private final EssService ess;
    private final SisService sis;
    private final GrowService grow;
    private final ScaleService scale;
    private final AnalyticsService analytics;
    private final CompensationService compensation;
    private final IntelligenceService intelligence;
    private final EnterpriseService enterprise;
    private final ComplianceService compliance;
    private final DepthService depth;
    private final ObjectMapper mapper = new ObjectMapper();

    public ActionsController(Store store, FeeService fees, LmsService lms, PlacementService placement,
                             IntegrationStatusService integrations, StorefrontService storefront, ObjectStorage storage,
                             OutreachService outreach, EssService ess, SisService sis, GrowService grow, ScaleService scale,
                             AnalyticsService analytics, CompensationService compensation, IntelligenceService intelligence,
                             EnterpriseService enterprise, ComplianceService compliance, DepthService depth) {
        this.store = store;
        this.fees = fees;
        this.lms = lms;
        this.placement = placement;
        this.integrations = integrations;
        this.storefront = storefront;
        this.storage = storage;
        this.outreach = outreach;
        this.ess = ess;
        this.sis = sis;
        this.grow = grow;
        this.scale = scale;
        this.analytics = analytics;
        this.compensation = compensation;
        this.intelligence = intelligence;
        this.enterprise = enterprise;
        this.compliance = compliance;
        this.depth = depth;
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
    public Map<String, Object> convert(@PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
        return grow.convert(id, body == null ? Map.of() : body);
    }

    @PostMapping("/inquiries/{id}/stage")
    public Inquiry setStage(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return grow.setStage(id, body.get("stage"), body.get("note"));
    }

    @PostMapping("/grow/notes")
    public CounselingNote growNote(@RequestBody Map<String, Object> body) {
        return grow.addNote(body);
    }

    @PostMapping("/grow/referrals")
    public Referral issueReferral(@RequestBody Map<String, Object> body) {
        return grow.issueReferral(body);
    }

    @PostMapping("/grow/scholarships")
    public Scholarship requestScholarship(@RequestBody Map<String, Object> body) {
        return grow.requestScholarship(body);
    }

    @PostMapping("/one-to-one/{id}/book")
    public Map<String, Object> bookOneToOne(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return grow.bookSession(id, body == null ? Map.of() : body);
    }

    @PostMapping("/invoices/{id}/collect")
    public Map<String, Object> collect(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        BigDecimal amount = body.get("amount") == null ? null : new BigDecimal(body.get("amount"));
        return fees.collect(id, amount, body.getOrDefault("method", "UPI"), body.get("reference"));
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

    @GetMapping("/accounting-export")
    public Map<String, Object> accountingExport(
            @RequestParam(defaultValue = "csv") String format,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to
    ) {
        LocalDate start = from == null || from.isBlank() ? null : LocalDate.parse(from);
        LocalDate end = to == null || to.isBlank() ? null : LocalDate.parse(to);
        return fees.accountingExport(format, start, end);
    }

    @PostMapping("/campaigns/{id}/launch")
    public Campaign launchCampaign(@PathVariable UUID id) {
        return outreach.launch(id);
    }

    @PostMapping("/notices/send")
    public Map<String, Object> sendNotice(@RequestBody Map<String, String> body) {
        UUID batchId = body.get("batchId") == null || body.get("batchId").isBlank() ? null : UUID.fromString(body.get("batchId"));
        return outreach.sendNotice(body.get("channel"), body.get("title"), body.get("body"), batchId);
    }

    @PostMapping("/grow/import/inquiries")
    public Map<String, Object> importInquiries(@RequestBody Map<String, Object> body) {
        return grow.importInquiries(body);
    }

    @PostMapping("/inquiries/{id}/counselor")
    public Inquiry assignCounselor(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        UUID counselorId = body.get("counselorUserId") == null || body.get("counselorUserId").isBlank()
                ? null : UUID.fromString(body.get("counselorUserId"));
        return grow.assignCounselor(id, counselorId);
    }

    @GetMapping("/sis/batch-attendance")
    public List<Map<String, Object>> batchAttendanceRoster(
            @RequestParam UUID batchId,
            @RequestParam(required = false) String date) {
        LocalDate day = date == null || date.isBlank() ? null : LocalDate.parse(date.substring(0, Math.min(10, date.length())));
        return sis.batchAttendanceRoster(batchId, day);
    }

    @PostMapping("/sis/batch-attendance")
    public Map<String, Object> markBatchAttendance(@RequestBody Map<String, Object> body) {
        return sis.markBatchAttendance(body);
    }

    @GetMapping("/sis/attendance-summary")
    public Map<String, Object> attendanceSummary(@RequestParam UUID batchId,
                                                 @RequestParam(required = false) String date) {
        return sis.attendanceSummary(batchId, date);
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

    @GetMapping("/ledger")
    public List<Map<String, Object>> ledger() {
        return fees.ledger();
    }

    @GetMapping("/reconciliation")
    public List<Map<String, Object>> reconciliation() {
        return fees.reconciliation();
    }

    @PostMapping("/invoices/{id}/remind")
    public Map<String, Object> remindInvoice(@PathVariable UUID id) {
        return fees.remindInvoice(id);
    }

    @PostMapping("/dues/remind")
    public Map<String, Object> remindDues() {
        return fees.remindOrgDues();
    }

    @GetMapping("/refunds/{id}/credit-note")
    public Map<String, Object> creditNote(@PathVariable UUID id) {
        return fees.creditNote(id);
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

    @PostMapping("/attempts/{id}/proctor")
    public Map<String, Object> logProctor(@PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
        return lms.logProctorEvent(id, body == null ? null : body.get("type"));
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

    @GetMapping("/question-bank")
    public List<Question> questionBank(
            @RequestParam(required = false) String subject,
            @RequestParam(required = false) String topic,
            @RequestParam(required = false) String difficulty
    ) {
        return lms.questionBank(subject, topic, difficulty);
    }

    @PostMapping("/question-bank")
    public Question saveBankQuestion(@RequestBody LmsService.QuizQuestionInput body) {
        return lms.saveBankQuestion(body);
    }

    @GetMapping("/certificates/{id}")
    public Map<String, Object> certificate(@PathVariable UUID id) {
        return lms.certificate(id);
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
        return placement.recordRound(id, body.getOrDefault("roundName", "Round"), body.get("outcome"), body.get("feedback"), body.get("panel"), body.get("scheduledAt"));
    }

    @PostMapping("/applications/{id}/offer")
    public Offer offer(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        BigDecimal pkg = body.get("packageLpa") == null ? BigDecimal.ZERO : new BigDecimal(body.get("packageLpa"));
        LocalDate joining = body.get("joiningDate") == null || body.get("joiningDate").isBlank()
                ? LocalDate.now().plusMonths(1) : LocalDate.parse(body.get("joiningDate"));
        return placement.offer(id, pkg, joining, body.get("notes"));
    }

    @PostMapping("/applications/{id}/advance")
    public Application advance(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return placement.advance(id, body.getOrDefault("status", "SHORTLISTED"));
    }

    @GetMapping("/placement/calendar")
    public List<Map<String, Object>> placementCalendar(@RequestParam(required = false) Integer year,
                                                       @RequestParam(required = false) Integer month) {
        LocalDate now = LocalDate.now();
        return placement.calendar(year == null ? now.getYear() : year, month == null ? now.getMonthValue() : month);
    }

    @PostMapping("/placement/recruiters")
    public Map<String, Object> inviteRecruiter(@RequestBody Map<String, String> body) {
        return placement.inviteRecruiter(body);
    }

    @PostMapping("/offers/{id}/accept")
    public Offer acceptOffer(@PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
        boolean accept = body == null || Boolean.parseBoolean(body.getOrDefault("accept", "true"));
        return placement.acceptOffer(id, accept);
    }

    @PostMapping("/offers/{id}/join")
    public Offer joinOffer(@PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
        LocalDate joining = body == null || body.get("joiningDate") == null || body.get("joiningDate").isBlank()
                ? null : LocalDate.parse(body.get("joiningDate"));
        return placement.markJoined(id, joining);
    }

    @GetMapping("/offers/{id}/letter")
    public Map<String, Object> offerLetter(@PathVariable UUID id) {
        return placement.offerLetter(id);
    }

    @PostMapping("/placement/internships")
    public Internship createInternshipAction(@RequestBody Map<String, String> body) {
        return placement.saveInternship(body);
    }

    @PostMapping("/placement/internships/{id}/status")
    public Internship internshipStatus(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return placement.setInternshipStatus(id, body.get("status"));
    }

    @PostMapping("/placement/alumni-jobs/{id}/route")
    public Drive routeAlumniJob(@PathVariable UUID id) {
        return placement.routeAlumniJob(id);
    }

    @PostMapping("/placement/industry/{id}/mou")
    public IndustryAccount toggleMou(@PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
        boolean mou = body == null || Boolean.parseBoolean(body.getOrDefault("mou", "true"));
        return placement.toggleMou(id, mou);
    }

    @PostMapping("/placement/events/{id}/attend")
    public IndustryEvent attendEvent(@PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
        int count = 1;
        if (body != null && body.get("count") != null && !body.get("count").isBlank()) {
            count = Integer.parseInt(body.get("count"));
        }
        return placement.markAttendance(id, count);
    }

    @PostMapping("/at-risk/{studentId}/follow-up")
    public SupportTicket assignFollowUp(@PathVariable UUID studentId) {
        return placement.assignFollowUp(studentId);
    }

    @PostMapping("/attendance/biometric")
    public Map<String, Object> biometric(@RequestBody Map<String, Object> body) {
        return ess.biometric(body);
    }

    @PostMapping("/ess/attendance")
    public Map<String, Object> staffAttendance(@RequestBody Map<String, Object> body) {
        return ess.markAttendance(body);
    }

    @PostMapping("/ess/punches/import")
    public List<Map<String, Object>> importPunches(@RequestBody Map<String, Object> body) {
        return ess.importPunches(body);
    }

    @GetMapping("/ess/punch-secret")
    public Map<String, Object> punchSecret() {
        return ess.ensurePunchSecret();
    }

    @PostMapping("/ess/employees/{id}/login")
    public Map<String, Object> employeeLogin(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return ess.issueLogin(id, body == null ? Map.of() : body);
    }

    @PostMapping("/ess/leave")
    public Map<String, Object> applyLeave(@RequestBody Map<String, Object> body) {
        return ess.applyLeave(body);
    }

    @PostMapping("/ess/leave/{id}/decide")
    public Map<String, Object> decideLeave(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return ess.decideLeave(id, body);
    }

    @PostMapping("/ess/leave/{id}/cancel")
    public Map<String, Object> cancelLeave(@PathVariable UUID id) {
        return ess.cancelLeave(id);
    }

    @GetMapping("/ess/profile")
    public Map<String, Object> myProfile() {
        return ess.profile(null);
    }

    @GetMapping("/ess/org-chart")
    public List<Map<String, Object>> orgChart() {
        return ess.orgChart();
    }

    @PostMapping("/ess/payslips/{id}/publish")
    public Map<String, Object> publishPayslip(@PathVariable UUID id) {
        return ess.publishPayslip(id);
    }

    @GetMapping("/ess/manager/inbox")
    public Map<String, Object> managerInbox() {
        return ess.managerInbox();
    }

    @GetMapping("/ess/team/attendance")
    public List<Map<String, Object>> teamAttendance(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        LocalDate now = LocalDate.now();
        return ess.teamAttendance(year == null ? now.getYear() : year, month == null ? now.getMonthValue() : month);
    }

    @GetMapping("/ess/team/leave-calendar")
    public List<Map<String, Object>> teamLeaveCalendar(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        LocalDate now = LocalDate.now();
        return ess.teamLeaveCalendar(year == null ? now.getYear() : year, month == null ? now.getMonthValue() : month);
    }

    @PostMapping("/ess/leave/bulk-decide")
    public Map<String, Object> bulkDecideLeave(@RequestBody Map<String, Object> body) {
        return ess.bulkDecideLeave(body);
    }

    @PostMapping("/ess/regularization")
    public Map<String, Object> applyRegularization(@RequestBody Map<String, Object> body) {
        return ess.applyRegularization(body);
    }

    @PostMapping("/ess/regularization/{id}/decide")
    public Map<String, Object> decideRegularization(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return ess.decideRegularization(id, body);
    }

    @PostMapping("/ess/regularization/{id}/cancel")
    public Map<String, Object> cancelRegularization(@PathVariable UUID id) {
        return ess.cancelRegularization(id);
    }

    @PostMapping("/ess/resignation")
    public Map<String, Object> applyResignation(@RequestBody Map<String, Object> body) {
        return ess.applyResignation(body);
    }

    @PostMapping("/ess/resignation/{id}/decide")
    public Map<String, Object> decideResignation(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return ess.decideResignation(id, body);
    }

    @GetMapping("/ess/leave/calendar")
    public List<Map<String, Object>> leaveCalendar(@RequestParam(required = false) Integer year,
                                                   @RequestParam(required = false) Integer month) {
        LocalDate now = LocalDate.now();
        return ess.leaveCalendar(year == null ? now.getYear() : year, month == null ? now.getMonthValue() : month);
    }

    @PostMapping("/ess/salary")
    public Map<String, Object> saveSalary(@RequestBody Map<String, Object> body) {
        return ess.saveStructure(body);
    }

    @PostMapping("/ess/payroll/run")
    public List<Map<String, Object>> runPayroll(@RequestBody(required = false) Map<String, Object> body) {
        return ess.runPayroll(body == null ? Map.of() : body);
    }

    @PostMapping("/ess/payroll/preview")
    public List<Map<String, Object>> previewPayroll(@RequestBody(required = false) Map<String, Object> body) {
        return ess.previewPayroll(body == null ? Map.of() : body);
    }

    @PostMapping("/ess/payroll/publish-all")
    public Map<String, Object> bulkPublishPayroll(@RequestBody Map<String, Object> body) {
        return ess.bulkPublishPayroll(body);
    }

    @GetMapping("/ess/payroll/statutory")
    public Map<String, Object> statutorySummary(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        LocalDate now = LocalDate.now();
        return ess.statutorySummary(year == null ? now.getYear() : year, month == null ? now.getMonthValue() : month);
    }

    @GetMapping("/ess/payroll/register")
    public List<Map<String, Object>> payrollRegister(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        LocalDate now = LocalDate.now();
        return ess.payrollRegister(year == null ? now.getYear() : year, month == null ? now.getMonthValue() : month);
    }

    @GetMapping("/ess/payroll/settings")
    public Map<String, Object> payrollSettings() {
        return ess.payrollSettingsView();
    }

    @PutMapping("/ess/payroll/settings")
    public Map<String, Object> savePayrollSettings(@RequestBody Map<String, Object> body) {
        return ess.savePayrollSettings(body);
    }

    @GetMapping("/compensation/settings")
    public Map<String, Object> commissionSettings() {
        return compensation.settingsView();
    }

    @PutMapping("/compensation/settings")
    public Map<String, Object> saveCommissionSettings(@RequestBody Map<String, Object> body) {
        return compensation.saveSettings(body);
    }

    @PostMapping("/compensation/plans")
    public Map<String, Object> saveCompensationPlan(@RequestBody Map<String, Object> body) {
        return compensation.savePlan(body);
    }

    @GetMapping("/compensation/faculty/preview")
    public List<Map<String, Object>> facultyCompPreview(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        LocalDate now = LocalDate.now();
        return compensation.facultyPreview(year == null ? now.getYear() : year, month == null ? now.getMonthValue() : month);
    }

    @GetMapping("/compensation/my-commissions")
    public Map<String, Object> myCommissions() {
        return compensation.myCommissions();
    }

    @PostMapping("/compensation/mark-paid")
    public Map<String, Object> markCommissionsPaid(@RequestBody Map<String, Object> body) {
        int year = body.get("year") == null ? LocalDate.now().getYear() : Integer.parseInt(String.valueOf(body.get("year")));
        int month = body.get("month") == null ? LocalDate.now().getMonthValue() : Integer.parseInt(String.valueOf(body.get("month")));
        if (body.get("employeeId") == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "employeeId is required");
        }
        UUID employeeId = UUID.fromString(String.valueOf(body.get("employeeId")));
        compensation.markCommissionsPaid(Auth.current().organizationId(), employeeId, year, month);
        return Map.of("status", "PAID", "employeeId", employeeId.toString(), "year", year, "month", month);
    }

    @GetMapping("/ess/payslips/{id}")
    public Map<String, Object> payslip(@PathVariable UUID id) {
        return ess.payslip(id);
    }

    @PostMapping("/ess/candidates/{id}/advance")
    public Map<String, Object> advanceCandidate(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return ess.advanceCandidate(id, body);
    }

    @PostMapping("/ess/candidates/{id}/hire")
    public Map<String, Object> hireCandidate(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return ess.hire(id, body == null ? Map.of() : body);
    }

    @PostMapping("/sis/import/students")
    public Map<String, Object> importStudents(@RequestBody Map<String, Object> body) {
        return sis.importStudents(body);
    }

    @PostMapping("/sis/import/employees")
    public Map<String, Object> importEmployees(@RequestBody Map<String, Object> body) {
        return sis.importEmployees(body);
    }

    @GetMapping("/sis/id-card/{kind}/{id}")
    public Map<String, Object> idCard(@PathVariable String kind, @PathVariable UUID id) {
        return sis.idCard(kind, id);
    }

    @PostMapping("/sis/parents/invite")
    public Map<String, Object> inviteParent(@RequestBody Map<String, Object> body) {
        return sis.inviteParent(body);
    }

    @PostMapping("/sis/custom/{entityType}/{id}")
    public Map<String, Object> saveCustom(@PathVariable String entityType, @PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return sis.saveCustomValues(entityType, id, body);
    }

    @GetMapping("/sis/custom/{entityType}/{id}")
    public Map<String, Object> getCustom(@PathVariable String entityType, @PathVariable UUID id) {
        return sis.getCustomValues(entityType, id);
    }

    @PostMapping("/sis/approvals")
    public ApprovalRequest submitApproval(@RequestBody Map<String, Object> body) {
        return sis.submitApproval(body);
    }

    @PostMapping("/sis/approvals/{id}/decide")
    public ApprovalRequest decideApproval(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return sis.decideApproval(id, body);
    }

    @GetMapping("/sis/templates/{kind}")
    public Map<String, Object> renderTemplate(@PathVariable String kind, @RequestParam(required = false) UUID entityId) {
        return sis.renderTemplate(kind, entityId);
    }

    @GetMapping("/sis/live/{id}/roster")
    public List<Map<String, Object>> liveRoster(@PathVariable UUID id) {
        return sis.sessionRoster(id);
    }

    @PostMapping("/sis/live/{id}/attendance")
    public Map<String, Object> liveAttendance(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return sis.takeSessionAttendance(id, body);
    }

    @PostMapping("/sis/live/{id}/recording")
    public Recording attachRecording(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return sis.attachRecording(id, body);
    }

    @PostMapping("/sis/doubts/{id}/reply")
    public DoubtTicket replyDoubt(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return sis.replyDoubt(id, body);
    }

    @GetMapping("/sis/doubts")
    public List<Map<String, Object>> sisDoubts() {
        return sis.doubts();
    }

    @GetMapping("/sis/workload")
    public List<Map<String, Object>> workload() {
        return sis.facultyWorkload();
    }

    @GetMapping("/sis/progress")
    public List<Map<String, Object>> progressBoard() {
        return sis.progressBoard();
    }

    @GetMapping("/progress/{studentId}")
    public Map<String, Object> progress(@PathVariable UUID studentId) {
        return sis.progressForStudent(studentId);
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
        return placement.atRisk();
    }

    @PostMapping("/ai/resume")
    public Map<String, String> aiResume(@RequestBody Map<String, String> body) {
        return scale.aiResume(body == null ? Map.of() : body);
    }

    @PostMapping("/ai/coach")
    public Map<String, String> aiCoach(@RequestBody Map<String, String> body) {
        return scale.aiCoach(body == null ? Map.of() : body);
    }

    @PostMapping("/ai/career")
    public Map<String, Object> aiCareer(@RequestBody Map<String, String> body) {
        return scale.aiCareer(body == null ? Map.of() : body);
    }

    @GetMapping("/ai/status")
    public Map<String, Object> aiStatus() {
        return scale.aiStatus();
    }

    @GetMapping("/mobile/home")
    public Map<String, Object> mobileHome() {
        return scale.mobileHome();
    }

    @GetMapping("/reports/datasets")
    public List<Map<String, Object>> reportDatasets() {
        return scale.datasets();
    }

    @PostMapping("/reports")
    public ReportDefinition createReport(@RequestBody Map<String, String> body) {
        return scale.saveReport(body);
    }

    @PostMapping("/reports/{id}/run")
    public Map<String, Object> runReport(@PathVariable UUID id) {
        return scale.runReport(id);
    }

    @PostMapping("/reports/{id}/schedule")
    public ScheduledReport scheduleReport(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return scale.schedule(id, body);
    }

    @PostMapping("/reports/{id}/send")
    public Map<String, Object> sendReport(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return scale.sendReport(id, body == null ? Map.of() : body);
    }

    @PostMapping("/reports/run-due")
    public Map<String, Object> runDueReports() {
        Access.requireAny(Auth.current(), Roles.OWNER);
        return Map.of("sent", scale.runDueReports());
    }

    @GetMapping("/faculty-performance")
    public List<Map<String, Object>> facultyPerformance() {
        return scale.facultyPerformance();
    }

    @PostMapping("/xapi/statements")
    public XapiStatement xapi(@RequestBody Map<String, String> body) {
        return scale.recordXapi(body);
    }

    @GetMapping("/learning-outcomes")
    public List<Map<String, Object>> learningOutcomes() {
        return scale.learningOutcomes();
    }

    @GetMapping("/lms-packages/{id}/lti")
    public Map<String, Object> lti(@PathVariable UUID id) {
        return scale.ltiLaunch(id);
    }

    @PostMapping("/accreditation/folders")
    public AccreditationFolder accreditationFolder(@RequestBody Map<String, String> body) {
        return scale.saveFolder(body);
    }

    @PostMapping("/accreditation/evidence")
    public AccreditationEvidence accreditationEvidence(@RequestBody Map<String, String> body) {
        return scale.saveEvidence(body);
    }

    @PostMapping("/accreditation/evidence/{id}/submit")
    public AccreditationEvidence submitEvidence(@PathVariable UUID id) {
        return scale.submitEvidence(id);
    }

    @PostMapping("/offline/sync")
    public Map<String, Object> offlineSync(@RequestBody(required = false) Map<String, Object> body) {
        return scale.syncOffline(body == null ? Map.of() : body);
    }

    @GetMapping("/salary-benchmarks")
    public List<Map<String, Object>> benchmarks() {
        return placement.salaryBenchmarks();
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
        out.put("openai", OrgSecrets.has(org, "openaiApiKey"));
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
        putIfPresent(live, body, "openaiApiKey");
        putIfPresent(live, body, "openaiBaseUrl");
        putIfPresent(live, body, "openaiModel");
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

    @GetMapping("/analytics/scorecard")
    public Map<String, Object> analyticsScorecard(@RequestParam(defaultValue = "30") int days) {
        return analytics.scorecard(days);
    }

    @GetMapping("/analytics/funnel")
    public Map<String, Object> analyticsFunnel(@RequestParam(defaultValue = "30") int days) {
        return analytics.funnelAnalytics(days);
    }

    @GetMapping("/analytics/placement")
    public Map<String, Object> analyticsPlacement() {
        return analytics.placementOutcomes();
    }

    @GetMapping("/intelligence/search")
    public List<Map<String, Object>> intelligenceSearch(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "12") int limit) {
        return intelligence.unifiedSearch(q, limit);
    }

    @GetMapping("/intelligence/hub")
    public Map<String, Object> intelligenceHub(@RequestParam(defaultValue = "30") int days) {
        return intelligence.ownerHub(days);
    }

    @GetMapping("/intelligence/forecast")
    public Map<String, Object> intelligenceForecast(@RequestParam(defaultValue = "3") int months) {
        return intelligence.revenueForecast(months);
    }

    @GetMapping("/intelligence/pnl")
    public Map<String, Object> intelligencePnl(@RequestParam(defaultValue = "90") int days) {
        return intelligence.pnlSummary(days);
    }

    @GetMapping("/enterprise/hub")
    public Map<String, Object> enterpriseHub() {
        return enterprise.hub();
    }

    @GetMapping("/enterprise/workflows")
    public List<Map<String, Object>> enterpriseWorkflows() {
        return enterprise.workflows();
    }

    @PostMapping("/enterprise/workflows")
    public Map<String, Object> saveEnterpriseWorkflow(@RequestBody Map<String, Object> body) {
        return enterprise.saveWorkflow(body);
    }

    @GetMapping("/enterprise/workflows/{id}/preview")
    public Map<String, Object> previewEnterpriseWorkflow(@PathVariable UUID id) {
        return enterprise.previewWorkflow(id);
    }

    @GetMapping("/enterprise/accreditation")
    public Map<String, Object> enterpriseAccreditation() {
        return enterprise.accreditationDashboard();
    }

    @GetMapping("/enterprise/ai")
    public Map<String, Object> enterpriseAi() {
        return enterprise.aiSuite();
    }

    @GetMapping("/compliance/hub")
    public Map<String, Object> complianceHub() {
        return compliance.hub();
    }

    @GetMapping("/compliance/usage")
    public Map<String, Object> complianceUsage() {
        return compliance.usageSummary();
    }

    @GetMapping("/compliance/release-notes")
    public List<Map<String, Object>> complianceReleaseNotes() {
        return compliance.releaseNotes();
    }

    @GetMapping("/compliance/export/subject/{studentId}")
    public Map<String, Object> complianceExportSubject(@PathVariable UUID studentId) {
        return compliance.exportSubject(studentId);
    }

    @PostMapping("/compliance/delete-request/{studentId}")
    public Map<String, Object> complianceDeleteRequest(@PathVariable UUID studentId,
                                                       @RequestBody(required = false) Map<String, String> body) {
        String reason = body == null ? null : body.get("reason");
        return compliance.requestDeletion(studentId, reason);
    }

    @GetMapping("/compliance/delete-requests")
    public List<Map<String, Object>> complianceDeleteRequests() {
        return compliance.deletionRequests();
    }

    @GetMapping("/depth/hub")
    public Map<String, Object> depthHub() {
        return depth.hub();
    }

    @GetMapping("/depth/center-pnl")
    public Map<String, Object> depthCenterPnl(@RequestParam(defaultValue = "90") int days) {
        return depth.centerPnl(days);
    }

    @PostMapping("/depth/org")
    public Map<String, Object> depthUpdateOrg(@RequestBody Map<String, Object> body) {
        return depth.updateOrgDepth(body);
    }

    @PostMapping("/depth/centers/{id}/royalty")
    public Map<String, Object> depthCenterRoyalty(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return depth.updateCenterRoyalty(id, body);
    }

    @GetMapping("/support/hub")
    public List<Map<String, Object>> supportHub() {
        return depth.supportHub();
    }

    @PostMapping("/support/tickets")
    public Map<String, Object> supportCreate(@RequestBody Map<String, Object> body) {
        return depth.createTicket(body);
    }

    @PostMapping("/support/tickets/{id}")
    public Map<String, Object> supportUpdate(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return depth.updateTicket(id, body);
    }

    @PostMapping("/billing/upgrade-request")
    public Map<String, Object> billingUpgrade(@RequestBody(required = false) Map<String, Object> body) {
        return depth.requestUpgrade(body == null ? Map.of() : body);
    }

    @GetMapping("/help/articles")
    public List<Map<String, Object>> helpArticles(@RequestParam(required = false) String locale,
                                                  @RequestParam(required = false) String page) {
        return depth.helpArticles(locale, page);
    }

    @GetMapping("/help/tour")
    public Map<String, Object> helpTour(@RequestParam(defaultValue = "dashboard") String page,
                                        @RequestParam(defaultValue = "en") String locale) {
        return depth.guidedTour(page, locale);
    }

    @GetMapping("/api-tokens")
    public List<Map<String, Object>> apiTokens() {
        return depth.apiTokens();
    }

    @PostMapping("/api-tokens")
    public Map<String, Object> createApiToken(@RequestBody(required = false) Map<String, Object> body) {
        return depth.createApiToken(body == null ? Map.of() : body);
    }

    @PostMapping("/webhooks/test")
    public Map<String, Object> testWebhook() {
        return depth.testWebhook();
    }

    @GetMapping("/hr/goals")
    public List<Map<String, Object>> staffGoals() {
        return depth.staffGoals();
    }

    @PostMapping("/hr/goals")
    public Map<String, Object> saveStaffGoal(@RequestBody Map<String, Object> body) {
        return depth.saveStaffGoal(body);
    }

    @PutMapping("/hr/goals/{id}")
    public Map<String, Object> updateStaffGoal(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return depth.updateStaffGoal(id, body);
    }

    @GetMapping("/hr/succession")
    public List<Map<String, Object>> successionPlans() {
        return depth.successionPlans();
    }

    @PostMapping("/hr/succession")
    public Map<String, Object> saveSuccession(@RequestBody Map<String, Object> body) {
        return depth.saveSuccession(body);
    }

    @GetMapping("/hr/posh")
    public List<Map<String, Object>> poshCases() {
        return depth.poshCases();
    }

    @PostMapping("/hr/posh")
    public Map<String, Object> openPosh(@RequestBody Map<String, Object> body) {
        return depth.openPoshCase(body);
    }

    @PutMapping("/hr/posh/{id}")
    public Map<String, Object> updatePosh(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return depth.updatePoshCase(id, body);
    }

    @PostMapping("/ai/study-plan")
    public Map<String, Object> studyPlan(@RequestBody Map<String, Object> body) {
        return depth.createStudyPlan(body);
    }

    @GetMapping("/locale")
    public Map<String, Object> localeBundle() {
        return depth.localeBundle();
    }

    @PostMapping("/locale")
    public Map<String, Object> setLocale(@RequestBody Map<String, Object> body) {
        return depth.setLocale(body);
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(@RequestParam(defaultValue = "0") int days) {
        PropelUser user = Auth.current();
        Access.requireTenant(user);
        if (Roles.STUDENT.equals(user.role()) || Roles.PARENT.equals(user.role()) || Roles.RECRUITER.equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Staff dashboard is not available for this role");
        }
        UUID org = user.organizationId();
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
        List<Assessment> assessments = store.list(Assessment.class, org);
        out.put("testsTotal", assessments.size());
        out.put("testsCreated", assessments.stream()
                .filter(a -> a.isPublished() && !"PRACTICE_LAB".equalsIgnoreCase(a.getKind()))
                .count());
        out.put("couponsLive", store.list(Coupon.class, org).stream().filter(Coupon::isLive).count());
        out.put("bannersLive", store.list(AppBanner.class, org).stream().filter(AppBanner::isLive).count());
        out.put("websiteSessions", hits.stream().filter(h -> "SESSION".equals(h.getKind())).count());
        out.put("buyNowClicks", hits.stream().filter(h -> "BUY_CLICK".equals(h.getKind())).count());
        out.put("transactions", payments.size());
        out.put("revenue", paid);
        out.putAll(fees.financeDashboard(days));
        List<AttendanceRecord> attendance = store.list(AttendanceRecord.class, org).stream()
                .filter(a -> a.getSessionDate() != null && !a.getSessionDate().isBefore(
                        LocalDate.now().minusDays(days > 0 ? days : 30)))
                .toList();
        long presentMarks = attendance.stream()
                .filter(a -> "PRESENT".equalsIgnoreCase(a.getStatus()) || "LATE".equalsIgnoreCase(a.getStatus()))
                .count();
        int attendancePct = attendance.isEmpty() ? 0 : (int) Math.min(100, presentMarks * 100 / attendance.size());
        out.put("attendancePct", attendancePct);
        out.put("attendanceMarked", attendance.size());
        return out;
    }

    @GetMapping("/export/{resource}")
    public List<?> export(@PathVariable String resource,
                          @RequestParam(required = false) String mask) {
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.ACCOUNTANT, Roles.PLACEMENT_HEAD);
        if (mask != null && !mask.isBlank()) {
            Set<String> fields = Arrays.stream(mask.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .collect(Collectors.toSet());
            return compliance.maskedExport(resource, fields);
        }
        compliance.recordUsage("ANALYTICS", "EXPORT");
        return switch (resource) {
            case "students" -> store.list(Student.class, Auth.current().organizationId());
            case "invoices" -> store.list(Invoice.class, Auth.current().organizationId());
            case "applications" -> store.list(Application.class, Auth.current().organizationId());
            default -> store.list(Inquiry.class, Auth.current().organizationId());
        };
    }
}
