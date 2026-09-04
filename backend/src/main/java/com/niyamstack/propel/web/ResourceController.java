package com.niyamstack.propel.web;

import com.niyamstack.propel.compensation.CompensationService;
import com.niyamstack.propel.catalog.Features;
import com.niyamstack.propel.catalog.Packs;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.domain.TenantEntity;
import com.niyamstack.propel.ess.EssService;
import com.niyamstack.propel.fees.FeeService;
import com.niyamstack.propel.lms.LmsService;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.DataScope;
import com.niyamstack.propel.security.Gstins;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.PasswordPolicy;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.Roles;
import com.niyamstack.propel.security.SessionService;
import com.niyamstack.propel.security.LicenseService;
import com.niyamstack.propel.foundation.FoundationService;
import com.niyamstack.propel.grow.GrowService;
import com.niyamstack.propel.integration.MailService;
import com.niyamstack.propel.sis.SisService;
import com.niyamstack.propel.sis.StudentAccountService;
import com.niyamstack.propel.security.OtpService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class ResourceController {
    private final Store store;
    private final DataScope scope;
    private final LmsService lms;
    private final PasswordEncoder encoder;
    private final FeeService fees;
    private final StudentAccountService studentAccounts;
    private final SessionService sessions;
    private final LicenseService licenses;
    private final EssService ess;
    private final SisService sis;
    private final GrowService grow;
    private final FoundationService foundation;
    private final CompensationService compensation;
    private final OtpService otp;
    private final MailService mail;

    public ResourceController(Store store, DataScope scope, LmsService lms, PasswordEncoder encoder, FeeService fees,
                              StudentAccountService studentAccounts, SessionService sessions, LicenseService licenses,
                              EssService ess, SisService sis, GrowService grow, FoundationService foundation,
                              CompensationService compensation, OtpService otp, MailService mail) {
        this.store = store;
        this.scope = scope;
        this.lms = lms;
        this.encoder = encoder;
        this.fees = fees;
        this.studentAccounts = studentAccounts;
        this.sessions = sessions;
        this.licenses = licenses;
        this.ess = ess;
        this.sis = sis;
        this.grow = grow;
        this.foundation = foundation;
        this.compensation = compensation;
        this.otp = otp;
        this.mail = mail;
    }

    @GetMapping("/features")
    public Object features() {
        return Features.ALL;
    }

    @GetMapping("/me")
    public Map<String, Object> me() {
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        return sessions.profile(user);
    }

    @GetMapping("/organization")
    public Organization organization() {
        Access.requireTenant(Auth.current());
        return store.get(Organization.class, Auth.current().organizationId());
    }

    @PutMapping("/organization")
    public Organization updateOrg(@RequestBody Organization body) {
        Access.requireTenant(Auth.current());
        Access.requireWrite(Auth.current(), "SETUP");
        Organization existing = store.get(Organization.class, Auth.current().organizationId());
        existing.setName(body.getName());
        existing.setLegalName(body.getLegalName());
        Gstins.requireValid(body.getGstin());
        existing.setGstin(Gstins.normalize(body.getGstin()));
        if (existing.getGstin().isBlank()) {
            existing.setGstin(null);
        }
        existing.setEmail(body.getEmail());
        existing.setPhone(body.getPhone());
        existing.setWebsite(body.getWebsite());
        existing.setLogoUrl(body.getLogoUrl());
        existing.setBrandPrimary(body.getBrandPrimary());
        existing.setBrandSecondary(body.getBrandSecondary());
        existing.setWebsiteUrl(body.getWebsiteUrl());
        existing.setAppShareUrl(body.getAppShareUrl());
        existing.setCustomDomain(body.getCustomDomain());
        existing.setWebsitePublished(body.isWebsitePublished() || existing.isWebsitePublished());
        if (body.getSettingsJson() != null) {
            existing.setSettingsJson(body.getSettingsJson());
        }
        return store.save(existing);
    }

    @GetMapping("/centers") public List<Center> centers() { return list(Center.class); }
    @PostMapping("/centers") public Center createCenter(@RequestBody Center body) {
        licenses.requireCenterCapacity();
        return create(body, "SETUP");
    }
    @PutMapping("/centers/{id}") public Center updateCenter(@PathVariable UUID id, @RequestBody Center body) { return update(Center.class, id, body, "SETUP"); }
    @DeleteMapping("/centers/{id}") public void deleteCenter(@PathVariable UUID id) { delete(Center.class, id, "SETUP"); }

    @GetMapping("/academic-years") public List<AcademicYear> years() { return list(AcademicYear.class); }
    @PostMapping("/academic-years") public AcademicYear createYear(@RequestBody AcademicYear body) { return create(body, "SETUP"); }

    @GetMapping("/terms") public List<Term> terms() { return list(Term.class); }
    @PostMapping("/terms") public Term createTerm(@RequestBody Term body) { return create(body, "SETUP"); }

    @GetMapping("/courses") public List<Course> courses() { return list(Course.class); }
    @PostMapping("/courses") public Course createCourse(@RequestBody Course body) {
        body.setTermId(sis.resolveTermId(body.getTermId()));
        applyShareSlug(body, null);
        return create(body, "SETUP");
    }
    @PutMapping("/courses/{id}") public Course updateCourse(@PathVariable UUID id, @RequestBody Course body) {
        applyShareSlug(body, id);
        return update(Course.class, id, body, "SETUP");
    }
    @GetMapping("/share-slugs/check")
    public Map<String, Object> shareAvailable(@RequestParam String slug, @RequestParam(required = false) UUID courseId) {
        Access.requireTenant(Auth.current());
        String normalized = normalizeShareSlug(slug);
        boolean available = normalized.isEmpty() || shareSlugFree(normalized, courseId, Auth.current().organizationId());
        return Map.of("slug", normalized, "available", available);
    }
    @DeleteMapping("/courses/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCourse(@PathVariable UUID id) { lms.deleteCourse(id); }

    @GetMapping("/batches") public List<Batch> batches() { return list(Batch.class); }
    @PostMapping("/batches") public Batch createBatch(@RequestBody Batch body) { return sis.createBatch(body); }
    @PutMapping("/batches/{id}") public Batch updateBatch(@PathVariable UUID id, @RequestBody Batch body) { return update(Batch.class, id, body, "SETUP"); }

    @GetMapping("/classrooms") public List<Classroom> classrooms() { return list(Classroom.class); }
    @PostMapping("/classrooms") public Classroom createClassroom(@RequestBody Classroom body) { return create(body, "SETUP"); }

    @GetMapping("/custom-fields") public List<CustomField> customFields() { return list(CustomField.class); }
    @PostMapping("/custom-fields") public CustomField createField(@RequestBody CustomField body) { return create(body, "SETUP"); }

    @GetMapping("/workflows") public List<Workflow> workflows() { return list(Workflow.class); }
    @PostMapping("/workflows") public Workflow createWorkflow(@RequestBody Workflow body) { return create(body, "ADMIN"); }

    @GetMapping("/approvals") public List<ApprovalRequest> approvals() { return list(ApprovalRequest.class); }
    @GetMapping("/templates") public List<DocumentTemplate> templates() { return list(DocumentTemplate.class); }
    @PostMapping("/templates") public DocumentTemplate createTemplate(@RequestBody DocumentTemplate body) { return create(body, "SETUP"); }

    @GetMapping("/inquiries") public List<Inquiry> inquiries() { return list(Inquiry.class); }
    @PostMapping("/inquiries") public Inquiry createInquiry(@RequestBody Inquiry body) { return create(body, "CRM"); }
    @PutMapping("/inquiries/{id}") public Inquiry updateInquiry(@PathVariable UUID id, @RequestBody Inquiry body) { return update(Inquiry.class, id, body, "CRM"); }

    @GetMapping("/counseling-notes") public List<CounselingNote> notes() { return list(CounselingNote.class); }
    @PostMapping("/counseling-notes") public CounselingNote createNote(@RequestBody CounselingNote body) { return create(body, "CRM"); }

    @GetMapping("/admission-forms") public List<AdmissionForm> forms() { return list(AdmissionForm.class); }
    @PostMapping("/admission-forms") public AdmissionForm createForm(@RequestBody AdmissionForm body) { return create(body, "CRM"); }
    @PutMapping("/admission-forms/{id}") public AdmissionForm updateForm(@PathVariable UUID id, @RequestBody AdmissionForm body) { return update(AdmissionForm.class, id, body, "CRM"); }

    @GetMapping("/eligibility-rules") public List<EligibilityRule> rules() { return list(EligibilityRule.class); }
    @PostMapping("/eligibility-rules") public EligibilityRule createRule(@RequestBody EligibilityRule body) { return create(body, "PLACEMENT"); }

    @GetMapping("/referrals") public List<Referral> referrals() { return list(Referral.class); }
    @PostMapping("/referrals") public Referral createReferral(@RequestBody Referral body) { return create(body, "CRM"); }

    @GetMapping("/scholarships") public List<Scholarship> scholarships() { return list(Scholarship.class); }
    @PostMapping("/scholarships") public Scholarship createScholarship(@RequestBody Scholarship body) { return create(body, "CRM"); }

    @GetMapping("/students") public List<Student> students() { return list(Student.class); }
    @PostMapping("/students") public Map<String, Object> createStudent(@RequestBody Student body) { return studentAccounts.enrollFromOwner(body); }
    @PostMapping("/students/{id}/issue-login") public Map<String, Object> issueStudentLogin(@PathVariable UUID id) { return studentAccounts.issueLogin(id); }
    @PutMapping("/students/{id}") public Student updateStudent(@PathVariable UUID id, @RequestBody Student body) { return update(Student.class, id, body, "SIS"); }

    @GetMapping("/student-documents") public List<StudentDocument> docs() { return list(StudentDocument.class); }
    @PostMapping("/student-documents") public StudentDocument createDoc(@RequestBody StudentDocument body) { return create(body, "SIS"); }

    @GetMapping("/guardians") public List<Guardian> guardians() { return list(Guardian.class); }
    @PostMapping("/guardians") public Guardian createGuardian(@RequestBody Guardian body) { return create(body, "SIS"); }

    @GetMapping("/timetable") public List<TimetableSlot> timetable() { return list(TimetableSlot.class); }
    @PostMapping("/timetable") public TimetableSlot createSlot(@RequestBody TimetableSlot body) { return sis.saveSlot(body); }

    @GetMapping("/attendance") public List<AttendanceRecord> attendance() { return list(AttendanceRecord.class); }
    @PostMapping("/attendance") public AttendanceRecord markAttendance(@RequestBody AttendanceRecord body) { return create(body, "LMS"); }

    @GetMapping("/employees") public List<Map<String, Object>> employees() { return ess.employees(); }
    @GetMapping("/employees/{id}") public Map<String, Object> employeeProfile(@PathVariable UUID id) { return ess.profile(id); }
    @PostMapping("/employees") public Map<String, Object> createEmployee(@RequestBody Map<String, Object> body) { return ess.createEmployee(body); }
    @PutMapping("/employees/{id}") public Map<String, Object> updateEmployee(@PathVariable UUID id, @RequestBody Map<String, Object> body) { return ess.updateEmployee(id, body); }

    @GetMapping("/holidays") public List<Map<String, Object>> holidays() { return ess.holidays(); }
    @PostMapping("/holidays") public Map<String, Object> createHoliday(@RequestBody Map<String, Object> body) { return ess.saveHoliday(body); }
    @DeleteMapping("/holidays/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteHoliday(@PathVariable UUID id) { ess.deleteHoliday(id); }

    @GetMapping("/attendance-regularizations") public List<Map<String, Object>> regularizations() { return ess.regularizations(); }
    @GetMapping("/leave-policy") public Map<String, Object> leavePolicy() { return ess.leavePolicy(); }
    @PutMapping("/leave-policy") public Map<String, Object> saveLeavePolicy(@RequestBody Map<String, Object> body) { return ess.saveLeavePolicy(body); }
    @GetMapping("/employees/{id}/documents") public List<Map<String, Object>> employeeDocuments(@PathVariable UUID id) { return ess.employeeDocuments(id); }
    @PostMapping("/employee-documents") public Map<String, Object> addEmployeeDocument(@RequestBody Map<String, Object> body) { return ess.addEmployeeDocument(body); }
    @DeleteMapping("/employee-documents/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteEmployeeDocument(@PathVariable UUID id) { ess.deleteEmployeeDocument(id); }
    @GetMapping("/resignations") public List<Map<String, Object>> resignations() { return ess.resignations(); }

    @GetMapping("/staff-attendance") public List<Map<String, Object>> staffAttendance() { return ess.attendance(); }
    @GetMapping("/biometric-punches") public List<Map<String, Object>> biometricPunches() { return ess.punches(); }
    @GetMapping("/leave-requests") public List<Map<String, Object>> leaveRequests() { return ess.leaves(); }
    @GetMapping("/leave-balances") public List<Map<String, Object>> leaveBalances() { return ess.balances(); }
    @GetMapping("/salary-structures") public List<Map<String, Object>> salaryStructures() { return ess.structures(); }
    @GetMapping("/payslips") public List<Map<String, Object>> payslips() { return ess.payslips(); }
    @GetMapping("/compensation-plans") public List<Map<String, Object>> compensationPlans() { return compensation.plans(); }
    @GetMapping("/commission-ledger") public List<Map<String, Object>> commissionLedger(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) UUID employeeId,
            @RequestParam(required = false) String status) {
        return compensation.ledger(year, month, employeeId, status);
    }
    @GetMapping("/staff-vacancies") public List<Map<String, Object>> staffVacancies() { return ess.vacancies(); }
    @PostMapping("/staff-vacancies") public Map<String, Object> createVacancy(@RequestBody Map<String, Object> body) { return ess.createVacancy(body); }
    @PutMapping("/staff-vacancies/{id}") public Map<String, Object> updateVacancy(@PathVariable UUID id, @RequestBody Map<String, Object> body) { return ess.updateVacancy(id, body); }
    @GetMapping("/staff-candidates") public List<Map<String, Object>> staffCandidates() { return ess.candidates(); }
    @PostMapping("/staff-candidates") public Map<String, Object> createCandidate(@RequestBody Map<String, Object> body) { return ess.createCandidate(body); }

    @GetMapping("/content") public List<ContentItem> content() { return list(ContentItem.class); }
    @PostMapping("/content") public ContentItem createContent(@RequestBody ContentItem body) { return create(body, "LMS"); }
    @PutMapping("/content/{id}") public ContentItem updateContent(@PathVariable UUID id, @RequestBody ContentItem body) { return update(ContentItem.class, id, body, "LMS"); }
    @DeleteMapping("/content/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteContent(@PathVariable UUID id) { lms.deleteContent(id); }

    @GetMapping("/live-sessions") public List<LiveSession> live() { return list(LiveSession.class); }
    @PostMapping("/live-sessions") public LiveSession createLive(@RequestBody LiveSession body) { return create(body, "LMS"); }

    @GetMapping("/recordings") public List<Recording> recordings() { return list(Recording.class); }
    @PostMapping("/recordings") public Recording createRecording(@RequestBody Recording body) { return create(body, "LMS"); }

    @GetMapping("/assignments") public List<Assignment> assignments() { return list(Assignment.class); }
    @PostMapping("/assignments") public Assignment createAssignment(@RequestBody Assignment body) { return create(body, "LMS"); }

    @GetMapping("/submissions") public List<Submission> submissions() { return list(Submission.class); }
    @PostMapping("/submissions") public Submission createSubmission(@RequestBody Submission body) { return create(body, "LMS"); }

    @GetMapping("/assessments") public List<Assessment> assessments() { return list(Assessment.class); }
    @PostMapping("/assessments") public Assessment createAssessment(@RequestBody Assessment body) { return create(body, "LMS"); }
    @PutMapping("/assessments/{id}") public Assessment updateAssessment(@PathVariable UUID id, @RequestBody Assessment body) { return update(Assessment.class, id, body, "LMS"); }
    @DeleteMapping("/assessments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAssessment(@PathVariable UUID id) { lms.deleteAssessment(id); }

    @GetMapping("/questions")
    public List<Question> questions() {
        List<Question> rows = list(Question.class);
        if (!Access.canSeeAnswerKeys(Auth.current())) {
            rows.forEach(q -> {
                q.setAnswerKey(null);
                q.setExplanation(null);
            });
        }
        return rows;
    }
    @PostMapping("/questions") public Question createQuestion(@RequestBody Question body) { return create(body, "LMS"); }
    @PutMapping("/questions/{id}") public Question updateQuestion(@PathVariable UUID id, @RequestBody Question body) { return update(Question.class, id, body, "LMS"); }
    @DeleteMapping("/questions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteQuestion(@PathVariable UUID id) { delete(Question.class, id, "LMS"); }

    @GetMapping("/doubts") public List<DoubtTicket> doubts() { return list(DoubtTicket.class); }
    @PostMapping("/doubts") public DoubtTicket createDoubt(@RequestBody DoubtTicket body) { return create(body, "LMS"); }
    @PutMapping("/doubts/{id}") public DoubtTicket updateDoubt(@PathVariable UUID id, @RequestBody DoubtTicket body) { return update(DoubtTicket.class, id, body, "LMS"); }

    @GetMapping("/certificates") public List<Certificate> certificates() { return list(Certificate.class); }
    @PostMapping("/certificates") public Certificate createCert(@RequestBody Certificate body) { return create(body, "LMS"); }

    @GetMapping("/fee-plans") public List<FeePlan> feePlans() { return list(FeePlan.class); }
    @PostMapping("/fee-plans") public FeePlan createPlan(@RequestBody FeePlan body) {
        body.setTermId(sis.resolveTermId(body.getTermId()));
        return create(body, "FEES");
    }

    @GetMapping("/invoices") public List<Invoice> invoices() { return list(Invoice.class); }
    @PostMapping("/invoices") public Invoice createInvoice(@RequestBody Invoice body) { return fees.finalizeInvoice(create(body, "FEES")); }

    @GetMapping("/payments") public List<Payment> payments() { return list(Payment.class); }
    @PostMapping("/payments") public Payment createPayment(@RequestBody Payment body) { return create(body, "FEES"); }

    @GetMapping("/refunds") public List<Refund> refunds() { return list(Refund.class); }
    @PostMapping("/refunds") public Refund createRefund(@RequestBody Refund body) { return create(body, "FEES"); }

    @GetMapping("/installments") public List<FeeInstallment> installments() { return list(FeeInstallment.class); }
    @GetMapping("/receipts") public List<Receipt> receipts() { return list(Receipt.class); }
    @GetMapping("/exam-attempts") public List<ExamAttempt> attempts() { return list(ExamAttempt.class); }
    @GetMapping("/lms-packages") public List<LmsPackage> packages() { return list(LmsPackage.class); }
    @GetMapping("/lms-launches") public List<LmsLaunch> launches() { return list(LmsLaunch.class); }
    @GetMapping("/drive-rounds") public List<DriveRound> driveRounds() { return list(DriveRound.class); }
    @GetMapping("/audit") public List<AuditEvent> audit() {
        Access.requireAny(Auth.current(), Roles.OWNER);
        return list(AuditEvent.class);
    }

    @GetMapping("/notifications") public List<Notification> notifications() { return list(Notification.class); }
    @PostMapping("/notifications") public Notification createNotification(@RequestBody Notification body) { return create(body, "COMMS"); }

    @GetMapping("/announcements") public List<Announcement> announcements() { return list(Announcement.class); }
    @PostMapping("/announcements") public Announcement createAnnouncement(@RequestBody Announcement body) { return create(body, "COMMS"); }

    @GetMapping("/message-templates") public List<MessageTemplate> messageTemplates() {
        grow.ensureTemplates();
        return list(MessageTemplate.class);
    }
    @PostMapping("/message-templates") public MessageTemplate createMessageTemplate(@RequestBody MessageTemplate body) { return create(body, "COMMS"); }
    @PutMapping("/message-templates/{id}") public MessageTemplate updateMessageTemplate(@PathVariable UUID id, @RequestBody MessageTemplate body) { return update(MessageTemplate.class, id, body, "COMMS"); }

    @GetMapping("/inbox") public List<InboxMessage> inbox() { return list(InboxMessage.class); }
    @PostMapping("/inbox") public InboxMessage createInbox(@RequestBody InboxMessage body) { return create(body, "COMMS"); }
    @PutMapping("/inbox/{id}") public InboxMessage updateInbox(@PathVariable UUID id, @RequestBody InboxMessage body) { return update(InboxMessage.class, id, body, "COMMS"); }

    @GetMapping("/report-definitions") public List<ReportDefinition> reportDefinitions() { return list(ReportDefinition.class); }
    @GetMapping("/scheduled-reports") public List<ScheduledReport> scheduledReports() { return list(ScheduledReport.class); }
    @GetMapping("/xapi-statements") public List<XapiStatement> xapiStatements() { return list(XapiStatement.class); }
    @GetMapping("/accreditation-folders") public List<AccreditationFolder> accreditationFolders() { return list(AccreditationFolder.class); }
    @PostMapping("/accreditation-folders") public AccreditationFolder createFolder(@RequestBody AccreditationFolder body) { return create(body, "LMS"); }
    @GetMapping("/accreditation-evidence") public List<AccreditationEvidence> accreditationEvidence() { return list(AccreditationEvidence.class); }
    @PostMapping("/accreditation-evidence") public AccreditationEvidence createEvidence(@RequestBody AccreditationEvidence body) { return create(body, "LMS"); }

    @GetMapping("/skills") public List<Skill> skills() { return list(Skill.class); }
    @PostMapping("/skills") public Skill createSkill(@RequestBody Skill body) { return create(body, "PLACEMENT"); }

    @GetMapping("/resumes") public List<Resume> resumes() { return list(Resume.class); }
    @PostMapping("/resumes") public Resume createResume(@RequestBody Resume body) { return create(body, "PLACEMENT"); }

    @GetMapping("/mocks") public List<MockInterview> mocks() { return list(MockInterview.class); }
    @PostMapping("/mocks") public MockInterview createMock(@RequestBody MockInterview body) { return create(body, "PLACEMENT"); }

    @GetMapping("/practice") public List<PracticeAttempt> practice() { return list(PracticeAttempt.class); }
    @PostMapping("/practice") public PracticeAttempt createPractice(@RequestBody PracticeAttempt body) { return create(body, "PLACEMENT"); }

    @GetMapping("/companies") public List<Company> companies() { return list(Company.class); }
    @PostMapping("/companies") public Company createCompany(@RequestBody Company body) { return create(body, "PLACEMENT"); }

    @GetMapping("/drives") public List<Drive> drives() { return list(Drive.class); }
    @PostMapping("/drives") public Drive createDrive(@RequestBody Drive body) { return create(body, "PLACEMENT"); }

    @GetMapping("/applications") public List<Application> applications() { return list(Application.class); }
    @PostMapping("/applications") public Application createApplication(@RequestBody Application body) { return create(body, "PLACEMENT"); }
    @PutMapping("/applications/{id}") public Application updateApplication(@PathVariable UUID id, @RequestBody Application body) { return update(Application.class, id, body, "PLACEMENT"); }

    @GetMapping("/interviews") public List<InterviewRound> interviews() { return list(InterviewRound.class); }
    @PostMapping("/interviews") public InterviewRound createInterview(@RequestBody InterviewRound body) { return create(body, "PLACEMENT"); }

    @GetMapping("/offers") public List<Offer> offers() { return list(Offer.class); }
    @PostMapping("/offers") public Offer createOffer(@RequestBody Offer body) { return create(body, "PLACEMENT"); }

    @GetMapping("/internships") public List<Internship> internships() { return list(Internship.class); }
    @PostMapping("/internships") public Internship createInternship(@RequestBody Internship body) { return create(body, "PLACEMENT"); }

    @GetMapping("/alumni") public List<Alumnus> alumni() { return list(Alumnus.class); }
    @PostMapping("/alumni") public Alumnus createAlumni(@RequestBody Alumnus body) { return create(body, "PLACEMENT"); }

    @GetMapping("/alumni-jobs") public List<AlumniJob> alumniJobs() { return list(AlumniJob.class); }
    @PostMapping("/alumni-jobs") public AlumniJob createAlumniJob(@RequestBody AlumniJob body) { return create(body, "PLACEMENT"); }

    @GetMapping("/industry") public List<IndustryAccount> industry() { return list(IndustryAccount.class); }
    @PostMapping("/industry") public IndustryAccount createIndustry(@RequestBody IndustryAccount body) { return create(body, "PLACEMENT"); }

    @GetMapping("/events") public List<IndustryEvent> events() { return list(IndustryEvent.class); }
    @PostMapping("/events") public IndustryEvent createEvent(@RequestBody IndustryEvent body) { return create(body, "PLACEMENT"); }

    @GetMapping("/tickets") public List<SupportTicket> tickets() { return list(SupportTicket.class); }
    @PostMapping("/tickets") public SupportTicket createTicket(@RequestBody SupportTicket body) { return create(body, "ADMIN"); }
    @PutMapping("/tickets/{id}") public SupportTicket updateTicket(@PathVariable UUID id, @RequestBody SupportTicket body) { return update(SupportTicket.class, id, body, "ADMIN"); }

    @GetMapping("/website-pages") public List<WebsitePage> websitePages() { return list(WebsitePage.class); }
    @PostMapping("/website-pages") public WebsitePage createWebsitePage(@RequestBody WebsitePage body) { return create(body, "GROWTH"); }
    @PutMapping("/website-pages/{id}") public WebsitePage updateWebsitePage(@PathVariable UUID id, @RequestBody WebsitePage body) { return update(WebsitePage.class, id, body, "GROWTH"); }
    @DeleteMapping("/website-pages/{id}") public void deleteWebsitePage(@PathVariable UUID id) { delete(WebsitePage.class, id, "GROWTH"); }

    @GetMapping("/coupons") public List<Coupon> coupons() { return list(Coupon.class); }
    @PostMapping("/coupons") public Coupon createCoupon(@RequestBody Coupon body) {
        Access.requireTenant(Auth.current());
        validateCoupon(body, null);
        return create(body, "GROWTH");
    }
    @PutMapping("/coupons/{id}") public Coupon updateCoupon(@PathVariable UUID id, @RequestBody Coupon body) {
        validateCoupon(body, id);
        return update(Coupon.class, id, body, "GROWTH");
    }
    @DeleteMapping("/coupons/{id}") public void deleteCoupon(@PathVariable UUID id) { delete(Coupon.class, id, "GROWTH"); }

    @GetMapping("/landing-pages") public List<LandingPage> landingPages() { return list(LandingPage.class); }
    @PostMapping("/landing-pages") public LandingPage createLandingPage(@RequestBody LandingPage body) { return create(body, "GROWTH"); }
    @PutMapping("/landing-pages/{id}") public LandingPage updateLandingPage(@PathVariable UUID id, @RequestBody LandingPage body) { return update(LandingPage.class, id, body, "GROWTH"); }
    @DeleteMapping("/landing-pages/{id}") public void deleteLandingPage(@PathVariable UUID id) { delete(LandingPage.class, id, "GROWTH"); }

    @GetMapping("/campaigns") public List<Campaign> campaigns() { return list(Campaign.class); }
    @PostMapping("/campaigns") public Campaign createCampaign(@RequestBody Campaign body) { return create(body, "GROWTH"); }
    @PutMapping("/campaigns/{id}") public Campaign updateCampaign(@PathVariable UUID id, @RequestBody Campaign body) { return update(Campaign.class, id, body, "GROWTH"); }
    @DeleteMapping("/campaigns/{id}") public void deleteCampaign(@PathVariable UUID id) { delete(Campaign.class, id, "GROWTH"); }

    @GetMapping("/app-banners") public List<AppBanner> appBanners() { return list(AppBanner.class); }
    @PostMapping("/app-banners") public AppBanner createAppBanner(@RequestBody AppBanner body) { return create(body, "GROWTH"); }
    @PutMapping("/app-banners/{id}") public AppBanner updateAppBanner(@PathVariable UUID id, @RequestBody AppBanner body) { return update(AppBanner.class, id, body, "GROWTH"); }
    @DeleteMapping("/app-banners/{id}") public void deleteAppBanner(@PathVariable UUID id) { delete(AppBanner.class, id, "GROWTH"); }

    @GetMapping("/app-pushes") public List<AppPush> appPushes() { return list(AppPush.class); }
    @PostMapping("/app-pushes") public AppPush createAppPush(@RequestBody AppPush body) { return create(body, "GROWTH"); }
    @PutMapping("/app-pushes/{id}") public AppPush updateAppPush(@PathVariable UUID id, @RequestBody AppPush body) { return update(AppPush.class, id, body, "GROWTH"); }

    @GetMapping("/free-materials") public List<FreeMaterial> freeMaterials() { return list(FreeMaterial.class); }
    @PostMapping("/free-materials") public FreeMaterial createFreeMaterial(@RequestBody FreeMaterial body) { return create(body, "GROWTH"); }
    @PutMapping("/free-materials/{id}") public FreeMaterial updateFreeMaterial(@PathVariable UUID id, @RequestBody FreeMaterial body) { return update(FreeMaterial.class, id, body, "GROWTH"); }
    @DeleteMapping("/free-materials/{id}") public void deleteFreeMaterial(@PathVariable UUID id) { delete(FreeMaterial.class, id, "GROWTH"); }

    @GetMapping("/chat-threads") public List<ChatThread> chatThreads() { return list(ChatThread.class); }
    @PostMapping("/chat-threads") public ChatThread createChatThread(@RequestBody ChatThread body) { return create(body, "COMMS"); }
    @PutMapping("/chat-threads/{id}") public ChatThread updateChatThread(@PathVariable UUID id, @RequestBody ChatThread body) { return update(ChatThread.class, id, body, "COMMS"); }

    @GetMapping("/chat-messages") public List<ChatMessage> chatMessages() { return list(ChatMessage.class); }
    @PostMapping("/chat-messages") public ChatMessage createChatMessage(@RequestBody ChatMessage body) { return create(body, "COMMS"); }

    @GetMapping("/content-progress") public List<ContentProgress> contentProgress() { return list(ContentProgress.class); }

    @GetMapping("/one-to-one-sessions") public List<OneToOneSession> oneToOneSessions() { return list(OneToOneSession.class); }
    @PostMapping("/one-to-one-sessions") public OneToOneSession createOneToOne(@RequestBody OneToOneSession body) { return create(body, "GROWTH"); }
    @PutMapping("/one-to-one-sessions/{id}") public OneToOneSession updateOneToOne(@PathVariable UUID id, @RequestBody OneToOneSession body) { return update(OneToOneSession.class, id, body, "GROWTH"); }

    @GetMapping("/backend-additions") public List<BackendAddition> backendAdditions() { return list(BackendAddition.class); }
    @PostMapping("/backend-additions") public BackendAddition createBackendAddition(@RequestBody BackendAddition body) {
        Access.requireTenant(Auth.current());
        if (body.getCourseId() == null || body.getStudentId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Course and student are required");
        }
        UUID org = Auth.current().organizationId();
        boolean already = store.list(BackendAddition.class, org).stream()
                .anyMatch(a -> body.getCourseId().equals(a.getCourseId()) && body.getStudentId().equals(a.getStudentId()));
        if (already) {
            throw new ApiException(HttpStatus.CONFLICT, "This student is already added to that course");
        }
        return create(body, "GROWTH");
    }
    @DeleteMapping("/backend-additions/{id}") public void deleteBackendAddition(@PathVariable UUID id) {
        delete(BackendAddition.class, id, "GROWTH");
    }

    @GetMapping("/integration-connections") public List<IntegrationConnection> integrationConnections() { return list(IntegrationConnection.class); }
    @PostMapping("/integration-connections") public IntegrationConnection createIntegrationConnection(@RequestBody IntegrationConnection body) {
        Access.requireAny(Auth.current(), Roles.OWNER);
        return create(body, "SETUP");
    }
    @PutMapping("/integration-connections/{id}") public IntegrationConnection updateIntegrationConnection(@PathVariable UUID id, @RequestBody IntegrationConnection body) {
        Access.requireAny(Auth.current(), Roles.OWNER);
        return update(IntegrationConnection.class, id, body, "SETUP");
    }

    private static final Set<String> INSTITUTE_STAFF = Set.of(
            Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.FACULTY, Roles.COUNSELOR, Roles.ACCOUNTANT);

    public record StaffInvite(String fullName, String email, String phone, String role, String capabilitiesCsv, List<String> capabilities) {}

    public record StaffUpdate(String capabilitiesCsv, List<String> capabilities, String role) {}

    public record StaffVerifyRequest(@jakarta.validation.constraints.NotBlank String otp) {}

    @GetMapping("/staff")
    public List<Map<String, Object>> staff() {
        Access.requireTenant(Auth.current());
        Access.requireAnyModule(Auth.current(), "STAFF");
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.FACULTY, Roles.COUNSELOR, Roles.ACCOUNTANT);
        return store.em().createQuery("select u from AppUser u where u.organizationId = :o", AppUser.class)
                .setParameter("o", Auth.current().organizationId())
                .getResultList()
                .stream()
                .filter(u -> INSTITUTE_STAFF.contains(u.getRole()))
                .map(this::staffView)
                .toList();
    }

    @PostMapping("/staff")
    public Map<String, Object> createStaff(@RequestBody StaffInvite body) {
        Access.requireTenant(Auth.current());
        Access.requireWrite(Auth.current(), "SETUP");
        Access.requireAnyModule(Auth.current(), "STAFF");
        if (body.fullName() == null || body.fullName().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        if (body.email() == null || body.email().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Email is required so they can log in");
        }
        String email = body.email().trim().toLowerCase();
        if (store.findUserByEmail(email) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "That email already has an account");
        }
        String role = body.role() == null || body.role().isBlank() ? Roles.FACULTY : body.role();
        if (!INSTITUTE_STAFF.contains(role) || Roles.OWNER.equals(role)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose faculty, counselor, accountant, or placement head");
        }
        String phone = body.phone() == null ? "" : Phones.normalize(body.phone());
        if (!phone.isBlank()) {
            AppUser byPhone = store.findUserByPhone(phone);
            if (byPhone != null) {
                throw new ApiException(HttpStatus.CONFLICT, "That mobile already has an account");
            }
        }
        String temp = PasswordPolicy.temporary();
        PasswordPolicy.validate(temp);
        AppUser user = new AppUser();
        user.setOrganizationId(Auth.current().organizationId());
        user.setFullName(body.fullName().trim());
        user.setEmail(email);
        user.setPhone(phone);
        user.setRole(role);
        user.setActive(true);
        user.setCapabilitiesCsv(Packs.sanitizeCapsCsv(body.capabilitiesCsv(), body.capabilities()));
        user.setPasswordHash(encoder.encode(temp));
        user.setPasswordChangedAt(Instant.now());
        user = store.save(user);
        foundation.ensureEmployeeForStaff(user);
        Map<String, Object> out = new LinkedHashMap<>(staffView(user));
        out.put("tempPassword", temp);
        return out;
    }

    @PutMapping("/staff/{id}")
    public Map<String, Object> updateStaff(@PathVariable UUID id, @RequestBody StaffUpdate body) {
        Access.requireTenant(Auth.current());
        Access.requireWrite(Auth.current(), "SETUP");
        Access.requireAnyModule(Auth.current(), "STAFF");
        AppUser user = store.get(AppUser.class, id);
        if (user.getOrganizationId() == null || !user.getOrganizationId().equals(Auth.current().organizationId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Staff member not found");
        }
        if (!INSTITUTE_STAFF.contains(user.getRole()) || Roles.OWNER.equals(user.getRole())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only faculty, counselor, accountant, or placement head rights can be edited");
        }
        if (body.role() != null && !body.role().isBlank()) {
            String role = body.role();
            if (!INSTITUTE_STAFF.contains(role) || Roles.OWNER.equals(role)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Choose faculty, counselor, accountant, or placement head");
            }
            user.setRole(role);
        }
        user.setCapabilitiesCsv(Packs.sanitizeCapsCsv(body.capabilitiesCsv(), body.capabilities()));
        return staffView(store.save(user));
    }

    @PostMapping("/staff/{id}/verify/email/request")
    public Map<String, Object> requestStaffEmailOtp(@PathVariable UUID id) {
        AppUser user = requireStaffMember(id);
        String email = user.getEmail() == null ? "" : user.getEmail().trim().toLowerCase();
        if (email.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This staff member has no email");
        }
        if (user.isEmailVerified()) {
            return Map.of("status", "already_verified", "channel", "email");
        }
        var issued = otp.issue(email, OtpService.VERIFY_EMAIL);
        if (mail.canDeliver(email)) {
            try {
                mail.sendOtp(email, OtpService.VERIFY_EMAIL, issued.code());
            } catch (Exception ignored) {
                /* still return OTP for testing when SMTP fails */
            }
        }
        Map<String, Object> out = new LinkedHashMap<>(otp.publicIssue(issued));
        out.put("channel", "email");
        return out;
    }

    @PostMapping("/staff/{id}/verify/email")
    public Map<String, Object> verifyStaffEmail(@PathVariable UUID id, @RequestBody StaffVerifyRequest body) {
        AppUser user = requireStaffMember(id);
        String email = user.getEmail() == null ? "" : user.getEmail().trim().toLowerCase();
        if (email.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This staff member has no email");
        }
        otp.verify(email, OtpService.VERIFY_EMAIL, body.otp());
        user.setEmailVerified(true);
        return staffView(store.save(user));
    }

    @PostMapping("/staff/{id}/verify/phone/request")
    public Map<String, Object> requestStaffPhoneOtp(@PathVariable UUID id) {
        AppUser user = requireStaffMember(id);
        String phone = user.getPhone() == null ? "" : Phones.normalize(user.getPhone());
        if (phone.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Add a mobile number before verifying");
        }
        if (user.isPhoneVerified()) {
            return Map.of("status", "already_verified", "channel", "phone");
        }
        var issued = otp.issue(phone, OtpService.VERIFY_PHONE);
        Map<String, Object> out = new LinkedHashMap<>(otp.publicIssue(issued));
        out.put("channel", "phone");
        return out;
    }

    @PostMapping("/staff/{id}/verify/phone")
    public Map<String, Object> verifyStaffPhone(@PathVariable UUID id, @RequestBody StaffVerifyRequest body) {
        AppUser user = requireStaffMember(id);
        String phone = user.getPhone() == null ? "" : Phones.normalize(user.getPhone());
        if (phone.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Add a mobile number before verifying");
        }
        otp.verify(phone, OtpService.VERIFY_PHONE, body.otp());
        user.setPhoneVerified(true);
        return staffView(store.save(user));
    }

    private AppUser requireStaffMember(UUID id) {
        Access.requireTenant(Auth.current());
        Access.requireWrite(Auth.current(), "SETUP");
        Access.requireAnyModule(Auth.current(), "STAFF");
        AppUser user = store.get(AppUser.class, id);
        if (user.getOrganizationId() == null || !user.getOrganizationId().equals(Auth.current().organizationId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Staff member not found");
        }
        if (!INSTITUTE_STAFF.contains(user.getRole()) || Roles.OWNER.equals(user.getRole())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only institute staff can be verified here");
        }
        return user;
    }

    private Map<String, Object> staffView(AppUser u) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", u.getId());
        row.put("fullName", u.getFullName());
        row.put("email", u.getEmail());
        row.put("phone", u.getPhone() == null ? "" : u.getPhone());
        row.put("emailVerified", u.isEmailVerified());
        row.put("phoneVerified", u.isPhoneVerified());
        row.put("role", u.getRole());
        row.put("centerId", u.getCenterId() == null ? "" : u.getCenterId());
        row.put("active", u.isActive());
        row.put("capabilitiesCsv", u.getCapabilitiesCsv() == null ? "" : u.getCapabilitiesCsv());
        row.put("capabilities", Packs.capsFor(u.getRole(), u.getCapabilitiesCsv()));
        row.putAll(foundation.staffLinkInfo(u));
        return row;
    }

    private void validateCoupon(Coupon body, UUID ignoreId) {
        Access.requireTenant(Auth.current());
        String code = body.getCode() == null ? "" : body.getCode().trim();
        if (code.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Coupon code is required");
        }
        body.setCode(code);
        UUID org = Auth.current().organizationId();
        boolean duplicate = store.list(Coupon.class, org).stream()
                .anyMatch(c -> (ignoreId == null || !ignoreId.equals(c.getId()))
                        && c.getCode() != null
                        && c.getCode().equalsIgnoreCase(code));
        if (duplicate) {
            throw new ApiException(HttpStatus.CONFLICT, "A coupon with this code already exists");
        }
        BigDecimal value = body.getDiscountValue();
        if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Discount value must be greater than 0");
        }
        if ("PERCENT".equalsIgnoreCase(body.getDiscountType()) && value.compareTo(new BigDecimal("100")) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Percent discount must be between 1 and 100");
        }
    }

    private <T extends TenantEntity> List<T> list(Class<T> type) {
        PropelUser user = Auth.current();
        Access.requireTenant(user);
        Access.requireEntityModule(user, type);
        return scope.restrict(type, store.list(type, user.organizationId()), user);
    }

    private <T extends TenantEntity> T create(T body, String area) {
        Access.requireTenant(Auth.current());
        Access.requireEntityModule(Auth.current(), body.getClass());
        boolean student = Roles.STUDENT.equals(Auth.current().role());
        boolean studentWrite = student && (body instanceof DoubtTicket || body instanceof ChatThread || body instanceof ChatMessage);
        if (!studentWrite) {
            Access.requireWrite(Auth.current(), area);
            if (student) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Students cannot create this record");
            }
        }
        body.setId(null);
        body.setOrganizationId(Auth.current().organizationId());
        if (student) {
            var me = scope.studentFor(Auth.current());
            if (me != null && body instanceof DoubtTicket ticket) {
                ticket.setStudentId(me.getId());
            }
            if (me != null && body instanceof ChatThread thread) {
                thread.setStudentId(me.getId());
                thread.setStudentName(me.getFullName());
                if (thread.getStatus() == null || thread.getStatus().isBlank()) {
                    thread.setStatus("OPEN");
                }
                thread.setLastMessageAt(java.time.Instant.now());
            }
            if (me != null && body instanceof ChatMessage message) {
                if (message.getThreadId() == null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a conversation first");
                }
                ChatThread thread = store.getOwned(ChatThread.class, message.getThreadId(), Auth.current().organizationId());
                if (!me.getId().equals(thread.getStudentId())) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "That chat is not yours");
                }
                message.setSenderRole(Roles.STUDENT);
                message.setSenderName(Auth.current().name());
                thread.setLastMessageAt(java.time.Instant.now());
                store.save(thread);
            }
        }
        return store.save(body);
    }

    private <T extends TenantEntity> T update(Class<T> type, UUID id, T body, String area) {
        Access.requireTenant(Auth.current());
        Access.requireEntityModule(Auth.current(), type);
        Access.requireWrite(Auth.current(), area);
        if (Roles.STUDENT.equals(Auth.current().role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Students cannot edit this record");
        }
        T existing = store.getOwned(type, id, Auth.current().organizationId());
        body.setId(id);
        body.setOrganizationId(existing.getOrganizationId());
        body.setCreatedAt(existing.getCreatedAt());
        return store.save(body);
    }

    private void delete(Class<? extends TenantEntity> type, UUID id, String area) {
        Access.requireTenant(Auth.current());
        Access.requireEntityModule(Auth.current(), type);
        Access.requireWrite(Auth.current(), area);
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.FACULTY);
        if (Roles.STUDENT.equals(Auth.current().role())) {
            Access.requireAny(Auth.current(), Roles.OWNER);
        }
        store.deleteOwned(type, id, Auth.current().organizationId());
    }

    private void applyShareSlug(Course body, UUID ignoreId) {
        Access.requireTenant(Auth.current());
        String slug = normalizeShareSlug(body.getShareSlug());
        if (!slug.isEmpty() && !shareSlugFree(slug, ignoreId, Auth.current().organizationId())) {
            throw new ApiException(HttpStatus.CONFLICT, "This link is not available");
        }
        body.setShareSlug(slug.isEmpty() ? null : slug);
    }

    private boolean shareSlugFree(String slug, UUID ignoreId, UUID orgId) {
        return store.list(Course.class, orgId).stream()
                .noneMatch(c -> slug.equalsIgnoreCase(nz(c.getShareSlug()))
                        && (ignoreId == null || !ignoreId.equals(c.getId())));
    }

    private static String normalizeShareSlug(String raw) {
        if (raw == null) {
            return "";
        }
        String slug = raw.trim().toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (slug.length() > 60) {
            slug = slug.substring(0, 60).replaceAll("-+$", "");
        }
        if (slug.length() < 3) {
            return "";
        }
        if (slug.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
            return "";
        }
        return slug;
    }

    private static String nz(String value) {
        return value == null ? "" : value;
    }

    @SuppressWarnings("unused")
    private void keepModelImport() {
        Model.class.getName();
    }
}
