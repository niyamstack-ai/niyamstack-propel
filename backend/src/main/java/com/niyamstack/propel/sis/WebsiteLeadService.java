package com.niyamstack.propel.sis;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Course;
import com.niyamstack.propel.domain.Model.Student;
import com.niyamstack.propel.domain.Model.WebsiteLead;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class WebsiteLeadService {
    private final Store store;
    private final StudentAccountService students;

    public WebsiteLeadService(Store store, StudentAccountService students) {
        this.store = store;
        this.students = students;
    }

    /** Upsert an incomplete website checkout/register attempt. */
    @Transactional
    public WebsiteLead touch(UUID orgId, String fullName, String email, String phone, UUID courseId, String source, String status) {
        String mail = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        String mobile = Phones.normalize(phone);
        if (orgId == null || mail.isBlank()) {
            return null;
        }
        WebsiteLead lead = findOpen(orgId, mail, mobile);
        if (lead == null) {
            lead = new WebsiteLead();
            lead.setOrganizationId(orgId);
            lead.setEmail(mail);
        }
        if (fullName != null && !fullName.isBlank()) {
            lead.setFullName(fullName.trim());
        }
        if (!mobile.isBlank()) {
            lead.setPhone(mobile);
        }
        if (courseId != null) {
            lead.setCourseId(courseId);
        }
        if (source != null && !source.isBlank()) {
            lead.setSource(source);
        }
        if (status != null && !status.isBlank() && !"CONVERTED".equals(lead.getStatus()) && !"DISMISSED".equals(lead.getStatus())) {
            lead.setStatus(status);
        } else if (lead.getStatus() == null || lead.getStatus().isBlank()) {
            lead.setStatus("OTP_SENT");
        }
        if ("OTP_VERIFIED".equals(status)) {
            lead.setEmailVerified(true);
        }
        lead.setLastSeenAt(Instant.now());
        return store.save(lead);
    }

    @Transactional
    public void markConverted(UUID orgId, String email, String phone, UUID studentId) {
        String mail = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        String mobile = Phones.normalize(phone);
        WebsiteLead lead = findOpen(orgId, mail, mobile);
        if (lead == null && !mail.isBlank()) {
            lead = store.listBy(WebsiteLead.class, orgId, "email", mail).stream()
                    .filter(l -> !"CONVERTED".equals(l.getStatus()) && !"DISMISSED".equals(l.getStatus()))
                    .findFirst()
                    .orElse(null);
        }
        if (lead == null) {
            return;
        }
        lead.setStatus("CONVERTED");
        lead.setStudentId(studentId);
        lead.setEmailVerified(true);
        lead.setLastSeenAt(Instant.now());
        store.save(lead);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listIncomplete() {
        PropelUser actor = Auth.current();
        Access.requireTenant(actor);
        Access.requireWrite(actor, "SIS");
        UUID org = actor.organizationId();
        List<WebsiteLead> rows = store.list(WebsiteLead.class, org).stream()
                .filter(l -> !"CONVERTED".equalsIgnoreCase(nullToEmpty(l.getStatus()))
                        && !"DISMISSED".equalsIgnoreCase(nullToEmpty(l.getStatus())))
                .sorted(Comparator.comparing(WebsiteLead::getLastSeenAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        Map<UUID, String> courseNames = new LinkedHashMap<>();
        for (Course c : store.list(Course.class, org)) {
            courseNames.put(c.getId(), c.getName());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (WebsiteLead lead : rows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", lead.getId());
            row.put("fullName", lead.getFullName());
            row.put("email", lead.getEmail());
            row.put("phone", lead.getPhone());
            row.put("courseId", lead.getCourseId());
            row.put("courseName", lead.getCourseId() == null ? null : courseNames.get(lead.getCourseId()));
            row.put("source", lead.getSource());
            row.put("status", lead.getStatus());
            row.put("emailVerified", lead.isEmailVerified());
            row.put("lastSeenAt", lead.getLastSeenAt());
            row.put("createdAt", lead.getCreatedAt());
            row.put("notes", lead.getNotes());
            out.add(row);
        }
        return out;
    }

    @Transactional
    public void dismiss(UUID leadId) {
        PropelUser actor = Auth.current();
        Access.requireTenant(actor);
        Access.requireWrite(actor, "SIS");
        WebsiteLead lead = store.getOwned(WebsiteLead.class, leadId, actor.organizationId());
        lead.setStatus("DISMISSED");
        lead.setLastSeenAt(Instant.now());
        store.save(lead);
    }

    @Transactional
    public void delete(UUID leadId) {
        PropelUser actor = Auth.current();
        Access.requireTenant(actor);
        Access.requireWrite(actor, "SIS");
        store.deleteOwned(WebsiteLead.class, leadId, actor.organizationId());
    }

    @Transactional
    public WebsiteLead markVerified(UUID leadId) {
        PropelUser actor = Auth.current();
        Access.requireTenant(actor);
        Access.requireWrite(actor, "SIS");
        WebsiteLead lead = store.getOwned(WebsiteLead.class, leadId, actor.organizationId());
        lead.setEmailVerified(true);
        if (!"CONVERTED".equals(lead.getStatus()) && !"DISMISSED".equals(lead.getStatus())) {
            lead.setStatus("OTP_VERIFIED");
        }
        lead.setLastSeenAt(Instant.now());
        lead = store.save(lead);
        AppUser byPhone = lead.getPhone() == null ? null : store.findUserByPhone(lead.getPhone());
        if (byPhone != null && actor.organizationId().equals(byPhone.getOrganizationId()) && Roles.STUDENT.equals(byPhone.getRole())) {
            byPhone.setEmailVerified(true);
            store.save(byPhone);
        } else if (lead.getEmail() != null) {
            AppUser byEmail = store.findUserByEmail(lead.getEmail());
            if (byEmail != null && actor.organizationId().equals(byEmail.getOrganizationId()) && Roles.STUDENT.equals(byEmail.getRole())) {
                byEmail.setEmailVerified(true);
                store.save(byEmail);
            }
        }
        return lead;
    }

    @Transactional
    public Map<String, Object> allotCourse(UUID leadId, UUID courseId) {
        PropelUser actor = Auth.current();
        Access.requireTenant(actor);
        Access.requireWrite(actor, "SIS");
        WebsiteLead lead = store.getOwned(WebsiteLead.class, leadId, actor.organizationId());
        UUID targetCourse = courseId != null ? courseId : lead.getCourseId();
        if (targetCourse == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a course to allot.");
        }
        store.getOwned(Course.class, targetCourse, actor.organizationId());
        if (lead.getFullName() == null || lead.getFullName().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Lead needs a name before allotting a course.");
        }
        if (lead.getPhone() == null || lead.getPhone().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Lead needs a mobile number before allotting a course.");
        }

        Student body = new Student();
        body.setFullName(lead.getFullName());
        body.setEmail(lead.getEmail());
        body.setPhone(lead.getPhone());
        body.setCourseId(targetCourse);
        body.setStatus("ENROLLED");

        AppUser existingPhone = store.findUserByPhone(Phones.normalize(lead.getPhone()));
        Map<String, Object> out;
        if (existingPhone != null && actor.organizationId().equals(existingPhone.getOrganizationId()) && Roles.STUDENT.equals(existingPhone.getRole())) {
            Student student = store.listBy(Student.class, actor.organizationId(), "userId", existingPhone.getId()).stream()
                    .findFirst()
                    .orElse(null);
            if (student == null) {
                out = students.enrollFromOwner(body);
            } else {
                if (student.getTrashedAt() != null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "This mobile belongs to a trashed student. Restore them first.");
                }
                students.enrollIfCourse(actor.organizationId(), student, targetCourse, "LEAD");
                if (!existingPhone.isEmailVerified()) {
                    existingPhone.setEmailVerified(true);
                    store.save(existingPhone);
                }
                out = new LinkedHashMap<>();
                out.put("id", student.getId());
                out.put("fullName", student.getFullName());
                out.put("email", student.getEmail());
                out.put("phone", student.getPhone());
                out.put("studentCode", student.getStudentCode());
            }
        } else {
            out = students.enrollFromOwner(body);
        }

        Object studentId = out.get("id");
        lead.setStatus("CONVERTED");
        lead.setEmailVerified(true);
        lead.setCourseId(targetCourse);
        if (studentId instanceof UUID uuid) {
            lead.setStudentId(uuid);
        } else if (studentId != null) {
            try {
                lead.setStudentId(UUID.fromString(studentId.toString()));
            } catch (Exception ignored) {
                /* leave null */
            }
        }
        lead.setLastSeenAt(Instant.now());
        store.save(lead);
        out.put("leadId", lead.getId());
        out.put("leadStatus", "CONVERTED");
        return out;
    }

    private WebsiteLead findOpen(UUID orgId, String mail, String mobile) {
        List<WebsiteLead> rows = store.list(WebsiteLead.class, orgId);
        WebsiteLead byEmail = null;
        for (WebsiteLead l : rows) {
            if ("CONVERTED".equalsIgnoreCase(nullToEmpty(l.getStatus())) || "DISMISSED".equalsIgnoreCase(nullToEmpty(l.getStatus()))) {
                continue;
            }
            boolean emailMatch = mail != null && !mail.isBlank() && mail.equalsIgnoreCase(nullToEmpty(l.getEmail()));
            boolean phoneMatch = mobile != null && !mobile.isBlank() && mobile.equals(Phones.normalize(l.getPhone()));
            if (emailMatch && phoneMatch) {
                return l;
            }
            if (emailMatch && byEmail == null) {
                byEmail = l;
            }
        }
        return byEmail;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
