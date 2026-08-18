package com.niyamstack.propel.storefront;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
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
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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
        if (!org.isWebsitePublished()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "This institute website is not live yet");
        }
        return org;
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
    public Map<String, Object> purchase(String slug, String fullName, String email, String phoneRaw, UUID courseId) {
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
        List<CourseEnrollment> rows = store.listBy(CourseEnrollment.class, orgId, "studentId", student.getId());
        if (rows.isEmpty() && student.getCourseId() != null) {
            Course course = store.getOwned(Course.class, student.getCourseId(), orgId);
            return List.of(Map.of("course", publicCourse(course), "status", "ACTIVE", "source", "BATCH"));
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
                    return row;
                })
                .toList();
    }

    public Map<String, Object> publicCourse(Course course) {
        BigDecimal fees = course.getFees() == null ? BigDecimal.ZERO : course.getFees();
        BigDecimal discount = course.getDiscount() == null ? BigDecimal.ZERO : course.getDiscount();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", course.getId());
        out.put("code", course.getCode());
        out.put("name", course.getName());
        out.put("description", course.getDescription());
        out.put("thumbnailUrl", course.getThumbnailUrl());
        out.put("category", course.getCategory());
        out.put("durationMonths", course.getDurationMonths());
        out.put("fees", fees);
        out.put("discount", discount);
        out.put("price", payable(course));
        out.put("courseType", course.getCourseType() == null ? "PAID" : course.getCourseType());
        out.put("featured", course.isFeatured());
        return out;
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
