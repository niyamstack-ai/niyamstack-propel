package com.niyamstack.propel.web;

import com.niyamstack.propel.catalog.Features;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.domain.TenantEntity;
import com.niyamstack.propel.lms.LmsService;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.DataScope;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class ResourceController {
    private final Store store;
    private final DataScope scope;
    private final LmsService lms;

    public ResourceController(Store store, DataScope scope, LmsService lms) {
        this.store = store;
        this.scope = scope;
        this.lms = lms;
    }

    @GetMapping("/features")
    public Object features() {
        return Features.ALL;
    }

    @GetMapping("/me")
    public PropelUser me() {
        return Auth.current();
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
        existing.setGstin(body.getGstin());
        existing.setEmail(body.getEmail());
        existing.setPhone(body.getPhone());
        existing.setWebsite(body.getWebsite());
        existing.setLogoUrl(body.getLogoUrl());
        existing.setBrandPrimary(body.getBrandPrimary());
        existing.setBrandSecondary(body.getBrandSecondary());
        existing.setWebsiteUrl(body.getWebsiteUrl());
        existing.setAppShareUrl(body.getAppShareUrl());
        existing.setCustomDomain(body.getCustomDomain());
        existing.setWebsitePublished(body.isWebsitePublished());
        existing.setSettingsJson(body.getSettingsJson());
        return store.save(existing);
    }

    @GetMapping("/centers") public List<Center> centers() { return list(Center.class); }
    @PostMapping("/centers") public Center createCenter(@RequestBody Center body) { return create(body, "SETUP"); }
    @PutMapping("/centers/{id}") public Center updateCenter(@PathVariable UUID id, @RequestBody Center body) { return update(Center.class, id, body, "SETUP"); }
    @DeleteMapping("/centers/{id}") public void deleteCenter(@PathVariable UUID id) { delete(Center.class, id, "SETUP"); }

    @GetMapping("/academic-years") public List<AcademicYear> years() { return list(AcademicYear.class); }
    @PostMapping("/academic-years") public AcademicYear createYear(@RequestBody AcademicYear body) { return create(body, "SETUP"); }

    @GetMapping("/terms") public List<Term> terms() { return list(Term.class); }
    @PostMapping("/terms") public Term createTerm(@RequestBody Term body) { return create(body, "SETUP"); }

    @GetMapping("/courses") public List<Course> courses() { return list(Course.class); }
    @PostMapping("/courses") public Course createCourse(@RequestBody Course body) { return create(body, "SETUP"); }
    @PutMapping("/courses/{id}") public Course updateCourse(@PathVariable UUID id, @RequestBody Course body) { return update(Course.class, id, body, "SETUP"); }
    @DeleteMapping("/courses/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCourse(@PathVariable UUID id) { lms.deleteCourse(id); }

    @GetMapping("/batches") public List<Batch> batches() { return list(Batch.class); }
    @PostMapping("/batches") public Batch createBatch(@RequestBody Batch body) { return create(body, "SETUP"); }
    @PutMapping("/batches/{id}") public Batch updateBatch(@PathVariable UUID id, @RequestBody Batch body) { return update(Batch.class, id, body, "SETUP"); }

    @GetMapping("/classrooms") public List<Classroom> classrooms() { return list(Classroom.class); }
    @PostMapping("/classrooms") public Classroom createClassroom(@RequestBody Classroom body) { return create(body, "SETUP"); }

    @GetMapping("/custom-fields") public List<CustomField> customFields() { return list(CustomField.class); }
    @PostMapping("/custom-fields") public CustomField createField(@RequestBody CustomField body) { return create(body, "SETUP"); }

    @GetMapping("/workflows") public List<Workflow> workflows() { return list(Workflow.class); }
    @PostMapping("/workflows") public Workflow createWorkflow(@RequestBody Workflow body) { return create(body, "ADMIN"); }

    @GetMapping("/templates") public List<DocumentTemplate> templates() { return list(DocumentTemplate.class); }
    @PostMapping("/templates") public DocumentTemplate createTemplate(@RequestBody DocumentTemplate body) { return create(body, "SETUP"); }

    @GetMapping("/inquiries") public List<Inquiry> inquiries() { return list(Inquiry.class); }
    @PostMapping("/inquiries") public Inquiry createInquiry(@RequestBody Inquiry body) { return create(body, "CRM"); }
    @PutMapping("/inquiries/{id}") public Inquiry updateInquiry(@PathVariable UUID id, @RequestBody Inquiry body) { return update(Inquiry.class, id, body, "CRM"); }

    @GetMapping("/counseling-notes") public List<CounselingNote> notes() { return list(CounselingNote.class); }
    @PostMapping("/counseling-notes") public CounselingNote createNote(@RequestBody CounselingNote body) { return create(body, "CRM"); }

    @GetMapping("/admission-forms") public List<AdmissionForm> forms() { return list(AdmissionForm.class); }
    @PostMapping("/admission-forms") public AdmissionForm createForm(@RequestBody AdmissionForm body) { return create(body, "CRM"); }

    @GetMapping("/eligibility-rules") public List<EligibilityRule> rules() { return list(EligibilityRule.class); }
    @PostMapping("/eligibility-rules") public EligibilityRule createRule(@RequestBody EligibilityRule body) { return create(body, "PLACEMENT"); }

    @GetMapping("/referrals") public List<Referral> referrals() { return list(Referral.class); }
    @PostMapping("/referrals") public Referral createReferral(@RequestBody Referral body) { return create(body, "CRM"); }

    @GetMapping("/scholarships") public List<Scholarship> scholarships() { return list(Scholarship.class); }
    @PostMapping("/scholarships") public Scholarship createScholarship(@RequestBody Scholarship body) { return create(body, "CRM"); }

    @GetMapping("/students") public List<Student> students() { return list(Student.class); }
    @PostMapping("/students") public Student createStudent(@RequestBody Student body) { return create(body, "SIS"); }
    @PutMapping("/students/{id}") public Student updateStudent(@PathVariable UUID id, @RequestBody Student body) { return update(Student.class, id, body, "SIS"); }

    @GetMapping("/student-documents") public List<StudentDocument> docs() { return list(StudentDocument.class); }
    @PostMapping("/student-documents") public StudentDocument createDoc(@RequestBody StudentDocument body) { return create(body, "SIS"); }

    @GetMapping("/guardians") public List<Guardian> guardians() { return list(Guardian.class); }
    @PostMapping("/guardians") public Guardian createGuardian(@RequestBody Guardian body) { return create(body, "SIS"); }

    @GetMapping("/timetable") public List<TimetableSlot> timetable() { return list(TimetableSlot.class); }
    @PostMapping("/timetable") public TimetableSlot createSlot(@RequestBody TimetableSlot body) { return create(body, "LMS"); }

    @GetMapping("/attendance") public List<AttendanceRecord> attendance() { return list(AttendanceRecord.class); }
    @PostMapping("/attendance") public AttendanceRecord markAttendance(@RequestBody AttendanceRecord body) { return create(body, "LMS"); }

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
    @PostMapping("/fee-plans") public FeePlan createPlan(@RequestBody FeePlan body) { return create(body, "FEES"); }

    @GetMapping("/invoices") public List<Invoice> invoices() { return list(Invoice.class); }
    @PostMapping("/invoices") public Invoice createInvoice(@RequestBody Invoice body) { return create(body, "FEES"); }

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

    @GetMapping("/message-templates") public List<MessageTemplate> messageTemplates() { return list(MessageTemplate.class); }
    @PostMapping("/message-templates") public MessageTemplate createMessageTemplate(@RequestBody MessageTemplate body) { return create(body, "COMMS"); }

    @GetMapping("/inbox") public List<InboxMessage> inbox() { return list(InboxMessage.class); }
    @PostMapping("/inbox") public InboxMessage createInbox(@RequestBody InboxMessage body) { return create(body, "COMMS"); }

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
    @PostMapping("/integration-connections") public IntegrationConnection createIntegrationConnection(@RequestBody IntegrationConnection body) { return create(body, "GROWTH"); }
    @PutMapping("/integration-connections/{id}") public IntegrationConnection updateIntegrationConnection(@PathVariable UUID id, @RequestBody IntegrationConnection body) { return update(IntegrationConnection.class, id, body, "GROWTH"); }

    @GetMapping("/staff")
    public List<Map<String, Object>> staff() {
        Access.requireTenant(Auth.current());
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.FACULTY, Roles.COUNSELOR, Roles.ACCOUNTANT);
        return store.em().createQuery("select u from AppUser u where u.organizationId = :o", AppUser.class)
                .setParameter("o", Auth.current().organizationId())
                .getResultList()
                .stream()
                .map(u -> Map.<String, Object>of(
                        "id", u.getId(),
                        "fullName", u.getFullName(),
                        "email", u.getEmail(),
                        "role", u.getRole(),
                        "centerId", u.getCenterId() == null ? "" : u.getCenterId(),
                        "active", u.isActive()
                ))
                .toList();
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
        return scope.restrict(type, store.list(type, user.organizationId()), user);
    }

    private <T extends TenantEntity> T create(T body, String area) {
        Access.requireTenant(Auth.current());
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
        Access.requireWrite(Auth.current(), area);
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.FACULTY);
        if (Roles.STUDENT.equals(Auth.current().role())) {
            Access.requireAny(Auth.current(), Roles.OWNER);
        }
        store.deleteOwned(type, id, Auth.current().organizationId());
    }

    @SuppressWarnings("unused")
    private void keepModelImport() {
        Model.class.getName();
    }
}
