package com.niyamstack.propel.sis;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Course;
import com.niyamstack.propel.domain.Model.CourseEnrollment;
import com.niyamstack.propel.domain.Model.Student;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.LicenseService;
import com.niyamstack.propel.security.PasswordPolicy;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class StudentAccountService {
    private final Store store;
    private final PasswordEncoder encoder;
    private final LicenseService licenses;

    public StudentAccountService(Store store, PasswordEncoder encoder, LicenseService licenses) {
        this.store = store;
        this.encoder = encoder;
        this.licenses = licenses;
    }

    @Transactional
    public Map<String, Object> enrollFromOwner(Student body) {
        PropelUser actor = Auth.current();
        Access.requireTenant(actor);
        Access.requireWrite(actor, "SIS");
        licenses.requireStudentCapacity();
        if (body.getFullName() == null || body.getFullName().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        String phone = requireMobile(body.getPhone());
        String email = uniqueEmail(body.getEmail(), phone);
        UUID orgId = actor.organizationId();
        AppUser existingPhone = store.findUserByPhone(phone);
        if (existingPhone != null) {
            throw new ApiException(HttpStatus.CONFLICT, "That mobile already has an account");
        }

        String temp = PasswordPolicy.temporary();
        PasswordPolicy.validate(temp);
        AppUser user = new AppUser();
        user.setOrganizationId(orgId);
        user.setCenterId(body.getCenterId());
        user.setFullName(body.getFullName().trim());
        user.setEmail(email);
        user.setPhone(phone);
        user.setRole(Roles.STUDENT);
        user.setActive(true);
        user.setPasswordHash(encoder.encode(temp));
        user.setPasswordChangedAt(Instant.now());
        user = store.save(user);

        Student student = new Student();
        student.setOrganizationId(orgId);
        student.setUserId(user.getId());
        student.setCenterId(body.getCenterId());
        student.setCourseId(body.getCourseId());
        student.setBatchId(body.getBatchId());
        student.setStudentCode(codeOrAuto(body.getStudentCode()));
        student.setFullName(user.getFullName());
        student.setEmail(email);
        student.setPhone(phone);
        student.setStatus(body.getStatus() == null || body.getStatus().isBlank() ? "ENROLLED" : body.getStatus());
        student.setEnrollmentDate(body.getEnrollmentDate() == null ? LocalDate.now() : body.getEnrollmentDate());
        student.setDateOfBirth(body.getDateOfBirth());
        student.setPermanentAddress(body.getPermanentAddress());
        student.setPhotoUrl(body.getPhotoUrl());
        student = store.save(student);
        enrollIfCourse(orgId, student, body.getCourseId(), "OWNER");
        return response(student, temp);
    }

    @Transactional
    public Map<String, Object> issueLogin(UUID studentId) {
        PropelUser actor = Auth.current();
        Access.requireTenant(actor);
        Access.requireWrite(actor, "SIS");
        Student student = store.getOwned(Student.class, studentId, actor.organizationId());
        if (student.getUserId() != null) {
            AppUser existing = store.get(AppUser.class, student.getUserId());
            if (existing != null && existing.isActive()) {
                throw new ApiException(HttpStatus.CONFLICT, "This student already has a login. They can use mobile OTP.");
            }
        }
        String phone = requireMobile(student.getPhone());
        AppUser byPhone = store.findUserByPhone(phone);
        if (byPhone != null) {
            throw new ApiException(HttpStatus.CONFLICT, "That mobile already has an account");
        }
        String email = uniqueEmail(student.getEmail(), phone);
        String temp = PasswordPolicy.temporary();
        PasswordPolicy.validate(temp);
        AppUser user = new AppUser();
        user.setOrganizationId(actor.organizationId());
        user.setCenterId(student.getCenterId());
        user.setFullName(student.getFullName());
        user.setEmail(email);
        user.setPhone(phone);
        user.setRole(Roles.STUDENT);
        user.setActive(true);
        user.setPasswordHash(encoder.encode(temp));
        user.setPasswordChangedAt(Instant.now());
        user = store.save(user);
        student.setUserId(user.getId());
        student.setEmail(email);
        student.setPhone(phone);
        student = store.save(student);
        return response(student, temp);
    }

    public void enrollIfCourse(UUID orgId, Student student, UUID courseId, String source) {
        if (courseId == null) {
            return;
        }
        Course course = store.getOwned(Course.class, courseId, orgId);
        boolean already = store.listBy(CourseEnrollment.class, orgId, "studentId", student.getId()).stream()
                .anyMatch(e -> courseId.equals(e.getCourseId()) && !"CANCELLED".equals(e.getStatus()));
        if (already) {
            return;
        }
        CourseEnrollment enrollment = new CourseEnrollment();
        enrollment.setOrganizationId(orgId);
        enrollment.setStudentId(student.getId());
        enrollment.setCourseId(course.getId());
        enrollment.setStatus("ACTIVE");
        enrollment.setSource(source);
        enrollment.setPurchasedAt(Instant.now());
        store.save(enrollment);
        if (student.getCourseId() == null) {
            student.setCourseId(course.getId());
            store.save(student);
        }
    }

    public static String requireMobile(String raw) {
        String phone = Phones.normalize(raw);
        if (!Phones.isMobile(phone)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid 10-digit Indian mobile number");
        }
        return phone;
    }

    public static String emailOrGenerated(String email, String phone) {
        if (email == null || email.isBlank()) {
            return phone + "@student.local";
        }
        return email.trim().toLowerCase();
    }

    private String uniqueEmail(String email, String phone) {
        boolean generated = email == null || email.isBlank();
        String candidate = emailOrGenerated(email, phone);
        if (store.findUserByEmail(candidate) == null) {
            return candidate;
        }
        if (!generated) {
            throw new ApiException(HttpStatus.CONFLICT, "That email already has an account");
        }
        for (int i = 1; i < 20; i++) {
            String next = phone + "." + i + "@student.local";
            if (store.findUserByEmail(next) == null) {
                return next;
            }
        }
        return phone + "." + UUID.randomUUID().toString().substring(0, 8) + "@student.local";
    }

    private static String codeOrAuto(String code) {
        if (code == null || code.isBlank()) {
            return "STU-" + (System.currentTimeMillis() % 1_000_000);
        }
        return code.trim();
    }

    private static Map<String, Object> response(Student student, String tempPassword) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", student.getId());
        out.put("studentCode", student.getStudentCode());
        out.put("fullName", student.getFullName());
        out.put("email", student.getEmail());
        out.put("phone", student.getPhone());
        out.put("status", student.getStatus());
        out.put("userId", student.getUserId());
        out.put("courseId", student.getCourseId());
        out.put("batchId", student.getBatchId());
        out.put("centerId", student.getCenterId());
        out.put("enrollmentDate", student.getEnrollmentDate());
        out.put("tempPassword", tempPassword);
        return out;
    }
}
