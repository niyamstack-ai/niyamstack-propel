package com.niyamstack.propel.lms;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.integration.MeetingGateway;
import com.niyamstack.propel.integration.ObjectStorage;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class LmsService {
    private final Store store;
    private final ObjectStorage storage;
    private final MeetingGateway meetings;
    private final AuditService audit;

    public LmsService(Store store, ObjectStorage storage, MeetingGateway meetings, AuditService audit) {
        this.store = store;
        this.storage = storage;
        this.meetings = meetings;
        this.audit = audit;
    }

    @Transactional
    public ContentItem upload(MultipartFile file, UUID batchId, UUID courseId, String title, String contentType, UUID parentFolderId) {
        PropelUser user = Auth.current();
        Access.requireWrite(user, "LMS");
        if (Roles.STUDENT.equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Students cannot publish content");
        }
        try {
            var stored = storage.put(user.organizationId(), file.getOriginalFilename(), file.getContentType(),
                    file.getInputStream(), file.getSize());
            ContentItem item = new ContentItem();
            item.setOrganizationId(user.organizationId());
            item.setBatchId(batchId);
            item.setCourseId(courseId);
            item.setParentFolderId(parentFolderId);
            item.setTitle(title == null || title.isBlank() ? file.getOriginalFilename() : title);
            item.setContentType(contentType == null ? "FILE" : contentType);
            item.setStorageKey(stored.key());
            item.setUrl(stored.url());
            item.setPublished(true);
            item.setVisibility(courseId != null ? "COURSE" : "BATCH");
            item = store.save(item);
            audit.log("CONTENT_UPLOAD", "ContentItem", item.getId(), stored.key());
            return item;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Upload failed");
        }
    }

    @Transactional
    public void deleteContent(UUID id) {
        PropelUser user = Auth.current();
        Access.requireWrite(user, "LMS");
        if (Roles.STUDENT.equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Students cannot delete content");
        }
        ContentItem item = store.getOwned(ContentItem.class, id, user.organizationId());
        if ("FOLDER".equalsIgnoreCase(item.getContentType())) {
            for (ContentItem child : store.listBy(ContentItem.class, user.organizationId(), "parentFolderId", id)) {
                deleteContent(child.getId());
            }
            for (Assessment exam : store.listBy(Assessment.class, user.organizationId(), "parentFolderId", id)) {
                deleteAssessment(exam.getId());
            }
        }
        store.deleteOwned(ContentItem.class, id, user.organizationId());
        audit.log("CONTENT_DELETE", "ContentItem", id, item.getTitle());
    }

    @Transactional
    public void deleteAssessment(UUID id) {
        PropelUser user = Auth.current();
        Access.requireWrite(user, "LMS");
        if (Roles.STUDENT.equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Students cannot delete tests");
        }
        Assessment exam = store.getOwned(Assessment.class, id, user.organizationId());
        for (Question q : store.listBy(Question.class, user.organizationId(), "assessmentId", id)) {
            store.deleteOwned(Question.class, q.getId(), user.organizationId());
        }
        store.deleteOwned(Assessment.class, id, user.organizationId());
        audit.log("ASSESSMENT_DELETE", "Assessment", id, exam.getTitle());
    }

    @Transactional
    public LmsPackage registerPackage(UUID contentItemId, String standard, String launchUrl, String version) {
        PropelUser user = Auth.current();
        Access.requirePackage(user, "ENTERPRISE");
        Access.requireAny(user, Roles.OWNER, Roles.FACULTY);
        ContentItem content = store.getOwned(ContentItem.class, contentItemId, user.organizationId());
        LmsPackage pkg = new LmsPackage();
        pkg.setOrganizationId(user.organizationId());
        pkg.setContentItemId(content.getId());
        pkg.setStandard(standard);
        pkg.setLaunchUrl(launchUrl);
        pkg.setVersionLabel(version);
        pkg.setPackageKey(content.getStorageKey());
        pkg.setStatus("READY");
        pkg = store.save(pkg);
        content.setScormStandard(standard);
        store.save(content);
        audit.log("LMS_PACKAGE", "LmsPackage", pkg.getId(), standard);
        return pkg;
    }

    @Transactional
    public LmsLaunch launch(UUID packageId) {
        PropelUser user = Auth.current();
        LmsPackage pkg = store.getOwned(LmsPackage.class, packageId, user.organizationId());
        Student student = requireCurrentStudent(user);
        LmsLaunch launch = new LmsLaunch();
        launch.setOrganizationId(user.organizationId());
        launch.setPackageId(pkg.getId());
        launch.setStudentId(student.getId());
        launch.setLaunchedAt(Instant.now());
        launch.setProgressPct(0);
        launch.setCompletion("INCOMPLETE");
        return store.save(launch);
    }

    @Transactional
    public LiveSession scheduleLive(String title, UUID batchId, Instant startsAt) {
        PropelUser user = Auth.current();
        Access.requirePackage(user, "GROWTH");
        Access.requireAny(user, Roles.OWNER, Roles.FACULTY);
        MeetingGateway.Meeting meeting = meetings.create(title, startsAt);
        LiveSession session = new LiveSession();
        session.setOrganizationId(user.organizationId());
        session.setBatchId(batchId);
        session.setTitle(title);
        session.setProvider(meeting.provider());
        session.setMeetingUrl(meeting.joinUrl());
        session.setStartsAt(startsAt);
        return store.save(session);
    }

    @Transactional
    public Submission submitAssignment(UUID assignmentId, String content, String fileUrl) {
        PropelUser user = Auth.current();
        Assignment assignment = store.getOwned(Assignment.class, assignmentId, user.organizationId());
        Student student = requireCurrentStudent(user);
        Submission sub = new Submission();
        sub.setOrganizationId(user.organizationId());
        sub.setAssignmentId(assignment.getId());
        sub.setStudentId(student.getId());
        sub.setContent(content);
        sub.setFileUrl(fileUrl);
        sub.setSubmittedAt(Instant.now());
        sub.setStatus("SUBMITTED");
        sub = store.save(sub);
        audit.log("ASSIGNMENT_SUBMIT", "Submission", sub.getId(), assignment.getTitle());
        return sub;
    }

    @Transactional
    public Submission grade(UUID submissionId, String grade, String feedback) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.FACULTY);
        Submission sub = store.getOwned(Submission.class, submissionId, user.organizationId());
        sub.setGrade(grade);
        sub.setFeedback(feedback);
        sub.setStatus("GRADED");
        sub = store.save(sub);
        audit.log("ASSIGNMENT_GRADE", "Submission", sub.getId(), grade);
        return sub;
    }

    @Transactional
    public ExamAttempt startExam(UUID assessmentId) {
        PropelUser user = Auth.current();
        Assessment exam = store.getOwned(Assessment.class, assessmentId, user.organizationId());
        if (!exam.isPublished()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Exam is not published");
        }
        Student student = requireCurrentStudent(user);
        List<ExamAttempt> existing = store.listBy(ExamAttempt.class, user.organizationId(), "assessmentId", exam.getId());
        ExamAttempt inProgress = existing.stream()
                .filter(a -> student.getId().equals(a.getStudentId()) && "IN_PROGRESS".equals(a.getStatus()))
                .findFirst()
                .orElse(null);
        if (inProgress != null) {
            return inProgress;
        }
        long submitted = existing.stream()
                .filter(a -> student.getId().equals(a.getStudentId()) && "SUBMITTED".equals(a.getStatus()))
                .count();
        Integer max = exam.getMaxAttempts();
        if (max != null && max > 0 && submitted >= max) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No attempts remaining for this test");
        }
        ExamAttempt attempt = new ExamAttempt();
        attempt.setOrganizationId(user.organizationId());
        attempt.setAssessmentId(exam.getId());
        attempt.setStudentId(student.getId());
        attempt.setStartedAt(Instant.now());
        attempt.setStatus("IN_PROGRESS");
        attempt.setMaxScore(exam.getTotalMarks() == null ? 100 : exam.getTotalMarks());
        return store.save(attempt);
    }

    @Transactional
    public Map<String, Object> submitExam(UUID attemptId, Map<String, String> answers) {
        PropelUser user = Auth.current();
        ExamAttempt attempt = store.getOwned(ExamAttempt.class, attemptId, user.organizationId());
        if (!"IN_PROGRESS".equals(attempt.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Attempt already submitted");
        }
        Assessment exam = store.getOwned(Assessment.class, attempt.getAssessmentId(), user.organizationId());
        List<Question> questions = store.listBy(Question.class, user.organizationId(), "assessmentId", exam.getId());
        int correct = 0;
        List<Map<String, Object>> breakdown = new java.util.ArrayList<>();
        for (Question q : questions) {
            String given = answers.getOrDefault(q.getId().toString(), "");
            boolean ok = q.getAnswerKey() != null && q.getAnswerKey().trim().equalsIgnoreCase(given.trim());
            if (ok) {
                correct++;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("questionId", q.getId());
            row.put("prompt", q.getPrompt());
            row.put("yourAnswer", given);
            row.put("correctAnswer", q.getAnswerKey());
            row.put("correct", ok);
            breakdown.add(row);
        }
        int max = Math.max(questions.size(), 1);
        int score = questions.isEmpty() ? 0 : (int) Math.round(correct * 100.0 / max);
        attempt.setAnswersJson(answers.toString());
        attempt.setScore(score);
        attempt.setMaxScore(100);
        attempt.setSubmittedAt(Instant.now());
        attempt.setStatus("SUBMITTED");
        attempt = store.save(attempt);
        audit.log("EXAM_SUBMIT", "ExamAttempt", attempt.getId(), "score=" + score);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", attempt.getId());
        out.put("score", score);
        out.put("maxScore", 100);
        out.put("status", "SUBMITTED");
        out.put("correctCount", correct);
        out.put("total", questions.size());
        int passing = exam.getPassingScore() == null ? 40 : exam.getPassingScore();
        out.put("passed", score >= passing);
        out.put("passingScore", passing);
        out.put("breakdown", breakdown);
        return out;
    }

    public Map<String, Object> progress(UUID studentId) {
        UUID org = Auth.current().organizationId();
        store.getOwned(Student.class, studentId, org);
        List<AttendanceRecord> att = store.listBy(AttendanceRecord.class, org, "studentId", studentId);
        long present = att.stream().filter(a -> "PRESENT".equals(a.getStatus())).count();
        List<Submission> subs = store.listBy(Submission.class, org, "studentId", studentId);
        List<ExamAttempt> exams = store.listBy(ExamAttempt.class, org, "studentId", studentId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("studentId", studentId);
        out.put("attendanceSessions", att.size());
        out.put("attendancePct", att.isEmpty() ? 0 : (int) (present * 100 / att.size()));
        out.put("submissions", subs.size());
        out.put("graded", subs.stream().filter(s -> "GRADED".equals(s.getStatus())).count());
        out.put("exams", exams.size());
        out.put("avgExamScore", exams.stream().filter(e -> e.getScore() != null).mapToInt(ExamAttempt::getScore).average().orElse(0));
        return out;
    }

    private Student requireCurrentStudent(PropelUser user) {
        if (!Roles.STUDENT.equals(user.role()) && !Roles.OWNER.equals(user.role()) && !Roles.FACULTY.equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Student context required");
        }
        List<Student> students = store.listBy(Student.class, user.organizationId(), "userId", user.userId());
        if (students.isEmpty() && Roles.STUDENT.equals(user.role())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No student profile linked to this login");
        }
        if (!students.isEmpty()) {
            return students.getFirst();
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "Pass a student-linked user to submit");
    }
}
