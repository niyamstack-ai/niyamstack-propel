package com.niyamstack.propel.storefront;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Assessment;
import com.niyamstack.propel.domain.Model.Assignment;
import com.niyamstack.propel.domain.Model.ContentItem;
import com.niyamstack.propel.domain.Model.ContentProgress;
import com.niyamstack.propel.domain.Model.ExamAttempt;
import com.niyamstack.propel.domain.Model.Submission;
import com.niyamstack.propel.domain.Model.Coupon;
import com.niyamstack.propel.domain.Model.Course;
import com.niyamstack.propel.domain.Model.CourseEnrollment;
import com.niyamstack.propel.domain.Model.Invoice;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.domain.Model.Payment;
import com.niyamstack.propel.domain.Model.Receipt;
import com.niyamstack.propel.domain.Model.Student;
import com.niyamstack.propel.integration.PaymentGateway;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.Roles;
import com.niyamstack.propel.security.SessionService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class StorefrontService {
    private final Store store;
    private final PaymentGateway payments;
    private final PasswordEncoder encoder;
    private final SessionService sessions;

    public StorefrontService(Store store, PaymentGateway payments, PasswordEncoder encoder, SessionService sessions) {
        this.store = store;
        this.payments = payments;
        this.encoder = encoder;
        this.sessions = sessions;
    }

    public Organization liveOrg(String slug) {
        Organization org = store.findOrgBySlug(slug);
        if (org.isWebsitePublished()) {
            return org;
        }
        boolean hasLiveCourse = store.list(Course.class, org.getId()).stream()
                .anyMatch(c -> c.isActive() && c.isPublished());
        if (hasLiveCourse) {
            return org;
        }
        throw new ApiException(HttpStatus.NOT_FOUND, "This institute website is not live yet");
    }

    public Map<String, Object> publicOrg(Organization org) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", org.getId());
        out.put("name", org.getName());
        out.put("slug", org.getSlug());
        out.put("logoUrl", org.getLogoUrl());
        out.put("brandPrimary", org.getBrandPrimary() == null ? "#0078f0" : org.getBrandPrimary());
        out.put("brandSecondary", org.getBrandSecondary() == null ? "#071a33" : org.getBrandSecondary());
        return out;
    }

    public List<Map<String, Object>> catalog(Organization org) {
        return store.list(Course.class, org.getId()).stream()
                .filter(c -> c.isActive() && c.isPublished())
                .map(this::publicCourse)
                .toList();
    }

    public Map<String, Object> course(Organization org, UUID courseId) {
        Course course = store.getOwned(Course.class, courseId, org.getId());
        if (!course.isActive() || !course.isPublished()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Course not found");
        }
        return publicCourse(course);
    }

    @Transactional
    public Map<String, Object> purchase(String slug, String fullName, String email, String phoneRaw, UUID courseId, String couponCode) {
        if (fullName == null || fullName.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        String phone = Phones.normalize(phoneRaw);
        if (!Phones.isMobile(phone)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid 10-digit Indian mobile number");
        }
        Organization org = liveOrg(slug);
        Course course = store.getOwned(Course.class, courseId, org.getId());
        if (!course.isActive() || !course.isPublished()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Course not found");
        }

        AppUser user = store.findUserByPhone(phone);
        if (user != null && !org.getId().equals(user.getOrganizationId())) {
            throw new ApiException(HttpStatus.CONFLICT, "This mobile is already used on another institute");
        }
        if (user != null && !Roles.STUDENT.equals(user.getRole())) {
            throw new ApiException(HttpStatus.CONFLICT, "This mobile belongs to a staff account. Use a student number.");
        }
        if (user == null) {
            String mail = email == null || email.isBlank() ? phone + "@student.local" : email.trim().toLowerCase();
            AppUser byEmail = store.findUserByEmail(mail);
            if (byEmail != null) {
                throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
            }
            user = new AppUser();
            user.setOrganizationId(org.getId());
            user.setFullName(fullName.trim());
            user.setEmail(mail);
            user.setPhone(phone);
            user.setPasswordHash(encoder.encode(UUID.randomUUID().toString()));
            user.setRole(Roles.STUDENT);
            user.setActive(true);
            user.setPasswordChangedAt(Instant.now());
            user = store.save(user);
        }

        Student student = store.listBy(Student.class, org.getId(), "userId", user.getId()).stream().findFirst().orElse(null);
        if (student == null) {
            student = new Student();
            student.setOrganizationId(org.getId());
            student.setUserId(user.getId());
            student.setFullName(user.getFullName());
            student.setEmail(user.getEmail());
            student.setPhone(phone);
            student.setStudentCode("STU-" + System.currentTimeMillis() % 100000);
            student.setStatus("ENROLLED");
            student.setEnrollmentDate(LocalDate.now());
            student.setCourseId(course.getId());
            student = store.save(student);
        }

        CourseEnrollment existing = store.listBy(CourseEnrollment.class, org.getId(), "studentId", student.getId()).stream()
                .filter(e -> course.getId().equals(e.getCourseId()) && !"CANCELLED".equals(e.getStatus()))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            Map<String, Object> session = new LinkedHashMap<>(sessions.issue(user));
            session.put("alreadyEnrolled", true);
            session.put("course", publicCourse(course));
            return session;
        }

        BigDecimal price = payable(course);
        Coupon applied = couponFor(org.getId(), course.getId(), couponCode);
        if (applied != null) {
            price = discounted(price, applied);
            applied.setRedeemedCount((applied.getRedeemedCount() == null ? 0 : applied.getRedeemedCount()) + 1);
            store.save(applied);
        }
        Invoice invoice = new Invoice();
        invoice.setOrganizationId(org.getId());
        invoice.setStudentId(student.getId());
        invoice.setInvoiceNo("WEB-" + System.currentTimeMillis() % 1_000_000);
        invoice.setAmount(price);
        invoice.setPaidAmount(BigDecimal.ZERO);
        invoice.setStatus(price.signum() == 0 ? "PAID" : "DUE");
        invoice.setDueDate(LocalDate.now());
        invoice = store.save(invoice);

        if (price.signum() > 0) {
            PaymentGateway.ChargeResult charge = payments.charge(org.getId(), price, "UPI", invoice.getInvoiceNo());
            if (!charge.success()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, charge.message());
            }
            Payment payment = new Payment();
            payment.setOrganizationId(org.getId());
            payment.setInvoiceId(invoice.getId());
            payment.setAmount(price);
            payment.setMethod("UPI");
            payment.setGatewayRef(charge.gatewayRef());
            payment.setReceivedAt(Instant.now());
            payment.setStatus("CAPTURED");
            payment.setReceiptNo("RCPT-" + Instant.now().toEpochMilli());
            payment = store.save(payment);
            invoice.setPaidAmount(price);
            invoice.setStatus("PAID");
            store.save(invoice);
            Receipt receipt = new Receipt();
            receipt.setOrganizationId(org.getId());
            receipt.setPaymentId(payment.getId());
            receipt.setInvoiceId(invoice.getId());
            receipt.setReceiptNo(payment.getReceiptNo());
            receipt.setAmount(price);
            receipt.setIssuedAt(Instant.now());
            store.save(receipt);
        }

        CourseEnrollment enrollment = new CourseEnrollment();
        enrollment.setOrganizationId(org.getId());
        enrollment.setStudentId(student.getId());
        enrollment.setCourseId(course.getId());
        enrollment.setInvoiceId(invoice.getId());
        enrollment.setStatus("ACTIVE");
        enrollment.setSource("WEBSITE");
        enrollment.setPurchasedAt(Instant.now());
        store.save(enrollment);

        if (student.getCourseId() == null) {
            student.setCourseId(course.getId());
            student.setStatus("ENROLLED");
            store.save(student);
        }

        Map<String, Object> session = new LinkedHashMap<>(sessions.issue(user));
        session.put("alreadyEnrolled", false);
        session.put("course", publicCourse(course));
        return session;
    }

    public List<Map<String, Object>> myCourses(UUID orgId, UUID userId) {
        Student student = store.listBy(Student.class, orgId, "userId", userId).stream().findFirst().orElse(null);
        if (student == null) {
            return List.of();
        }
        Set<UUID> submittedExams = store.listBy(ExamAttempt.class, orgId, "studentId", student.getId()).stream()
                .filter(a -> "SUBMITTED".equals(a.getStatus()))
                .map(ExamAttempt::getAssessmentId)
                .collect(Collectors.toSet());
        Set<UUID> submittedAsg = store.listBy(Submission.class, orgId, "studentId", student.getId()).stream()
                .map(Submission::getAssignmentId)
                .collect(Collectors.toSet());
        Set<UUID> viewedContent = store.listBy(ContentProgress.class, orgId, "studentId", student.getId()).stream()
                .map(ContentProgress::getContentItemId)
                .collect(Collectors.toSet());
        List<CourseEnrollment> rows = store.listBy(CourseEnrollment.class, orgId, "studentId", student.getId());
        if (rows.isEmpty() && student.getCourseId() != null) {
            Course course = store.getOwned(Course.class, student.getCourseId(), orgId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("course", publicCourse(course));
            row.put("status", "ACTIVE");
            row.put("source", "BATCH");
            row.put("progressPct", courseProgressPct(orgId, course.getId(), submittedExams, submittedAsg, viewedContent));
            return List.of(row);
        }
        return rows.stream()
                .filter(e -> !"CANCELLED".equals(e.getStatus()))
                .map(e -> {
                    Course course = store.getOwned(Course.class, e.getCourseId(), orgId);
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", e.getId());
                    row.put("status", e.getStatus());
                    row.put("source", e.getSource());
                    row.put("course", publicCourse(course));
                    row.put("progressPct", courseProgressPct(orgId, course.getId(), submittedExams, submittedAsg, viewedContent));
                    return row;
                })
                .toList();
    }

    private int courseProgressPct(UUID orgId, UUID courseId, Set<UUID> submittedExams, Set<UUID> submittedAsg, Set<UUID> viewedContent) {
        List<Assessment> exams = store.listBy(Assessment.class, orgId, "courseId", courseId).stream()
                .filter(Assessment::isPublished).toList();
        List<Assignment> homework = store.listBy(Assignment.class, orgId, "courseId", courseId).stream()
                .filter(Assignment::isPublished).toList();
        List<ContentItem> materials = store.listBy(ContentItem.class, orgId, "courseId", courseId).stream()
                .filter(c -> c.isPublished() && !"FOLDER".equalsIgnoreCase(c.getContentType()))
                .toList();
        int total = exams.size() + homework.size() + materials.size();
        if (total == 0) {
            return 0;
        }
        long done = exams.stream().filter(a -> submittedExams.contains(a.getId())).count()
                + homework.stream().filter(a -> submittedAsg.contains(a.getId())).count()
                + materials.stream().filter(c -> viewedContent.contains(c.getId())).count();
        return (int) Math.min(100, done * 100 / total);
    }

    public Map<String, Object> publicCourse(Course course) {
        BigDecimal fees = course.getFees() == null ? BigDecimal.ZERO : course.getFees();
        BigDecimal discount = course.getDiscount() == null ? BigDecimal.ZERO : course.getDiscount();
        Organization org = store.get(Organization.class, course.getOrganizationId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", course.getId());
        out.put("code", course.getCode());
        out.put("name", course.getName());
        out.put("description", course.getDescription());
        out.put("thumbnailUrl", course.getThumbnailUrl());
        out.put("category", course.getCategory());
        out.put("subCategory", course.getSubCategory());
        out.put("durationMonths", course.getDurationMonths());
        out.put("validityType", course.getValidityType());
        out.put("validityValue", course.getValidityValue());
        out.put("validityUnit", course.getValidityUnit());
        out.put("allowOffline", course.isAllowOffline());
        out.put("allowPreview", course.isAllowPreview());
        out.put("allowLive", course.isAllowLive());
        out.put("instituteName", org.getName());
        out.put("fees", fees);
        out.put("discount", discount);
        out.put("price", payable(course));
        out.put("courseType", course.getCourseType() == null ? "PAID" : course.getCourseType());
        out.put("featured", course.isFeatured());
        return out;
    }

    public List<Map<String, Object>> courseOutline(Organization org, UUID courseId) {
        course(org, courseId);
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        for (ContentItem item : store.listBy(ContentItem.class, org.getId(), "courseId", courseId)) {
            if (!item.isPublished()) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", item.getId());
            row.put("title", item.getTitle());
            row.put("type", item.getContentType());
            row.put("parentFolderId", item.getParentFolderId());
            row.put("sortOrder", item.getSortOrder() == null ? 0 : item.getSortOrder());
            rows.add(row);
        }
        for (Assessment exam : store.listBy(Assessment.class, org.getId(), "courseId", courseId)) {
            if (!exam.isPublished()) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", exam.getId());
            row.put("title", exam.getTitle());
            row.put("type", "TEST");
            row.put("parentFolderId", exam.getParentFolderId());
            row.put("sortOrder", exam.getSortOrder() == null ? 0 : exam.getSortOrder());
            rows.add(row);
        }
        rows.sort((a, b) -> Integer.compare((Integer) a.get("sortOrder"), (Integer) b.get("sortOrder")));
        return rows;
    }

    public Map<String, Object> applyCoupon(String slug, UUID courseId, String code) {
        Organization org = liveOrg(slug);
        Course course = store.getOwned(Course.class, courseId, org.getId());
        if (!course.isActive() || !course.isPublished()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Course not found");
        }
        Coupon coupon = couponFor(org.getId(), courseId, code);
        if (coupon == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This coupon is not valid for this course.");
        }
        BigDecimal original = payable(course);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("valid", true);
        out.put("code", coupon.getCode());
        out.put("originalPrice", original);
        out.put("price", discounted(original, coupon));
        return out;
    }

    public String thumbnailKey(Course course) {
        String url = course.getThumbnailUrl();
        if (url == null || url.isBlank()) {
            return null;
        }
        String marker = "/api/files/";
        int at = url.indexOf(marker);
        if (at < 0) {
            return null;
        }
        return url.substring(at + marker.length());
    }

    private Coupon couponFor(UUID orgId, UUID courseId, String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        String wanted = code.trim();
        return store.list(Coupon.class, orgId).stream()
                .filter(Coupon::isLive)
                .filter(c -> c.getCode() != null && c.getCode().equalsIgnoreCase(wanted))
                .filter(c -> c.getCourseId() == null || courseId.equals(c.getCourseId()))
                .findFirst()
                .orElse(null);
    }

    private static BigDecimal discounted(BigDecimal price, Coupon coupon) {
        if (coupon.getDiscountValue() == null) {
            return price;
        }
        BigDecimal next = price;
        if ("PERCENT".equalsIgnoreCase(coupon.getDiscountType())) {
            next = price.subtract(price.multiply(coupon.getDiscountValue()).divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP));
        } else {
            next = price.subtract(coupon.getDiscountValue());
        }
        return next.signum() < 0 ? BigDecimal.ZERO : next;
    }

    private static BigDecimal payable(Course course) {
        if ("FREE".equalsIgnoreCase(course.getCourseType())) {
            return BigDecimal.ZERO;
        }
        BigDecimal fees = course.getFees() == null ? BigDecimal.ZERO : course.getFees();
        BigDecimal discount = course.getDiscount() == null ? BigDecimal.ZERO : course.getDiscount();
        BigDecimal price = fees.subtract(discount);
        return price.signum() < 0 ? BigDecimal.ZERO : price;
    }
}
