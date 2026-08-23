package com.niyamstack.propel.seed;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

@Component
@Order(100)
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true")
public class DemoSeeder implements CommandLineRunner {
    private final Store store;
    private final PasswordEncoder encoder;

    public DemoSeeder(Store store, PasswordEncoder encoder) {
        this.store = store;
        this.encoder = encoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (store.countUsers() > 0) {
            backfillPortalLogins();
            return;
        }
        Organization org = new Organization();
        org.setName("Aarohan Coaching");
        org.setLegalName("Aarohan Skills Private Limited");
        org.setGstin("27AABCU9603R1ZX");
        org.setEmail("hello@yopmail.com");
        org.setPhone("+91 98765 00001");
        org.setWebsite("https://aarohan.demo");
        org.setPackageTier("ENTERPRISE");
        org.setProductPack("FULL_OPS");
        org.setSlug("aarohan");
        org.setAccessStatus("ACTIVE");
        org.setPaymentStatus("PAID");
        org.setBillingCycle("QUARTERLY");
        org.setDealAmount(new BigDecimal("45000"));
        org.setModulesCsv("STUDENTS,CRM,LMS,FEES,PLACEMENT,COMMS,ANALYTICS,WEBSITE,TESTS,STAFF,GROW");
        org.setMaxStudents(500);
        org.setMaxCenters(5);
        org.setPaidAt(Instant.now());
        org.setApprovedAt(Instant.now());
        org.setBrandPrimary("#0078f0");
        org.setBrandSecondary("#071a33");
        org.setWebsitePublished(true);
        org.setWebsiteUrl("/s/aarohan");
        org = store.save(org);
        UUID oid = org.getId();

        Center pune = center(oid, "Pune Center", "PNQ", "Baner", "Pune");
        Center hyd = center(oid, "Hyderabad Center", "HYD", "HITEC City", "Hyderabad");

        AppUser owner = user(oid, pune.getId(), "Ananya Deshmukh", "deepak@yopmail.com", "OWNER", "9876500001");
        user(oid, pune.getId(), "Rohan Kulkarni", "placement@yopmail.com", "PLACEMENT_HEAD", "9876500005");
        AppUser faculty = user(oid, pune.getId(), "Meera Iyer", "faculty@yopmail.com", "FACULTY", "9876500003");
        user(oid, pune.getId(), "Sahil Khan", "counselor@yopmail.com", "COUNSELOR", "9876500007");
        user(oid, pune.getId(), "Priya Shah", "accounts@yopmail.com", "ACCOUNTANT", "9876500006");
        user(oid, null, "Nisha Parent", "parent@yopmail.com", "PARENT", "9876500004");
        user(oid, null, "Kiran Recruiter", "recruiter@yopmail.com", "RECRUITER", "9876500008");

        AcademicYear year = new AcademicYear();
        year.setOrganizationId(oid);
        year.setName("2026-27");
        year.setStartDate(LocalDate.of(2026, 6, 1));
        year.setEndDate(LocalDate.of(2027, 5, 31));
        year.setActive(true);
        year = store.save(year);

        Term term = new Term();
        term.setOrganizationId(oid);
        term.setAcademicYearId(year.getId());
        term.setName("Term 1");
        term.setStartDate(LocalDate.of(2026, 6, 1));
        term.setEndDate(LocalDate.of(2026, 11, 30));
        store.save(term);

        Course java = course(oid, "JFS", "Java Full Stack", 6, new BigDecimal("85000"));
        java.setDescription("Java, Spring Boot, REST APIs, and PostgreSQL — live classes, recordings, and placement support.");
        store.save(java);
        Course da = course(oid, "DA", "Data Analytics", 4, new BigDecimal("72000"));
        da.setDescription("Excel, SQL, Power BI, and Python for working with real business data — live classes, recordings, and placement support.");
        da.setValidityType("MULTIPLE");
        da.setValidityValue(4);
        da.setValidityUnit("MONTH");
        da.setFeesAlt(new BigDecimal("42000"));
        da.setValidityAltValue(12);
        da.setValidityAltUnit("MONTH");
        store.save(da);

        Batch jfs = batch(oid, pune.getId(), java.getId(), year.getId(), faculty.getId(), "JFS-2026-A");
        Batch dab = batch(oid, hyd.getId(), da.getId(), year.getId(), faculty.getId(), "DA-2026-B");

        Classroom room = new Classroom();
        room.setOrganizationId(oid);
        room.setCenterId(pune.getId());
        room.setName("Lab 1");
        room.setType("LAB");
        room.setCapacity(40);
        room = store.save(room);

        CustomField cf = new CustomField();
        cf.setOrganizationId(oid);
        cf.setEntityType("STUDENT");
        cf.setFieldKey("highestQualification");
        cf.setLabel("Highest qualification");
        cf.setFieldType("TEXT");
        store.save(cf);

        Workflow wf = new Workflow();
        wf.setOrganizationId(oid);
        wf.setName("Fee waiver approval");
        wf.setTriggerType("FEE_WAIVER");
        wf.setStepsJson("[{\"role\":\"COUNSELOR\"},{\"role\":\"OWNER\"}]");
        store.save(wf);

        DocumentTemplate tpl = new DocumentTemplate();
        tpl.setOrganizationId(oid);
        tpl.setName("Fee receipt");
        tpl.setKind("RECEIPT");
        tpl.setBody("Received {{amount}} from {{student}} for {{invoice}}.");
        store.save(tpl);

        Inquiry inq = inquiry(oid, pune.getId(), java.getId(), "Aarav Joshi", "WALKIN", "COUNSELING");
        inquiry(oid, pune.getId(), java.getId(), "Diya Nair", "WEB", "NEW");
        inquiry(oid, hyd.getId(), da.getId(), "Kabir Rao", "REFERRAL", "NEW");

        CounselingNote note = new CounselingNote();
        note.setOrganizationId(oid);
        note.setInquiryId(inq.getId());
        note.setNote("Interested in weekend batch. Follow up after demo class.");
        note.setStage("COUNSELING");
        note.setNextAction("Schedule demo");
        store.save(note);

        AdmissionForm form = new AdmissionForm();
        form.setOrganizationId(oid);
        form.setCourseId(java.getId());
        form.setApplicantName("Online Applicant");
        form.setEmail("apply@yopmail.com");
        form.setPhone("9000000000");
        form.setStatus("SUBMITTED");
        store.save(form);

        EligibilityRule rule = new EligibilityRule();
        rule.setOrganizationId(oid);
        rule.setName("Drive 60% and 75% attendance");
        rule.setAppliesTo("DRIVE");
        rule.setRulesJson("{\"minMarks\":60,\"minAttendance\":75}");
        store.save(rule);

        Referral ref = new Referral();
        ref.setOrganizationId(oid);
        ref.setReferrerName("Alumni: Sneha");
        ref.setReferrerType("ALUMNI");
        ref.setInquiryId(inq.getId());
        ref.setIncentiveAmount(new BigDecimal("2000"));
        ref.setStatus("ATTRIBUTED");
        store.save(ref);

        Scholarship sch = new Scholarship();
        sch.setOrganizationId(oid);
        sch.setName("Merit 10%");
        sch.setPercent(new BigDecimal("10"));
        sch.setApprovalStatus("APPROVED");
        store.save(sch);

        AppUser studentUser = user(oid, pune.getId(), "Ishaan Patel", "student@yopmail.com", "STUDENT", "9876500002");
        Student s1 = student(oid, pune.getId(), java.getId(), jfs.getId(), studentUser.getId(), "STU-1001", "Ishaan Patel");
        Student s2 = student(oid, pune.getId(), java.getId(), jfs.getId(), null, "STU-1002", "Riya Sen");
        Student s3 = student(oid, hyd.getId(), da.getId(), dab.getId(), null, "STU-2001", "Aditya Menon");
        enroll(oid, s1.getId(), java.getId(), "BATCH");
        enroll(oid, s2.getId(), java.getId(), "BATCH");
        enroll(oid, s3.getId(), da.getId(), "BATCH");

        StudentDocument doc = new StudentDocument();
        doc.setOrganizationId(oid);
        doc.setStudentId(s1.getId());
        doc.setDocType("AADHAAR");
        doc.setFileName("aadhaar-ishaan.pdf");
        doc.setStorageUrl("/demo/aadhaar-ishaan.pdf");
        store.save(doc);

        Guardian g = new Guardian();
        g.setOrganizationId(oid);
        g.setStudentId(s1.getId());
        g.setFullName("Nisha Parent");
        g.setRelation("Mother");
        g.setEmail("parent@yopmail.com");
        g.setPhone("9876500099");
        store.save(g);

        TimetableSlot slot = new TimetableSlot();
        slot.setOrganizationId(oid);
        slot.setBatchId(jfs.getId());
        slot.setClassroomId(room.getId());
        slot.setFacultyUserId(faculty.getId());
        slot.setSubject("Spring Boot");
        slot.setDayOfWeek(1);
        slot.setStartTime(LocalTime.of(10, 0));
        slot.setEndTime(LocalTime.of(12, 0));
        store.save(slot);

        attend(oid, s1.getId(), jfs.getId(), LocalDate.now().minusDays(1), "PRESENT");
        attend(oid, s2.getId(), jfs.getId(), LocalDate.now().minusDays(1), "ABSENT");
        attend(oid, s1.getId(), jfs.getId(), LocalDate.now(), "PRESENT");

        ContentItem content = new ContentItem();
        content.setOrganizationId(oid);
        content.setBatchId(jfs.getId());
        content.setCourseId(java.getId());
        content.setTitle("REST APIs with Spring Boot");
        content.setContentType("PDF");
        content.setUrl("https://example.com/spring-rest.pdf");
        content.setBody("Controllers, services, JPA, and validation.");
        store.save(content);

        ContentItem scorm = new ContentItem();
        scorm.setOrganizationId(oid);
        scorm.setCourseId(java.getId());
        scorm.setTitle("SQL fundamentals package");
        scorm.setContentType("SCORM");
        scorm.setScormStandard("SCORM_1.2");
        scorm.setUrl("/packages/sql-scorm.zip");
        scorm.setPublished(true);
        scorm.setVisibility("COURSE");
        scorm = store.save(scorm);

        LmsPackage pkg = new LmsPackage();
        pkg.setOrganizationId(oid);
        pkg.setContentItemId(scorm.getId());
        pkg.setStandard("SCORM_1.2");
        pkg.setPackageKey("/packages/sql-scorm.zip");
        pkg.setLaunchUrl("/lms/player/sql-scorm");
        pkg.setVersionLabel("1.2");
        pkg.setStatus("READY");
        store.save(pkg);

        LiveSession live = new LiveSession();
        live.setOrganizationId(oid);
        live.setBatchId(jfs.getId());
        live.setTitle("Live: JPA mapping");
        live.setProvider("JITSI");
        live.setMeetingUrl("https://meet.jit.si/NiyamstackJpamapping");
        live.setStartsAt(Instant.now().plusSeconds(3600));
        store.save(live);

        OneToOneSession oneToOne = new OneToOneSession();
        oneToOne.setOrganizationId(oid);
        oneToOne.setTitle("Career counselling call");
        oneToOne.setMentorName("Faculty desk");
        oneToOne.setDurationMinutes(30);
        oneToOne.setPrice(new BigDecimal("499"));
        oneToOne.setMeetingUrl("https://meet.jit.si/NiyamstackCareerCall");
        oneToOne.setStatus("OPEN");
        store.save(oneToOne);

        Recording rec = new Recording();
        rec.setOrganizationId(oid);
        rec.setBatchId(jfs.getId());
        rec.setTitle("Recorded: Security & JWT");
        rec.setVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ");
        store.save(rec);

        Assignment asg = new Assignment();
        asg.setOrganizationId(oid);
        asg.setBatchId(jfs.getId());
        asg.setCourseId(java.getId());
        asg.setTitle("Build a student API");
        asg.setInstructions("CRUD + JWT + PostgreSQL.");
        asg.setDueAt(Instant.now().plusSeconds(86400 * 5));
        asg = store.save(asg);

        Submission sub = new Submission();
        sub.setOrganizationId(oid);
        sub.setAssignmentId(asg.getId());
        sub.setStudentId(s1.getId());
        sub.setContent("GitHub: github.com/ishaan/student-api");
        sub.setGrade("A");
        sub.setFeedback("Clean layering. Add tests.");
        store.save(sub);

        Assessment exam = new Assessment();
        exam.setOrganizationId(oid);
        exam.setBatchId(jfs.getId());
        exam.setCourseId(java.getId());
        exam.setTitle("Java mid-term");
        exam.setKind("MCQ");
        exam.setDurationMinutes(45);
        exam.setPublished(true);
        exam.setProctoring(true);
        exam.setPassingScore(40);
        exam.setTotalMarks(100);
        exam.setScheduledAt(Instant.now().plusSeconds(86400 * 2));
        exam = store.save(exam);

        Question q = new Question();
        q.setOrganizationId(oid);
        q.setAssessmentId(exam.getId());
        q.setSubject("Java");
        q.setTopic("Collections");
        q.setDifficulty("MEDIUM");
        q.setPrompt("Which structure is best for unique unordered values?");
        q.setOptionsJson("[\"List\",\"Set\",\"Queue\",\"Array\"]");
        q.setAnswerKey("Set");
        store.save(q);

        DoubtTicket doubt = new DoubtTicket();
        doubt.setOrganizationId(oid);
        doubt.setStudentId(s1.getId());
        doubt.setBatchId(jfs.getId());
        doubt.setSubject("N+1 queries");
        doubt.setBody("When should I use join fetch?");
        doubt.setStatus("ANSWERED");
        doubt.setFacultyReply("Use join fetch for required associations on that screen. Avoid cartesian explosions.");
        store.save(doubt);

        Certificate cert = new Certificate();
        cert.setOrganizationId(oid);
        cert.setStudentId(s2.getId());
        cert.setTitle("SQL module completion");
        cert.setIssuedOn(LocalDate.now().minusDays(10));
        store.save(cert);

        FeePlan plan = new FeePlan();
        plan.setOrganizationId(oid);
        plan.setCourseId(java.getId());
        plan.setBatchId(jfs.getId());
        plan.setName("JFS standard");
        plan.setTotalAmount(new BigDecimal("85000"));
        plan.setComponentsJson("[{\"name\":\"Tuition\",\"amount\":75000},{\"name\":\"LMS\",\"amount\":10000}]");
        plan.setGstRate(new BigDecimal("18"));
        plan.setInstallmentCount(2);
        plan.setHsn("9992");
        plan = store.save(plan);

        Invoice inv1 = invoice(oid, s1.getId(), plan.getId(), "INV-1001", new BigDecimal("42500"), "PAID");
        Invoice inv2 = invoice(oid, s1.getId(), plan.getId(), "INV-1002", new BigDecimal("42500"), "DUE");
        invoice(oid, s2.getId(), plan.getId(), "INV-1003", new BigDecimal("85000"), "DUE");

        Payment pay = new Payment();
        pay.setOrganizationId(oid);
        pay.setInvoiceId(inv1.getId());
        pay.setAmount(new BigDecimal("42500"));
        pay.setMethod("UPI");
        pay.setGatewayRef("PAY-DEMO-1");
        pay.setReceivedAt(Instant.now().minusSeconds(86400 * 20));
        pay.setStatus("CAPTURED");
        pay.setReceiptNo("RCPT-DEMO-1");
        pay = store.save(pay);

        Receipt receipt = new Receipt();
        receipt.setOrganizationId(oid);
        receipt.setPaymentId(pay.getId());
        receipt.setInvoiceId(inv1.getId());
        receipt.setReceiptNo("RCPT-DEMO-1");
        receipt.setAmount(new BigDecimal("42500"));
        receipt.setGstin(org.getGstin());
        receipt.setIssuedAt(Instant.now().minusSeconds(86400 * 20));
        store.save(receipt);

        Notification n = new Notification();
        n.setOrganizationId(oid);
        n.setChannel("WHATSAPP");
        n.setAudience("PARENTS");
        n.setTitle("Attendance alert");
        n.setBody("Riya Sen was marked absent yesterday.");
        n.setStatus("SENT");
        store.save(n);

        Announcement ann = new Announcement();
        ann.setOrganizationId(oid);
        ann.setBatchId(jfs.getId());
        ann.setTitle("Mock interviews this Friday");
        ann.setBody("Bring resumes printed and on Propel.");
        store.save(ann);

        MessageTemplate mt = new MessageTemplate();
        mt.setOrganizationId(oid);
        mt.setEventType("FEE_DUE");
        mt.setChannel("WHATSAPP");
        mt.setBody("Dear {{name}}, fee {{amount}} is due on {{date}}.");
        store.save(mt);

        InboxMessage inbox = new InboxMessage();
        inbox.setOrganizationId(oid);
        inbox.setFromName("Nisha Parent");
        inbox.setSubject("Fee installment");
        inbox.setBody("Can we split the second installment?");
        inbox.setStatus("OPEN");
        store.save(inbox);

        Skill skill = new Skill();
        skill.setOrganizationId(oid);
        skill.setStudentId(s1.getId());
        skill.setName("Spring Boot");
        skill.setProficiency("ADVANCED");
        skill.setEvidence("Capstone API");
        store.save(skill);

        Resume resume = new Resume();
        resume.setOrganizationId(oid);
        resume.setStudentId(s1.getId());
        resume.setVersionLabel("v2");
        resume.setContent("Ishaan Patel — Java developer intern. Built REST APIs with Spring Boot and PostgreSQL.");
        resume.setCompleteness(82);
        store.save(resume);

        MockInterview mock = new MockInterview();
        mock.setOrganizationId(oid);
        mock.setStudentId(s1.getId());
        mock.setKind("TECHNICAL");
        mock.setScore(78);
        mock.setFeedback("Strong Spring. Revise indexing.");
        mock.setScheduledAt(Instant.now().minusSeconds(86400 * 3));
        store.save(mock);

        PracticeAttempt pr = new PracticeAttempt();
        pr.setOrganizationId(oid);
        pr.setStudentId(s1.getId());
        pr.setKind("APTITUDE");
        pr.setScore(71);
        store.save(pr);

        Company infosys = company(oid, "Infosys", "IT Services");
        Company tcs = company(oid, "TCS", "IT Services");

        Drive drive = new Drive();
        drive.setOrganizationId(oid);
        drive.setCompanyId(infosys.getId());
        drive.setTitle("Infosys SES — Java");
        drive.setJobDescription("Core Java, SQL, Spring basics.");
        drive.setPackageLpa(new BigDecimal("4.5"));
        drive.setLocations("Pune, Hyderabad");
        drive.setDeadline(LocalDate.now().plusDays(12));
        drive.setStatus("OPEN");
        drive.setEligibilityRuleId(rule.getId());
        drive.setMinAttendancePct(75);
        drive.setMinMarks(60);
        drive = store.save(drive);

        DriveRound dr1 = new DriveRound();
        dr1.setOrganizationId(oid);
        dr1.setDriveId(drive.getId());
        dr1.setSeqNo(1);
        dr1.setRoundName("Aptitude");
        dr1.setRoundType("TEST");
        store.save(dr1);
        DriveRound dr2 = new DriveRound();
        dr2.setOrganizationId(oid);
        dr2.setDriveId(drive.getId());
        dr2.setSeqNo(2);
        dr2.setRoundName("Technical 1");
        dr2.setRoundType("TECHNICAL");
        store.save(dr2);

        Application app = new Application();
        app.setOrganizationId(oid);
        app.setDriveId(drive.getId());
        app.setStudentId(s1.getId());
        app.setStatus("SHORTLISTED");
        app.setEligibilityPassed(true);
        app.setCurrentRound("Technical 1");
        app = store.save(app);

        InterviewRound round = new InterviewRound();
        round.setOrganizationId(oid);
        round.setApplicationId(app.getId());
        round.setRoundName("Technical 1");
        round.setPanel("Meera Iyer");
        round.setOutcome("PASS");
        round.setFeedback("Good fundamentals.");
        store.save(round);

        Offer offer = new Offer();
        offer.setOrganizationId(oid);
        offer.setApplicationId(app.getId());
        offer.setPackageLpa(new BigDecimal("4.5"));
        offer.setStatus("PENDING");
        offer.setJoiningDate(LocalDate.now().plusMonths(1));
        store.save(offer);

        Internship intern = new Internship();
        intern.setOrganizationId(oid);
        intern.setStudentId(s3.getId());
        intern.setCompanyId(tcs.getId());
        intern.setRole("Data intern");
        intern.setStipend(new BigDecimal("15000"));
        intern.setStatus("ONGOING");
        intern.setStartDate(LocalDate.now().minusDays(20));
        intern.setEndDate(LocalDate.now().plusDays(40));
        store.save(intern);

        Alumnus alum = new Alumnus();
        alum.setOrganizationId(oid);
        alum.setFullName("Sneha Kulkarni");
        alum.setCompany("Infosys");
        alum.setRole("Systems Engineer");
        alum.setEngagement("ACTIVE");
        alum = store.save(alum);

        AlumniJob job = new AlumniJob();
        job.setOrganizationId(oid);
        job.setAlumniId(alum.getId());
        job.setTitle("Junior Java Developer");
        job.setCompany("Fintech Pune");
        job.setStatus("OPEN");
        store.save(job);

        IndustryAccount ia = new IndustryAccount();
        ia.setOrganizationId(oid);
        ia.setName("Infosys campus");
        ia.setMou(true);
        ia.setOwnerName("Rohan Kulkarni");
        ia.setHiringCycle("H1 and H2");
        store.save(ia);

        IndustryEvent ev = new IndustryEvent();
        ev.setOrganizationId(oid);
        ev.setTitle("Guest lecture: hiring in 2026");
        ev.setEventDate(LocalDate.now().plusDays(7));
        ev.setAttendanceCount(0);
        store.save(ev);

        SupportTicket t = new SupportTicket();
        t.setOrganizationId(oid);
        t.setRaisedBy("Ishaan Patel");
        t.setCategory("LMS");
        t.setSubject("Cannot play recorded lecture");
        t.setBody("Video spins on mobile.");
        t.setStatus("OPEN");
        store.save(t);

        owner.getEmail();
        inv2.getInvoiceNo();
        List.of(s2, s3);
    }

    private Center center(UUID oid, String name, String code, String address, String city) {
        Center c = new Center();
        c.setOrganizationId(oid);
        c.setName(name);
        c.setCode(code);
        c.setAddress(address);
        c.setCity(city);
        c.setActive(true);
        return store.save(c);
    }

    private AppUser user(UUID oid, UUID centerId, String name, String email, String role, String phone) {
        AppUser u = new AppUser();
        u.setOrganizationId(oid);
        u.setCenterId(centerId);
        u.setFullName(name);
        u.setEmail(email);
        u.setPhone(phone);
        u.setPasswordHash(encoder.encode("Propel@123"));
        u.setRole(role);
        u.setActive(true);
        return store.save(u);
    }

    private void backfillPortalLogins() {
        AppUser owner = store.findUserByEmail("deepak@yopmail.com");
        if (owner == null) {
            owner = store.findUserByEmail("owner@aarohan.demo");
            if (owner != null) {
                owner.setEmail("deepak@yopmail.com");
                store.save(owner);
            }
        }
        if (owner != null) {
            owner.setPasswordHash(encoder.encode("Propel@123"));
            owner.setFailedLogins(0);
            owner.setLockedUntil(null);
            owner.setActive(true);
            if ("owner@aarohan.demo".equalsIgnoreCase(owner.getEmail())) {
                owner.setEmail("deepak@yopmail.com");
            }
            store.save(owner);
        }
        if (owner == null) {
            owner = store.findUserByPhone("9876500001");
            if (owner != null) {
                owner.setEmail("deepak@yopmail.com");
                owner.setPasswordHash(encoder.encode("Propel@123"));
                owner.setFailedLogins(0);
                owner.setLockedUntil(null);
                owner.setActive(true);
                store.save(owner);
            }
        }
        if (owner == null || owner.getOrganizationId() == null) {
            return;
        }
        Organization org = store.get(Organization.class, owner.getOrganizationId());
        if (org.getSlug() == null || org.getSlug().isBlank()) {
            org.setSlug("aarohan");
        }
        if (org.getAccessStatus() == null || org.getAccessStatus().isBlank()) {
            org.setAccessStatus("ACTIVE");
        }
        if (org.getBrandPrimary() == null || org.getBrandPrimary().isBlank()) {
            org.setBrandPrimary("#0078f0");
            org.setBrandSecondary("#071a33");
        }
        if (org.getDealAmount() == null) {
            org.setPaymentStatus("PAID");
            org.setBillingCycle("QUARTERLY");
            org.setDealAmount(new BigDecimal("45000"));
            org.setProductPack("FULL_OPS");
            org.setModulesCsv("STUDENTS,CRM,LMS,FEES,PLACEMENT,COMMS,ANALYTICS,WEBSITE,TESTS,STAFF,GROW");
            org.setModulesCsv("STUDENTS,CRM,LMS,FEES,PLACEMENT,COMMS,ANALYTICS,WEBSITE,TESTS,STAFF,GROW");
            org.setMaxStudents(500);
            org.setMaxCenters(5);
        }
        org.setWebsitePublished(true);
        if (org.getWebsiteUrl() == null || org.getWebsiteUrl().isBlank()) {
            org.setWebsiteUrl("/s/aarohan");
        }
        store.save(org);
        remapDemoEmails(org.getId());
        refreshDemoCatalog(org.getId());
        if (store.list(CourseEnrollment.class, org.getId()).isEmpty()) {
            for (Student student : store.list(Student.class, org.getId())) {
                if (student.getCourseId() != null) {
                    enroll(org.getId(), student.getId(), student.getCourseId(), "BATCH");
                }
            }
        }
        phone("deepak@yopmail.com", "9876500001");
        phone("student@yopmail.com", "9876500002");
        phone("faculty@yopmail.com", "9876500003");
        phone("parent@yopmail.com", "9876500004");
        phone("placement@yopmail.com", "9876500005");
        phone("accounts@yopmail.com", "9876500006");
        phone("counselor@yopmail.com", "9876500007");
        phone("recruiter@yopmail.com", "9876500008");
        phone("student@aarohan.demo", "9876500002");
        phone("faculty@aarohan.demo", "9876500003");
    }

    private void refreshDemoCatalog(UUID oid) {
        for (Course course : store.list(Course.class, oid)) {
            if (course.getName() != null) {
                course.setName(course.getName().trim());
            }
            String name = course.getName() == null ? "" : course.getName();
            String desc = course.getDescription() == null ? "" : course.getDescription().trim();
            boolean placeholder = desc.isBlank()
                    || desc.equals("dkjagskjdk")
                    || desc.toLowerCase().contains("open this course to see lessons");
            if (name.toLowerCase().contains("ipc")) {
                if (course.getFees() == null || course.getFees().compareTo(new BigDecimal("5000")) < 0) {
                    course.setFees(new BigDecimal("45000"));
                }
                if (placeholder) {
                    course.setDescription("IPC theory and consultancy practice for working professionals.");
                }
            }
            if (name.toLowerCase().contains("data analytics")) {
                if (placeholder) {
                    course.setDescription("Excel, SQL, Power BI, and Python for working with real business data — live classes, recordings, and placement support.");
                }
                if (course.getFeesAlt() == null || course.getFeesAlt().signum() <= 0) {
                    course.setValidityType("MULTIPLE");
                    course.setValidityValue(course.getDurationMonths() == null ? 4 : course.getDurationMonths());
                    course.setValidityUnit("MONTH");
                    course.setFeesAlt(new BigDecimal("42000"));
                    course.setValidityAltValue(12);
                    course.setValidityAltUnit("MONTH");
                }
            }
            if (name.toLowerCase().contains("java") && placeholder) {
                course.setDescription("Java, Spring Boot, REST APIs, and PostgreSQL — live classes, recordings, and placement support.");
            }
            if (("JFS".equals(course.getCode()) || "DA".equals(course.getCode())) && !course.isPublished()) {
                course.setPublished(true);
                course.setActive(true);
            }
            store.save(course);
        }
        for (LiveSession live : store.list(LiveSession.class, oid)) {
            String url = live.getMeetingUrl() == null ? "" : live.getMeetingUrl();
            if (url.contains("zoom.us/j/demo") || url.isBlank()) {
                live.setProvider("JITSI");
                live.setMeetingUrl("https://meet.jit.si/NiyamstackJpamapping");
                store.save(live);
            }
        }
        if (store.list(OneToOneSession.class, oid).isEmpty()) {
            OneToOneSession oneToOne = new OneToOneSession();
            oneToOne.setOrganizationId(oid);
            oneToOne.setTitle("Career counselling call");
            oneToOne.setMentorName("Faculty desk");
            oneToOne.setDurationMinutes(30);
            oneToOne.setPrice(new BigDecimal("499"));
            oneToOne.setMeetingUrl("https://meet.jit.si/NiyamstackCareerCall");
            oneToOne.setStatus("OPEN");
            store.save(oneToOne);
        }
    }

    private void remapDemoEmails(UUID oid) {
        for (AppUser user : store.listUsers(oid)) {
            String email = user.getEmail() == null ? "" : user.getEmail();
            if (email.endsWith("@aarohan.demo") || email.endsWith("@leads.demo") || email.endsWith("@demo.test")) {
                String local = email.substring(0, email.indexOf('@'));
                user.setEmail(local + "@yopmail.com");
                store.save(user);
            }
        }
        for (Student student : store.list(Student.class, oid)) {
            String email = student.getEmail() == null ? "" : student.getEmail();
            if (email.endsWith("@aarohan.demo") || email.endsWith("@leads.demo")) {
                String local = student.getStudentCode() == null ? "student" : student.getStudentCode().toLowerCase();
                student.setEmail(local + "@yopmail.com");
                store.save(student);
            }
        }
        for (Inquiry inquiry : store.list(Inquiry.class, oid)) {
            String email = inquiry.getEmail() == null ? "" : inquiry.getEmail();
            if (email.endsWith(".demo") || email.endsWith("@demo.test")) {
                String local = inquiry.getFullName() == null ? "lead" : inquiry.getFullName().toLowerCase().replace(" ", ".");
                inquiry.setEmail(local + "@yopmail.com");
                store.save(inquiry);
            }
        }
    }

    private void phone(String email, String mobile) {
        AppUser user = store.findUserByEmail(email);
        if (user == null) {
            return;
        }
        if (user.getPhone() == null || user.getPhone().isBlank()) {
            user.setPhone(mobile);
            store.save(user);
        }
    }

    private Course course(UUID oid, String code, String name, int months, BigDecimal fees) {
        Course c = new Course();
        c.setOrganizationId(oid);
        c.setCode(code);
        c.setName(name);
        c.setDescription(name + " — live classes, recordings, and placement support.");
        c.setCategory("Career");
        c.setDurationMonths(months);
        c.setFees(fees);
        c.setPublished(true);
        c.setActive(true);
        c.setEligibility("Any graduate / final year");
        c.setOutcomes("Job-ready in " + name);
        return store.save(c);
    }

    private void enroll(UUID oid, UUID studentId, UUID courseId, String source) {
        CourseEnrollment row = new CourseEnrollment();
        row.setOrganizationId(oid);
        row.setStudentId(studentId);
        row.setCourseId(courseId);
        row.setStatus("ACTIVE");
        row.setSource(source);
        row.setPurchasedAt(Instant.now());
        store.save(row);
    }

    private Batch batch(UUID oid, UUID centerId, UUID courseId, UUID yearId, UUID facultyId, String name) {
        Batch b = new Batch();
        b.setOrganizationId(oid);
        b.setCenterId(centerId);
        b.setCourseId(courseId);
        b.setAcademicYearId(yearId);
        b.setFacultyUserId(facultyId);
        b.setName(name);
        b.setCapacity(40);
        b.setStatus("ACTIVE");
        b.setStartDate(LocalDate.of(2026, 6, 15));
        return store.save(b);
    }

    private Inquiry inquiry(UUID oid, UUID centerId, UUID courseId, String name, String source, String stage) {
        Inquiry i = new Inquiry();
        i.setOrganizationId(oid);
        i.setCenterId(centerId);
        i.setCourseId(courseId);
        i.setFullName(name);
        i.setEmail(name.toLowerCase().replace(" ", ".") + "@yopmail.com");
        i.setPhone("98" + Math.abs(name.hashCode() % 100000000));
        i.setSource(source);
        i.setStage(stage);
        return store.save(i);
    }

    private Student student(UUID oid, UUID centerId, UUID courseId, UUID batchId, UUID userId, String code, String name) {
        Student s = new Student();
        s.setOrganizationId(oid);
        s.setCenterId(centerId);
        s.setCourseId(courseId);
        s.setBatchId(batchId);
        s.setUserId(userId);
        s.setStudentCode(code);
        s.setFullName(name);
        s.setEmail(code.toLowerCase() + "@yopmail.com");
        s.setStatus("ACTIVE");
        s.setEnrollmentDate(LocalDate.of(2026, 6, 20));
        return store.save(s);
    }

    private void attend(UUID oid, UUID studentId, UUID batchId, LocalDate date, String status) {
        AttendanceRecord r = new AttendanceRecord();
        r.setOrganizationId(oid);
        r.setStudentId(studentId);
        r.setBatchId(batchId);
        r.setSessionDate(date);
        r.setStatus(status);
        r.setSource("MANUAL");
        store.save(r);
    }

    private Invoice invoice(UUID oid, UUID studentId, UUID planId, String no, BigDecimal amount, String status) {
        Invoice i = new Invoice();
        i.setOrganizationId(oid);
        i.setStudentId(studentId);
        i.setFeePlanId(planId);
        i.setInvoiceNo(no);
        i.setAmount(amount);
        i.setTaxAmount(BigDecimal.ZERO);
        i.setStatus(status);
        i.setDueDate(LocalDate.now().plusDays(7));
        i.setGstRate(new BigDecimal("18"));
        i.setHsn("9992");
        i.setCgst(amount.multiply(new BigDecimal("0.09")));
        i.setSgst(amount.multiply(new BigDecimal("0.09")));
        i.setIgst(BigDecimal.ZERO);
        i.setTaxAmount(i.getCgst().add(i.getSgst()));
        i.setPaidAmount("PAID".equals(status) ? amount : BigDecimal.ZERO);
        return store.save(i);
    }

    private Company company(UUID oid, String name, String industry) {
        Company c = new Company();
        c.setOrganizationId(oid);
        c.setName(name);
        c.setIndustry(industry);
        c.setContactName("Campus HR");
        c.setContactEmail(name.toLowerCase() + ".campus@demo.test");
        c.setHiringPreferences("Java, SQL, communication");
        return store.save(c);
    }
}
