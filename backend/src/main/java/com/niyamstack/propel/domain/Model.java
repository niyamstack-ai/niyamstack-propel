package com.niyamstack.propel.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public final class Model {
    private Model() {}

    @Entity(name = "Organization") @Table(name = "organizations") @Getter @Setter
    public static class Organization extends BaseEntity {
        private String name;
        private String legalName;
        private String gstin;
        private String email;
        private String phone;
        private String website;
        private String packageTier;
        private String productPack;
        private String slug;
        private String accessStatus;
        private String logoUrl;
        private String brandPrimary;
        private String brandSecondary;
        private String websiteUrl;
        private String appShareUrl;
        private String customDomain;
        @JsonProperty("websitePublished")
        private boolean websitePublished;
        private String settingsJson;
        private String paymentStatus;
        private String billingCycle;
        @Column(precision = 12, scale = 2)
        private BigDecimal dealAmount;
        @Column(length = 500)
        private String modulesCsv;
        private Integer maxStudents;
        private Integer maxCenters;
        private String couponCode;
        @Column(length = 1000)
        private String dealNotes;
        private Instant paidAt;
        private Instant approvedAt;
        private UUID approvedBy;
    }

    @Entity(name = "Center") @Table(name = "centers") @Getter @Setter
    public static class Center extends TenantEntity {
        private String name;
        private String code;
        private String address;
        private String city;
        private String phone;
        private boolean active = true;
    }

    @Entity(name = "AppUser") @Table(name = "users") @Getter @Setter
    public static class AppUser extends BaseEntity {
        private UUID organizationId;
        private UUID centerId;
        private String fullName;
        private String email;
        @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
        private String passwordHash;
        private String phone;
        private String role;
        private boolean active = true;
        @jakarta.persistence.Column(nullable = false, columnDefinition = "integer default 0")
        private int failedLogins;
        private Instant lockedUntil;
        private Instant passwordChangedAt;
        @Column(length = 500)
        private String capabilitiesCsv;
        private UUID companyId;
    }

    @Entity(name = "AcademicYear") @Table(name = "academic_years") @Getter @Setter
    public static class AcademicYear extends TenantEntity {
        private String name;
        private LocalDate startDate;
        private LocalDate endDate;
        private boolean active = true;
    }

    @Entity(name = "Term") @Table(name = "terms") @Getter @Setter
    public static class Term extends TenantEntity {
        private UUID academicYearId;
        private String name;
        private LocalDate startDate;
        private LocalDate endDate;
    }

    @Entity(name = "Course") @Table(name = "courses") @Getter @Setter
    public static class Course extends TenantEntity {
        private String code;
        private String name;
        @Column(columnDefinition = "TEXT")
        private String description;
        @Column(length = 1000)
        private String thumbnailUrl;
        private String category;
        private String subCategory;
        private String courseType = "PAID";
        private String validityType = "SINGLE";
        private Integer validityValue;
        private String validityUnit = "MONTH";
        @Column(precision = 12, scale = 2)
        private BigDecimal discount = BigDecimal.ZERO;
        private boolean published = false;
        private boolean featured = false;
        private boolean allowOffline;
        private boolean allowTrial;
        private boolean allowPreview;
        private boolean allowLive = true;
        private Integer likesCount = 0;
        private Integer durationMonths;
        private BigDecimal fees;
        private String eligibility;
        private String outcomes;
        @Column(length = 1000)
        private String bundleCsv;
        @Column(precision = 12, scale = 2)
        private BigDecimal feesAlt;
        private Integer validityAltValue;
        private String validityAltUnit = "MONTH";
        private UUID termId;
        private String shareSlug;
        private boolean active = true;
    }

    @Entity(name = "Batch") @Table(name = "batches") @Getter @Setter
    public static class Batch extends TenantEntity {
        private UUID centerId;
        private UUID courseId;
        private UUID academicYearId;
        private UUID termId;
        private String name;
        private Integer capacity;
        private UUID facultyUserId;
        private String status;
        private LocalDate startDate;
        private LocalDate endDate;
    }

    @Entity(name = "Classroom") @Table(name = "classrooms") @Getter @Setter
    public static class Classroom extends TenantEntity {
        private UUID centerId;
        private String name;
        private String type;
        private Integer capacity;
    }

    @Entity(name = "CustomField") @Table(name = "custom_fields") @Getter @Setter
    public static class CustomField extends TenantEntity {
        private String entityType;
        private String fieldKey;
        private String label;
        private String fieldType;
        private boolean required;
        @Column(length = 1000)
        private String optionsJson;
    }

    @Entity(name = "Workflow") @Table(name = "workflows") @Getter @Setter
    public static class Workflow extends TenantEntity {
        private String name;
        private String triggerType;
        private String stepsJson;
        private boolean active = true;
    }

    @Entity(name = "DocumentTemplate") @Table(name = "document_templates") @Getter @Setter
    public static class DocumentTemplate extends TenantEntity {
        private String name;
        private String kind;
        private String body;
    }

    @Entity(name = "ApprovalRequest") @Table(name = "approval_requests") @Getter @Setter
    public static class ApprovalRequest extends TenantEntity {
        private String kind;
        private String status = "PENDING";
        private UUID studentId;
        private UUID inquiryId;
        private UUID offerId;
        @Column(precision = 12, scale = 2)
        private BigDecimal amount;
        @Column(length = 1000)
        private String note;
        private UUID requestedBy;
        private UUID decidedBy;
        private Instant decidedAt;
        @Column(length = 2000)
        private String payloadJson;
    }

    @Entity(name = "Inquiry") @Table(name = "inquiries") @Getter @Setter
    public static class Inquiry extends TenantEntity {
        private UUID centerId;
        private UUID courseId;
        private String fullName;
        private String email;
        private String phone;
        private String source;
        private String stage;
        private UUID counselorUserId;
        private String notes;
        private UUID studentId;
        private UUID landingPageId;
        private String referralCode;
        @Column(columnDefinition = "TEXT")
        private String customJson;
    }

    @Entity(name = "CounselingNote") @Table(name = "counseling_notes") @Getter @Setter
    public static class CounselingNote extends TenantEntity {
        private UUID inquiryId;
        private UUID authorUserId;
        private String stage;
        private String note;
        private String nextAction;
        private Instant nextActionAt;
    }

    @Entity(name = "AdmissionForm") @Table(name = "admission_forms") @Getter @Setter
    public static class AdmissionForm extends TenantEntity {
        private UUID courseId;
        private String applicantName;
        private String email;
        private String phone;
        private String documentsJson;
        private String status;
    }

    @Entity(name = "EligibilityRule") @Table(name = "eligibility_rules") @Getter @Setter
    public static class EligibilityRule extends TenantEntity {
        private String name;
        private String appliesTo;
        private String rulesJson;
    }

    @Entity(name = "Referral") @Table(name = "referrals") @Getter @Setter
    public static class Referral extends TenantEntity {
        private String referrerName;
        private String referrerType;
        private String code;
        private UUID studentId;
        private UUID inquiryId;
        private BigDecimal incentiveAmount;
        private String status;
    }

    @Entity(name = "Scholarship") @Table(name = "scholarships") @Getter @Setter
    public static class Scholarship extends TenantEntity {
        private String name;
        private BigDecimal percent;
        private BigDecimal amount;
        private String approvalStatus;
        private UUID studentId;
        private UUID invoiceId;
        private UUID approvalRequestId;
    }

    @Entity(name = "Student") @Table(name = "students") @Getter @Setter
    public static class Student extends TenantEntity {
        private UUID centerId;
        private UUID courseId;
        private UUID batchId;
        private UUID userId;
        private String studentCode;
        private String fullName;
        private String email;
        private String phone;
        private String status;
        private LocalDate enrollmentDate;
        @Column(columnDefinition = "TEXT")
        private String about;
        private String rollNumber;
        private LocalDate dateOfJoining;
        private LocalDate dateOfBirth;
        private String instituteName;
        private String permanentAddress;
        private String photoUrl;
        @Column(columnDefinition = "TEXT")
        private String customJson;
    }

    @Entity(name = "CourseEnrollment") @Table(name = "course_enrollments") @Getter @Setter
    public static class CourseEnrollment extends TenantEntity {
        private UUID studentId;
        private UUID courseId;
        private UUID invoiceId;
        private String status = "ACTIVE";
        private String source = "WEBSITE";
        private Instant purchasedAt;
    }

    @Entity(name = "StudentDocument") @Table(name = "student_documents") @Getter @Setter
    public static class StudentDocument extends TenantEntity {
        private UUID studentId;
        private String docType;
        private String fileName;
        private String storageUrl;
    }

    @Entity(name = "Guardian") @Table(name = "guardians") @Getter @Setter
    public static class Guardian extends TenantEntity {
        private UUID studentId;
        private UUID userId;
        private String fullName;
        private String relation;
        private String phone;
        private String email;
    }

    @Entity(name = "TimetableSlot") @Table(name = "timetable_slots") @Getter @Setter
    public static class TimetableSlot extends TenantEntity {
        private UUID batchId;
        private UUID classroomId;
        private UUID facultyUserId;
        private String subject;
        private Integer dayOfWeek;
        private LocalTime startTime;
        private LocalTime endTime;
    }

    @Entity(name = "AttendanceRecord") @Table(name = "attendance_records") @Getter @Setter
    public static class AttendanceRecord extends TenantEntity {
        private UUID studentId;
        private UUID batchId;
        private LocalDate sessionDate;
        private String status;
        private String source;
        private UUID liveSessionId;
    }

    @Entity(name = "ContentItem") @Table(name = "content_items") @Getter @Setter
    public static class ContentItem extends TenantEntity {
        private UUID batchId;
        private UUID courseId;
        private String title;
        private String contentType;
        private String url;
        @Column(length = 8000)
        private String body;
        private String scormStandard;
        private String storageKey;
        private String visibility = "BATCH";
        private boolean published = true;
        private UUID parentFolderId;
        private Integer sortOrder = 0;
    }

    @Entity(name = "ContentProgress") @Table(name = "content_progress") @Getter @Setter
    public static class ContentProgress extends TenantEntity {
        private UUID studentId;
        private UUID contentItemId;
        private Instant viewedAt;
    }

    @Entity(name = "LiveSession") @Table(name = "live_sessions") @Getter @Setter
    public static class LiveSession extends TenantEntity {
        private UUID batchId;
        private String title;
        private String provider;
        private String meetingUrl;
        private Instant startsAt;
        private Instant endsAt;
        private String recordingUrl;
        private String status = "SCHEDULED";
    }

    @Entity(name = "Recording") @Table(name = "recordings") @Getter @Setter
    public static class Recording extends TenantEntity {
        private UUID batchId;
        private UUID liveSessionId;
        private String title;
        private String videoUrl;
    }

    @Entity(name = "Assignment") @Table(name = "assignments") @Getter @Setter
    public static class Assignment extends TenantEntity {
        private UUID batchId;
        private UUID courseId;
        private String title;
        private String instructions;
        private Instant dueAt;
        private BigDecimal maxScore;
        private boolean published = true;
    }

    @Entity(name = "Submission") @Table(name = "submissions") @Getter @Setter
    public static class Submission extends TenantEntity {
        private UUID assignmentId;
        private UUID studentId;
        private String content;
        private String grade;
        private String feedback;
        private Instant submittedAt;
        private String fileUrl;
        private String status = "SUBMITTED";
    }

    @Entity(name = "Assessment") @Table(name = "assessments") @Getter @Setter
    public static class Assessment extends TenantEntity {
        private UUID batchId;
        private UUID courseId;
        private String title;
        private String kind;
        private Instant scheduledAt;
        private Integer durationMinutes;
        private boolean published;
        private boolean proctoring;
        private boolean scoresPublished = true;
        private Integer passingScore;
        private Integer totalMarks;
        private UUID parentFolderId;
        private Integer maxAttempts;
        private Integer sortOrder = 0;
    }

    @Entity(name = "Question") @Table(name = "questions") @Getter @Setter
    public static class Question extends TenantEntity {
        private UUID assessmentId;
        private String subject;
        private String topic;
        private String difficulty;
        private String prompt;
        @Column(columnDefinition = "TEXT")
        private String optionsJson;
        @Column(columnDefinition = "TEXT")
        private String answerKey;
        @Column(columnDefinition = "TEXT")
        private String explanation;
        private String questionType = "MCQ";
        private String language;
        @Column(columnDefinition = "TEXT")
        private String starterCode;
        @Column(columnDefinition = "TEXT")
        private String testsJson;
    }

    @Entity(name = "DoubtTicket") @Table(name = "doubt_tickets") @Getter @Setter
    public static class DoubtTicket extends TenantEntity {
        private UUID studentId;
        private UUID batchId;
        private UUID courseId;
        private String subject;
        private String body;
        private String status;
        private String facultyReply;
        private Integer slaHours = 24;
        private Instant firstResponseAt;
    }

    @Entity(name = "Certificate") @Table(name = "certificates") @Getter @Setter
    public static class Certificate extends TenantEntity {
        private UUID studentId;
        private UUID courseId;
        private String title;
        private String certificateNo;
        private LocalDate issuedOn;
    }

    @Entity(name = "FeePlan") @Table(name = "fee_plans") @Getter @Setter
    public static class FeePlan extends TenantEntity {
        private UUID courseId;
        private UUID batchId;
        private String name;
        private BigDecimal totalAmount;
        private String componentsJson;
        private BigDecimal gstRate;
        private Integer installmentCount;
        private String hsn;
        @Column(length = 20)
        private String sacCode;
        private UUID termId;
    }

    @Entity(name = "Invoice") @Table(name = "invoices") @Getter @Setter
    public static class Invoice extends TenantEntity {
        private UUID studentId;
        private UUID feePlanId;
        private String invoiceNo;
        private BigDecimal amount;
        private BigDecimal taxAmount;
        private String status;
        private LocalDate dueDate;
        private BigDecimal gstRate;
        private String hsn;
        private BigDecimal cgst = BigDecimal.ZERO;
        private BigDecimal sgst = BigDecimal.ZERO;
        private BigDecimal igst = BigDecimal.ZERO;
        private BigDecimal paidAmount = BigDecimal.ZERO;
        private UUID installmentId;
        private UUID courseId;
        private String buyerName;
        private String buyerGstin;
        private String placeOfSupply;
        @Column(length = 20)
        private String sacCode;
        private String seriesPrefix;
        private Instant lastRemindedAt;
    }

    @Entity(name = "Payment") @Table(name = "payments") @Getter @Setter
    public static class Payment extends TenantEntity {
        private UUID invoiceId;
        private BigDecimal amount;
        private String method;
        private String gatewayRef;
        private Instant receivedAt;
        private String status = "CAPTURED";
        private String receiptNo;
    }

    @Entity(name = "Refund") @Table(name = "refunds") @Getter @Setter
    public static class Refund extends TenantEntity {
        private UUID paymentId;
        private BigDecimal amount;
        private String reason;
        private String status;
        private UUID requestedBy;
        private UUID approvedBy;
        private Instant approvedAt;
        private String creditNoteNo;
        private String gatewayRefundRef;
    }

    @Entity(name = "Notification") @Table(name = "notifications") @Getter @Setter
    public static class Notification extends TenantEntity {
        private UUID studentId;
        private String channel;
        private String audience;
        private String title;
        private String body;
        private String status;
        @Column(length = 1000)
        private String detail;
    }

    @Entity(name = "Announcement") @Table(name = "announcements") @Getter @Setter
    public static class Announcement extends TenantEntity {
        private UUID batchId;
        private String title;
        private String body;
    }

    @Entity(name = "MessageTemplate") @Table(name = "message_templates") @Getter @Setter
    public static class MessageTemplate extends TenantEntity {
        private String eventType;
        private String channel;
        private String body;
    }

    @Entity(name = "InboxMessage") @Table(name = "inbox_messages") @Getter @Setter
    public static class InboxMessage extends TenantEntity {
        private String fromName;
        private String subject;
        private String body;
        private String status;
    }

    @Entity(name = "Skill") @Table(name = "skills") @Getter @Setter
    public static class Skill extends TenantEntity {
        private UUID studentId;
        private String name;
        private String proficiency;
        private String evidence;
    }

    @Entity(name = "Resume") @Table(name = "resumes") @Getter @Setter
    public static class Resume extends TenantEntity {
        private UUID studentId;
        private String versionLabel;
        private String content;
        private Integer completeness;
    }

    @Entity(name = "MockInterview") @Table(name = "mock_interviews") @Getter @Setter
    public static class MockInterview extends TenantEntity {
        private UUID studentId;
        private String kind;
        private Instant scheduledAt;
        private Integer score;
        private String feedback;
    }

    @Entity(name = "PracticeAttempt") @Table(name = "practice_attempts") @Getter @Setter
    public static class PracticeAttempt extends TenantEntity {
        private UUID studentId;
        private String kind;
        private Integer score;
    }

    @Entity(name = "Company") @Table(name = "companies") @Getter @Setter
    public static class Company extends TenantEntity {
        private String name;
        private String industry;
        private String contactName;
        private String contactEmail;
        private String hiringPreferences;
    }

    @Entity(name = "Drive") @Table(name = "drives") @Getter @Setter
    public static class Drive extends TenantEntity {
        private UUID companyId;
        private String title;
        private String jobDescription;
        private BigDecimal packageLpa;
        private String locations;
        private LocalDate deadline;
        private String status;
        private UUID eligibilityRuleId;
        private Integer minAttendancePct;
        private Integer minMarks;
    }

    @Entity(name = "Application") @Table(name = "applications") @Getter @Setter
    public static class Application extends TenantEntity {
        private UUID driveId;
        private UUID studentId;
        private String status;
        private Boolean eligibilityPassed;
        private String currentRound;
    }

    @Entity(name = "InterviewRound") @Table(name = "interview_rounds") @Getter @Setter
    public static class InterviewRound extends TenantEntity {
        private UUID applicationId;
        private String roundName;
        private String panel;
        private String outcome;
        private String feedback;
        private Instant scheduledAt;
    }

    @Entity(name = "Offer") @Table(name = "offers") @Getter @Setter
    public static class Offer extends TenantEntity {
        private UUID applicationId;
        private BigDecimal packageLpa;
        private LocalDate joiningDate;
        private String status;
        private String notes;
    }

    @Entity(name = "Internship") @Table(name = "internships") @Getter @Setter
    public static class Internship extends TenantEntity {
        private UUID studentId;
        private UUID companyId;
        private String role;
        private BigDecimal stipend;
        private LocalDate startDate;
        private LocalDate endDate;
        private String status;
    }

    @Entity(name = "Alumnus") @Table(name = "alumni") @Getter @Setter
    public static class Alumnus extends TenantEntity {
        private UUID studentId;
        private String fullName;
        private String company;
        private String role;
        private String engagement;
    }

    @Entity(name = "AlumniJob") @Table(name = "alumni_jobs") @Getter @Setter
    public static class AlumniJob extends TenantEntity {
        private UUID alumniId;
        private String title;
        private String company;
        private String status;
    }

    @Entity(name = "IndustryAccount") @Table(name = "industry_accounts") @Getter @Setter
    public static class IndustryAccount extends TenantEntity {
        private String name;
        private boolean mou;
        private String ownerName;
        private String hiringCycle;
    }

    @Entity(name = "IndustryEvent") @Table(name = "industry_events") @Getter @Setter
    public static class IndustryEvent extends TenantEntity {
        private String title;
        private LocalDate eventDate;
        private Integer attendanceCount;
        private String feedback;
    }

    @Entity(name = "SupportTicket") @Table(name = "support_tickets") @Getter @Setter
    public static class SupportTicket extends TenantEntity {
        private String raisedBy;
        private String category;
        private String subject;
        private String body;
        private String status;
    }

    @Entity(name = "FeeInstallment") @Table(name = "fee_installments") @Getter @Setter
    public static class FeeInstallment extends TenantEntity {
        private UUID feePlanId;
        private UUID studentId;
        private Integer seqNo;
        private LocalDate dueDate;
        private BigDecimal amount;
        private String status = "DUE";
        private UUID invoiceId;
    }

    @Entity(name = "Receipt") @Table(name = "receipts") @Getter @Setter
    public static class Receipt extends TenantEntity {
        private UUID paymentId;
        private UUID invoiceId;
        private String receiptNo;
        private BigDecimal amount;
        private String gstin;
        private Instant issuedAt;
    }

    @Entity(name = "ExamAttempt") @Table(name = "exam_attempts") @Getter @Setter
    public static class ExamAttempt extends TenantEntity {
        private UUID assessmentId;
        private UUID studentId;
        private Instant startedAt;
        private Instant submittedAt;
        @Column(columnDefinition = "TEXT")
        private String answersJson;
        private Integer score;
        private Integer maxScore;
        private String status = "IN_PROGRESS";
    }

    @Entity(name = "LmsPackage") @Table(name = "lms_packages") @Getter @Setter
    public static class LmsPackage extends TenantEntity {
        private UUID contentItemId;
        private String standard;
        private String packageKey;
        private String launchUrl;
        private String versionLabel;
        private String status = "READY";
    }

    @Entity(name = "LmsLaunch") @Table(name = "lms_launches") @Getter @Setter
    public static class LmsLaunch extends TenantEntity {
        private UUID packageId;
        private UUID studentId;
        private Instant launchedAt;
        private Integer progressPct;
        private String completion;
        private Integer score;
    }

    @Entity(name = "DriveRound") @Table(name = "drive_rounds") @Getter @Setter
    public static class DriveRound extends TenantEntity {
        private UUID driveId;
        private Integer seqNo;
        private String roundName;
        private String roundType;
    }

    @Entity(name = "AuditEvent") @Table(name = "audit_events") @Getter @Setter
    public static class AuditEvent extends TenantEntity {
        private UUID actorUserId;
        private String action;
        private String entityType;
        private UUID entityId;
        private String detail;
    }

    @Entity(name = "PlatformSetting") @Table(name = "platform_settings") @Getter @Setter
    public static class PlatformSetting extends BaseEntity {
        private String settingKey;
        @Column(length = 4000)
        private String settingValue;
    }

    @Entity(name = "PlatformRole") @Table(name = "platform_roles") @Getter @Setter
    public static class PlatformRole extends BaseEntity {
        private String name;
        @Column(length = 1000)
        private String capabilitiesCsv;
    }

    @Entity(name = "WebsitePage") @Table(name = "website_pages") @Getter @Setter
    public static class WebsitePage extends TenantEntity {
        private String title;
        private String slug;
        private String pageType = "CUSTOM";
        @Column(columnDefinition = "TEXT")
        private String body;
        private String metaTitle;
        private String metaDescription;
        private String previewImageUrl;
        private boolean hidden;
        private Integer sortOrder = 0;
    }

    @Entity(name = "Coupon") @Table(name = "coupons") @Getter @Setter
    public static class Coupon extends TenantEntity {
        private String code;
        private String name;
        private String discountType = "PERCENT";
        @Column(precision = 12, scale = 2)
        private BigDecimal discountValue;
        private UUID courseId;
        private Integer maxRedemptions;
        private Integer redeemedCount = 0;
        private Instant startsAt;
        private Instant endsAt;
        private boolean live = true;
    }

    @Entity(name = "LandingPage") @Table(name = "landing_pages") @Getter @Setter
    public static class LandingPage extends TenantEntity {
        private String name;
        private String pageKind;
        private String slug;
        private String headline;
        @Column(columnDefinition = "TEXT")
        private String body;
        private String ctaLabel;
        private UUID courseId;
        @Column(columnDefinition = "TEXT")
        private String formJson;
        private boolean published;
        private Integer viewsCount = 0;
        private Integer leadsCount = 0;
    }

    @Entity(name = "Campaign") @Table(name = "campaigns") @Getter @Setter
    public static class Campaign extends TenantEntity {
        private String name;
        private String campaignType;
        private String triggerEvent;
        private String channel = "PUSH";
        private String audience = "ALL_USERS";
        private String title;
        @Column(columnDefinition = "TEXT")
        private String body;
        private String status = "DRAFT";
        private Instant scheduledAt;
        private Integer sentCount = 0;
        private String lastSendStatus;
        @Column(length = 1000)
        private String lastSendDetail;
    }

    @Entity(name = "AppBanner") @Table(name = "app_banners") @Getter @Setter
    public static class AppBanner extends TenantEntity {
        private String title;
        private String imageUrl;
        private String linkUrl;
        private boolean live;
        private Integer sortOrder = 0;
    }

    @Entity(name = "AppPush") @Table(name = "app_pushes") @Getter @Setter
    public static class AppPush extends TenantEntity {
        private String title;
        @Column(columnDefinition = "TEXT")
        private String body;
        private String audience = "ALL_USERS";
        private String status = "DRAFT";
        private Instant scheduledAt;
        private Instant sentAt;
    }

    @Entity(name = "FreeMaterial") @Table(name = "free_materials") @Getter @Setter
    public static class FreeMaterial extends TenantEntity {
        private String title;
        private String materialType;
        private String url;
        private String fileName;
        private boolean published = true;
    }

    @Entity(name = "ChatThread") @Table(name = "chat_threads") @Getter @Setter
    public static class ChatThread extends TenantEntity {
        private UUID studentId;
        private String studentName;
        private String subject;
        private String status = "OPEN";
        private Instant lastMessageAt;
    }

    @Entity(name = "ChatMessage") @Table(name = "chat_messages") @Getter @Setter
    public static class ChatMessage extends TenantEntity {
        private UUID threadId;
        private String senderRole;
        private String senderName;
        @Column(columnDefinition = "TEXT")
        private String body;
    }

    @Entity(name = "OneToOneSession") @Table(name = "one_to_one_sessions") @Getter @Setter
    public static class OneToOneSession extends TenantEntity {
        private String title;
        private String mentorName;
        private Integer durationMinutes = 30;
        @Column(precision = 12, scale = 2)
        private BigDecimal price = BigDecimal.ZERO;
        private String meetingUrl;
        private String status = "OPEN";
        private UUID offeringId;
        private UUID studentId;
        private Instant startsAt;
        private UUID invoiceId;
    }

    @Entity(name = "BackendAddition") @Table(name = "backend_additions") @Getter @Setter
    public static class BackendAddition extends TenantEntity {
        private UUID courseId;
        private UUID studentId;
        private String studentName;
        private String studentPhone;
        private String studentEmail;
        private String note;
        private String status = "ADDED";
    }

    @Entity(name = "IntegrationConnection") @Table(name = "integration_connections") @Getter @Setter
    public static class IntegrationConnection extends TenantEntity {
        private String provider;
        private String status = "NOT_CONNECTED";
        @Column(columnDefinition = "TEXT")
        private String configJson;
    }

    @Entity(name = "SiteHit") @Table(name = "site_hits") @Getter @Setter
    public static class SiteHit extends TenantEntity {
        private String kind = "SESSION";
        private String path;
    }

    @Entity(name = "Employee") @Table(name = "employees") @Getter @Setter
    public static class Employee extends TenantEntity {
        private String employeeCode;
        private String fullName;
        private String email;
        private String phone;
        private String department;
        private String designation;
        private LocalDate joiningDate;
        private UUID centerId;
        private UUID managerId;
        private UUID userId;
        private String status = "ACTIVE";
        private String employmentType = "SUPPORT";
        @Column(columnDefinition = "TEXT")
        private String customJson;
    }

    @Entity(name = "StaffAttendance") @Table(name = "staff_attendance") @Getter @Setter
    public static class StaffAttendance extends TenantEntity {
        private UUID employeeId;
        private LocalDate workDate;
        private String shift = "FULL";
        private String status = "PRESENT";
        private String source = "MANUAL";
        private LocalTime inTime;
        private LocalTime outTime;
    }

    @Entity(name = "BiometricPunch") @Table(name = "biometric_punches") @Getter @Setter
    public static class BiometricPunch extends TenantEntity {
        private UUID employeeId;
        private UUID studentId;
        private String deviceId;
        private Instant punchAt;
        private String punchType = "IN";
        private String rawRef;
    }

    @Entity(name = "LeaveBalance") @Table(name = "leave_balances") @Getter @Setter
    public static class LeaveBalance extends TenantEntity {
        private UUID employeeId;
        private Integer leaveYear;
        @Column(precision = 8, scale = 1)
        private BigDecimal cl = BigDecimal.ZERO;
        @Column(precision = 8, scale = 1)
        private BigDecimal sl = BigDecimal.ZERO;
        @Column(precision = 8, scale = 1)
        private BigDecimal el = BigDecimal.ZERO;
    }

    @Entity(name = "LeaveRequest") @Table(name = "leave_requests") @Getter @Setter
    public static class LeaveRequest extends TenantEntity {
        private UUID employeeId;
        private String leaveType;
        private LocalDate fromDate;
        private LocalDate toDate;
        @Column(precision = 8, scale = 1)
        private BigDecimal days;
        @Column(length = 1000)
        private String reason;
        private String status = "PENDING";
        private UUID decidedBy;
        private Instant decidedAt;
    }

    @Entity(name = "SalaryStructure") @Table(name = "salary_structures") @Getter @Setter
    public static class SalaryStructure extends TenantEntity {
        private UUID employeeId;
        @Column(precision = 12, scale = 2)
        private BigDecimal basic = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal hra = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal special = BigDecimal.ZERO;
        private LocalDate effectiveFrom;
    }

    @Entity(name = "Payslip") @Table(name = "payslips") @Getter @Setter
    public static class Payslip extends TenantEntity {
        private UUID employeeId;
        private Integer payYear;
        private Integer payMonth;
        @Column(precision = 12, scale = 2)
        private BigDecimal basic = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal hra = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal special = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal gross = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal pfEmployee = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal esiEmployee = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal pfEmployer = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal esiEmployer = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal deductions = BigDecimal.ZERO;
        @Column(precision = 12, scale = 2)
        private BigDecimal net = BigDecimal.ZERO;
        private String status = "DRAFT";
        private Instant paidAt;
    }

    @Entity(name = "StaffVacancy") @Table(name = "staff_vacancies") @Getter @Setter
    public static class StaffVacancy extends TenantEntity {
        private String title;
        private String department;
        private Integer openings = 1;
        private String status = "OPEN";
        @Column(length = 2000)
        private String description;
    }

    @Entity(name = "StaffCandidate") @Table(name = "staff_candidates") @Getter @Setter
    public static class StaffCandidate extends TenantEntity {
        private UUID vacancyId;
        private String fullName;
        private String email;
        private String phone;
        private String status = "APPLIED";
        private Instant interviewAt;
        @Column(length = 1000)
        private String interviewNotes;
        @Column(precision = 12, scale = 2)
        private BigDecimal offerCtc;
        private LocalDate offerJoiningDate;
        private UUID hiredEmployeeId;
    }

    @Entity(name = "InstituteHoliday") @Table(name = "institute_holidays") @Getter @Setter
    public static class InstituteHoliday extends TenantEntity {
        private String name;
        private LocalDate holidayDate;
        private UUID centerId;
    }

    @Entity(name = "InstituteRole") @Table(name = "institute_roles") @Getter @Setter
    public static class InstituteRole extends TenantEntity {
        private String name;
        private String baseRole = "FACULTY";
        @Column(length = 1000)
        private String capabilitiesCsv;
    }

    @Entity(name = "PlatformUserRole") @Table(name = "platform_user_roles") @Getter @Setter
    public static class PlatformUserRole extends BaseEntity {
        private UUID userId;
        private UUID roleId;
    }

    @Entity(name = "ReportDefinition") @Table(name = "report_definitions") @Getter @Setter
    public static class ReportDefinition extends TenantEntity {
        private String name;
        private String dataset;
        @Column(length = 2000)
        private String columnsCsv;
        @Column(columnDefinition = "TEXT")
        private String filtersJson;
        private UUID createdBy;
    }

    @Entity(name = "ScheduledReport") @Table(name = "scheduled_reports") @Getter @Setter
    public static class ScheduledReport extends TenantEntity {
        private UUID reportId;
        private String cadence;
        private String emailTo;
        private Instant lastRunAt;
        private Instant nextRunAt;
        private boolean enabled = true;
        private String lastStatus;
    }

    @Entity(name = "XapiStatement") @Table(name = "xapi_statements") @Getter @Setter
    public static class XapiStatement extends TenantEntity {
        private UUID studentId;
        private UUID courseId;
        private String verb;
        private String objectId;
        @Column(columnDefinition = "TEXT")
        private String resultJson;
        private Instant statementAt;
    }

    @Entity(name = "AccreditationFolder") @Table(name = "accreditation_folders") @Getter @Setter
    public static class AccreditationFolder extends TenantEntity {
        private String framework;
        private String title;
        private String status = "OPEN";
    }

    @Entity(name = "AccreditationEvidence") @Table(name = "accreditation_evidence") @Getter @Setter
    public static class AccreditationEvidence extends TenantEntity {
        private UUID folderId;
        private String title;
        private String fileUrl;
        @Column(length = 2000)
        private String note;
        private String status = "DRAFT";
        private UUID approvalRequestId;
    }
}
