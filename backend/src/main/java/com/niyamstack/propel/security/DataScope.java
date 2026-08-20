package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.domain.TenantEntity;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class DataScope {
    private final Store store;

    public DataScope(Store store) {
        this.store = store;
    }

    public Student studentFor(PropelUser user) {
        if (user.organizationId() == null) {
            return null;
        }
        List<Student> rows = store.listBy(Student.class, user.organizationId(), "userId", user.userId());
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public Set<UUID> parentStudentIds(PropelUser user) {
        return store.list(Guardian.class, user.organizationId()).stream()
                .filter(g -> user.email() != null && user.email().equalsIgnoreCase(g.getEmail()))
                .map(Guardian::getStudentId)
                .collect(Collectors.toSet());
    }

    public <T extends TenantEntity> List<T> restrict(Class<T> type, List<T> rows, PropelUser user) {
        String role = user.role();
        if (Roles.OWNER.equals(role) || Roles.PLACEMENT_HEAD.equals(role)) {
            return rows;
        }
        if (Roles.STUDENT.equals(role)) {
            if (hiddenFromLearner(type)) {
                return List.of();
            }
            Student me = studentFor(user);
            if (me == null) {
                return List.of();
            }
            return rows.stream().filter(e -> visibleToStudent(type, e, me)).toList();
        }
        if (Roles.PARENT.equals(role)) {
            if (hiddenFromParent(type)) {
                return List.of();
            }
            Set<UUID> kids = parentStudentIds(user);
            return rows.stream().filter(e -> visibleToParent(type, e, kids)).toList();
        }
        if (Roles.RECRUITER.equals(role) && hiddenFromRecruiter(type)) {
            return List.of();
        }
        if (Access.centerScoped(user) && user.centerId() != null) {
            return rows.stream().filter(e -> {
                UUID center = centerOf(e);
                return center == null || user.centerId().equals(center);
            }).toList();
        }
        return rows;
    }

    private static boolean hiddenFromLearner(Class<?> type) {
        return Set.of(
                Inquiry.class, CounselingNote.class, AdmissionForm.class, Referral.class, Scholarship.class,
                EligibilityRule.class, Workflow.class, CustomField.class, DocumentTemplate.class,
                FeePlan.class, Company.class, IndustryAccount.class, IndustryEvent.class, Alumnus.class,
                AlumniJob.class, SupportTicket.class, AuditEvent.class, DriveRound.class
        ).contains(type);
    }

    private static boolean hiddenFromParent(Class<?> type) {
        return hiddenFromLearner(type) || Set.of(
                ContentItem.class, Assignment.class, Submission.class, Assessment.class, Question.class,
                ExamAttempt.class, LmsPackage.class, LmsLaunch.class, Application.class, Drive.class,
                InterviewRound.class, Offer.class, Skill.class, Resume.class, MockInterview.class
        ).contains(type);
    }

    private static boolean hiddenFromRecruiter(Class<?> type) {
        return Set.of(
                Inquiry.class, CounselingNote.class, StudentDocument.class, Guardian.class, Invoice.class,
                Payment.class, FeePlan.class, AttendanceRecord.class, ContentItem.class, Assignment.class,
                Assessment.class, DoubtTicket.class
        ).contains(type);
    }

    private boolean visibleToStudent(Class<?> type, TenantEntity e, Student me) {
        if (type == Student.class) {
            return me.getId().equals(e.getId());
        }
        if (e instanceof CourseEnrollment en) {
            return me.getId().equals(en.getStudentId());
        }
        if (e instanceof Course c) {
            return enrolledCourseIds(me).contains(c.getId());
        }
        UUID sid = studentIdOf(e);
        if (sid != null) {
            return me.getId().equals(sid);
        }
        if (e instanceof Invoice inv) {
            return me.getId().equals(inv.getStudentId());
        }
        if (e instanceof Payment pay) {
            Invoice inv = store.getOwned(Invoice.class, pay.getInvoiceId(), me.getOrganizationId());
            return me.getId().equals(inv.getStudentId());
        }
        if (e instanceof Receipt rec) {
            Invoice inv = store.getOwned(Invoice.class, rec.getInvoiceId(), me.getOrganizationId());
            return me.getId().equals(inv.getStudentId());
        }
        if (e instanceof ContentItem c) {
            if (c.getCourseId() != null && enrolledCourseIds(me).contains(c.getCourseId())) {
                return true;
            }
            return c.getBatchId() == null || c.getBatchId().equals(me.getBatchId());
        }
        if (e instanceof Assignment a) {
            if (a.getCourseId() != null && enrolledCourseIds(me).contains(a.getCourseId())) {
                return true;
            }
            return a.getBatchId() == null || a.getBatchId().equals(me.getBatchId());
        }
        if (e instanceof Assessment a) {
            if (a.getCourseId() != null && enrolledCourseIds(me).contains(a.getCourseId())) {
                return true;
            }
            return a.getBatchId() == null || a.getBatchId().equals(me.getBatchId());
        }
        if (e instanceof LiveSession s) {
            return s.getBatchId() == null || s.getBatchId().equals(me.getBatchId());
        }
        if (e instanceof Recording r) {
            return r.getBatchId() == null || r.getBatchId().equals(me.getBatchId());
        }
        if (e instanceof TimetableSlot t) {
            return t.getBatchId() == null || t.getBatchId().equals(me.getBatchId());
        }
        if (e instanceof Announcement a) {
            return a.getBatchId() == null || a.getBatchId().equals(me.getBatchId());
        }
        if (e instanceof Question q) {
            if (q.getAssessmentId() == null) {
                return false;
            }
            Assessment exam;
            try {
                exam = store.get(Assessment.class, q.getAssessmentId());
            } catch (ApiException ex) {
                return false;
            }
            if (exam.getOrganizationId() != null && !exam.getOrganizationId().equals(me.getOrganizationId())) {
                return false;
            }
            if (!exam.isPublished()) {
                return false;
            }
            if (exam.getCourseId() != null) {
                return enrolledCourseIds(me).contains(exam.getCourseId());
            }
            return exam.getBatchId() == null || exam.getBatchId().equals(me.getBatchId());
        }
        if (e instanceof Drive || e instanceof Notification || e instanceof MessageTemplate || e instanceof Classroom
                || e instanceof Batch || e instanceof AcademicYear || e instanceof Term
                || e instanceof Center) {
            return true;
        }
        return true;
    }

    private static boolean visibleToParent(Class<?> type, TenantEntity e, Set<UUID> kids) {
        if (type == Student.class) {
            return kids.contains(e.getId());
        }
        UUID sid = studentIdOf(e);
        return sid == null || kids.contains(sid);
    }

    private static UUID studentIdOf(TenantEntity e) {
        if (e instanceof Submission s) return s.getStudentId();
        if (e instanceof AttendanceRecord a) return a.getStudentId();
        if (e instanceof DoubtTicket d) return d.getStudentId();
        if (e instanceof Skill s) return s.getStudentId();
        if (e instanceof Resume r) return r.getStudentId();
        if (e instanceof MockInterview m) return m.getStudentId();
        if (e instanceof PracticeAttempt p) return p.getStudentId();
        if (e instanceof Application a) return a.getStudentId();
        if (e instanceof ExamAttempt a) return a.getStudentId();
        if (e instanceof FeeInstallment f) return f.getStudentId();
        if (e instanceof Guardian g) return g.getStudentId();
        if (e instanceof StudentDocument d) return d.getStudentId();
        if (e instanceof Certificate c) return c.getStudentId();
        if (e instanceof Internship i) return i.getStudentId();
        if (e instanceof CourseEnrollment en) return en.getStudentId();
        return null;
    }

    private Set<UUID> enrolledCourseIds(Student me) {
        Set<UUID> ids = new HashSet<>();
        if (me.getCourseId() != null) {
            ids.add(me.getCourseId());
        }
        store.listBy(CourseEnrollment.class, me.getOrganizationId(), "studentId", me.getId()).stream()
                .filter(e -> !"CANCELLED".equals(e.getStatus()))
                .map(CourseEnrollment::getCourseId)
                .filter(Objects::nonNull)
                .forEach(ids::add);
        return ids;
    }

    private static UUID centerOf(TenantEntity e) {
        if (e instanceof Student s) return s.getCenterId();
        if (e instanceof Inquiry i) return i.getCenterId();
        if (e instanceof Batch b) return b.getCenterId();
        if (e instanceof Center c) return c.getId();
        return null;
    }
}
