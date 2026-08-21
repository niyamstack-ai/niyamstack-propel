package com.niyamstack.propel.lms;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class LmsService {
    private final Store store;
    private final ObjectStorage storage;
    private final MeetingGateway meetings;
    private final AuditService audit;
    private final ObjectMapper json;

    public LmsService(Store store, ObjectStorage storage, MeetingGateway meetings, AuditService audit, ObjectMapper json) {
        this.store = store;
        this.storage = storage;
        this.meetings = meetings;
        this.audit = audit;
        this.json = json;
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
            item.setSortOrder(nextSortOrder(user.organizationId(), courseId, parentFolderId));
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
    public void deleteCourse(UUID id) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER);
        Access.requireWrite(user, "SETUP");
        Course course = store.getOwned(Course.class, id, user.organizationId());
        for (ContentItem item : store.listBy(ContentItem.class, user.organizationId(), "courseId", id)) {
            if (item.getParentFolderId() == null) {
                deleteContent(item.getId());
            }
        }
        for (Assessment exam : store.listBy(Assessment.class, user.organizationId(), "courseId", id)) {
            deleteAssessment(exam.getId());
        }
        store.deleteOwned(Course.class, id, user.organizationId());
        audit.log("COURSE_DELETE", "Course", id, course.getName());
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
    public Map<String, String> uploadSubmissionFile(MultipartFile file) {
        PropelUser user = Auth.current();
        requireCurrentStudent(user);
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a file to upload");
        }
        if (file.getSize() > 25L * 1024 * 1024) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "File must be 25 MB or smaller");
        }
        try {
            var stored = storage.put(user.organizationId(), file.getOriginalFilename(), file.getContentType(),
                    file.getInputStream(), file.getSize());
            Map<String, String> out = new LinkedHashMap<>();
            out.put("url", stored.url());
            out.put("fileName", file.getOriginalFilename() == null ? "file" : file.getOriginalFilename());
            return out;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Upload failed");
        }
    }

    @Transactional
    public Submission submitAssignment(UUID assignmentId, String content, String fileUrl) {
        PropelUser user = Auth.current();
        Assignment assignment = store.getOwned(Assignment.class, assignmentId, user.organizationId());
        Student student = requireCurrentStudent(user);
        String text = content == null ? "" : content.trim();
        String fileLink = fileUrl == null ? "" : fileUrl.trim();
        if (text.isEmpty() && fileLink.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Add your work as text, a link, or a file");
        }
        Submission sub = new Submission();
        sub.setOrganizationId(user.organizationId());
        sub.setAssignmentId(assignment.getId());
        sub.setStudentId(student.getId());
        sub.setContent(text.isEmpty() ? null : text);
        sub.setFileUrl(fileLink.isEmpty() ? null : fileLink);
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
            if (timedOut(exam, inProgress)) {
                submitExam(inProgress.getId(), parseAnswers(inProgress.getAnswersJson()), "TIME");
                return store.getOwned(ExamAttempt.class, inProgress.getId(), user.organizationId());
            }
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
        attempt.setAnswersJson("{}");
        attempt.setMaxScore(exam.getTotalMarks() == null ? 100 : exam.getTotalMarks());
        return store.save(attempt);
    }

    @Transactional
    public ExamAttempt saveExamDraft(UUID attemptId, Map<String, String> answers) {
        PropelUser user = Auth.current();
        ExamAttempt attempt = store.getOwned(ExamAttempt.class, attemptId, user.organizationId());
        requireAttemptOwner(user, attempt);
        if (!"IN_PROGRESS".equals(attempt.getStatus())) {
            return attempt;
        }
        Assessment exam = store.getOwned(Assessment.class, attempt.getAssessmentId(), user.organizationId());
        attempt.setAnswersJson(writeAnswers(answers));
        if (timedOut(exam, attempt)) {
            submitExam(attempt.getId(), parseAnswers(attempt.getAnswersJson()), "TIME");
            return store.getOwned(ExamAttempt.class, attemptId, user.organizationId());
        }
        return store.save(attempt);
    }

    public List<Map<String, Object>> examPaper(UUID assessmentId) {
        PropelUser user = Auth.current();
        Assessment exam = store.getOwned(Assessment.class, assessmentId, user.organizationId());
        if (!exam.isPublished() && !Access.canSeeAnswerKeys(user)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Exam is not published");
        }
        boolean keys = Access.canSeeAnswerKeys(user);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Question q : store.listBy(Question.class, user.organizationId(), "assessmentId", exam.getId())) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", q.getId());
            row.put("assessmentId", q.getAssessmentId());
            row.put("prompt", q.getPrompt());
            row.put("optionsJson", q.getOptionsJson());
            if (keys) {
                row.put("answerKey", q.getAnswerKey());
                row.put("explanation", q.getExplanation());
            }
            out.add(row);
        }
        return out;
    }

    public Map<String, Object> examResult(UUID attemptId) {
        PropelUser user = Auth.current();
        ExamAttempt attempt = store.getOwned(ExamAttempt.class, attemptId, user.organizationId());
        requireAttemptOwner(user, attempt);
        if (!"SUBMITTED".equals(attempt.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Attempt is not submitted yet");
        }
        Assessment exam = store.getOwned(Assessment.class, attempt.getAssessmentId(), user.organizationId());
        return buildResult(attempt, exam, parseAnswers(attempt.getAnswersJson()), null);
    }

    @Transactional
    public Map<String, Object> submitExam(UUID attemptId, Map<String, String> answers) {
        return submitExam(attemptId, answers, null);
    }

    @Transactional
    public Map<String, Object> submitExam(UUID attemptId, Map<String, String> answers, String reason) {
        PropelUser user = Auth.current();
        ExamAttempt attempt = store.getOwned(ExamAttempt.class, attemptId, user.organizationId());
        requireAttemptOwner(user, attempt);
        Assessment exam = store.getOwned(Assessment.class, attempt.getAssessmentId(), user.organizationId());
        Map<String, String> given = answers == null ? Map.of() : answers;
        String safeReason = sanitizeSubmitReason(exam, attempt, reason);
        if ("SUBMITTED".equals(attempt.getStatus())) {
            return buildResult(attempt, exam, parseAnswers(attempt.getAnswersJson()), safeReason);
        }
        return buildResult(scoreAndSave(attempt, exam, given, safeReason), exam, given, safeReason);
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

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CourseQuizInput {
        public UUID id;
        public String title;
        public String kind;
        public UUID parentFolderId;
        public Integer durationMinutes;
        public Integer passingScore;
        public Integer maxAttempts;
        public List<QuizQuestionInput> questions;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class QuizQuestionInput {
        public String prompt;
        public List<String> options;
        public String answerKey;
        public String explanation;
    }

    @Transactional
    public Assessment saveCourseQuiz(UUID courseId, CourseQuizInput body) {
        PropelUser user = Auth.current();
        Access.requireWrite(user, "LMS");
        if (Roles.STUDENT.equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Students cannot create tests");
        }
        store.getOwned(Course.class, courseId, user.organizationId());
        if (body == null || body.title == null || body.title.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a test name.");
        }
        List<QuizQuestionInput> questions = body.questions == null ? List.of() : body.questions.stream()
                .filter(q -> q != null && q.prompt != null && !q.prompt.isBlank())
                .toList();
        if (questions.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Add at least one question.");
        }
        Assessment exam;
        if (body.id != null) {
            exam = store.getOwned(Assessment.class, body.id, user.organizationId());
            if (exam.getCourseId() != null && !courseId.equals(exam.getCourseId())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "This test belongs to another course.");
            }
        } else {
            exam = new Assessment();
            exam.setOrganizationId(user.organizationId());
            exam.setSortOrder(nextSortOrder(user.organizationId(), courseId, body.parentFolderId));
        }
        exam.setCourseId(courseId);
        exam.setTitle(body.title.trim());
        exam.setKind(body.kind == null || body.kind.isBlank() ? "MCQ" : body.kind);
        exam.setParentFolderId(body.parentFolderId);
        exam.setDurationMinutes(body.durationMinutes == null ? 30 : body.durationMinutes);
        exam.setPassingScore(body.passingScore == null ? 40 : body.passingScore);
        exam.setTotalMarks(100);
        exam.setMaxAttempts(body.maxAttempts == null ? 0 : body.maxAttempts);
        exam.setPublished(true);
        exam = store.save(exam);
        for (Question old : store.listBy(Question.class, user.organizationId(), "assessmentId", exam.getId())) {
            store.deleteOwned(Question.class, old.getId(), user.organizationId());
        }
        for (QuizQuestionInput q : questions) {
            Question row = new Question();
            row.setOrganizationId(user.organizationId());
            row.setAssessmentId(exam.getId());
            row.setPrompt(q.prompt.trim());
            List<String> options = q.options == null ? List.of() : q.options.stream()
                    .filter(o -> o != null && !o.isBlank())
                    .toList();
            row.setOptionsJson(jsonArray(options));
            row.setAnswerKey(q.answerKey == null ? "" : q.answerKey);
            row.setExplanation(q.explanation == null ? "" : q.explanation.trim());
            row.setDifficulty("MEDIUM");
            store.save(row);
        }
        audit.log("ASSESSMENT_SAVE", "Assessment", exam.getId(), exam.getTitle());
        return exam;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ArrangeRequest {
        public UUID parentFolderId;
        public List<ArrangeItem> items;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ArrangeItem {
        public String kind;
        public UUID id;
    }

    @Transactional
    public void arrangeCourseContent(UUID courseId, ArrangeRequest body) {
        PropelUser user = Auth.current();
        Access.requireWrite(user, "LMS");
        if (Roles.STUDENT.equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Students cannot rearrange content");
        }
        store.getOwned(Course.class, courseId, user.organizationId());
        if (body == null || body.items == null || body.items.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Nothing to move.");
        }
        UUID parent = body.parentFolderId;
        if (parent != null) {
            ContentItem folder = store.getOwned(ContentItem.class, parent, user.organizationId());
            if (!"FOLDER".equalsIgnoreCase(folder.getContentType())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "You can only drop items into a folder.");
            }
            if (folder.getCourseId() != null && !courseId.equals(folder.getCourseId())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "That folder belongs to another course.");
            }
        }
        int order = 0;
        Set<UUID> seen = new HashSet<>();
        for (ArrangeItem item : body.items) {
            if (item == null || item.id == null) {
                continue;
            }
            if (!seen.add(item.id)) {
                continue;
            }
            if (item.kind != null && "ASSESSMENT".equalsIgnoreCase(item.kind)) {
                Assessment exam = store.getOwned(Assessment.class, item.id, user.organizationId());
                if (exam.getCourseId() != null && !courseId.equals(exam.getCourseId())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "This test belongs to another course.");
                }
                exam.setParentFolderId(parent);
                exam.setSortOrder(order);
                store.save(exam);
            } else {
                ContentItem row = store.getOwned(ContentItem.class, item.id, user.organizationId());
                if (row.getCourseId() != null && !courseId.equals(row.getCourseId())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "This item belongs to another course.");
                }
                if (parent != null && folderWouldCycle(row, parent, user.organizationId())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "A folder cannot be moved into itself.");
                }
                row.setParentFolderId(parent);
                row.setSortOrder(order);
                store.save(row);
            }
            order += 10;
        }
        audit.log("CONTENT_ARRANGE", "Course", courseId, "items=" + seen.size());
    }

    private boolean folderWouldCycle(ContentItem moving, UUID targetFolderId, UUID orgId) {
        if (!"FOLDER".equalsIgnoreCase(moving.getContentType())) {
            return false;
        }
        UUID current = targetFolderId;
        Set<UUID> walked = new HashSet<>();
        while (current != null && walked.add(current)) {
            if (moving.getId().equals(current)) {
                return true;
            }
            ContentItem folder = store.getOwned(ContentItem.class, current, orgId);
            current = folder.getParentFolderId();
        }
        return false;
    }

    private int nextSortOrder(UUID orgId, UUID courseId, UUID parentFolderId) {
        int max = 0;
        if (courseId != null) {
            for (ContentItem row : store.listBy(ContentItem.class, orgId, "courseId", courseId)) {
                if (sameFolder(row.getParentFolderId(), parentFolderId) && row.getSortOrder() != null) {
                    max = Math.max(max, row.getSortOrder());
                }
            }
            for (Assessment exam : store.listBy(Assessment.class, orgId, "courseId", courseId)) {
                if (sameFolder(exam.getParentFolderId(), parentFolderId) && exam.getSortOrder() != null) {
                    max = Math.max(max, exam.getSortOrder());
                }
            }
        }
        return max + 10;
    }

    private static boolean sameFolder(UUID a, UUID b) {
        if (a == null || b == null) {
            return a == null && b == null;
        }
        return a.equals(b);
    }

    private ExamAttempt scoreAndSave(ExamAttempt attempt, Assessment exam, Map<String, String> answers, String reason) {
        List<Question> questions = store.listBy(Question.class, attempt.getOrganizationId(), "assessmentId", exam.getId());
        boolean subjective = "SUBJECTIVE".equalsIgnoreCase(exam.getKind());
        int correct = 0;
        for (Question q : questions) {
            String given = answers.getOrDefault(q.getId().toString(), "");
            if (!subjective && q.getAnswerKey() != null && q.getAnswerKey().trim().equalsIgnoreCase(given.trim())) {
                correct++;
            }
        }
        int max = Math.max(questions.size(), 1);
        Integer score = subjective ? null : (questions.isEmpty() ? 0 : (int) Math.round(correct * 100.0 / max));
        attempt.setAnswersJson(writeAnswers(answers));
        attempt.setScore(score);
        attempt.setMaxScore(100);
        attempt.setSubmittedAt(Instant.now());
        attempt.setStatus("SUBMITTED");
        attempt = store.save(attempt);
        audit.log("EXAM_SUBMIT", "ExamAttempt", attempt.getId(),
                (reason == null ? "score=" : reason + " score=") + (score == null ? "pending" : score));
        return attempt;
    }

    private Map<String, Object> buildResult(ExamAttempt attempt, Assessment exam, Map<String, String> answers, String reason) {
        List<Question> questions = store.listBy(Question.class, attempt.getOrganizationId(), "assessmentId", exam.getId());
        boolean subjective = "SUBJECTIVE".equalsIgnoreCase(exam.getKind());
        int correct = 0;
        List<Map<String, Object>> breakdown = new ArrayList<>();
        for (Question q : questions) {
            String given = answers.getOrDefault(q.getId().toString(), "");
            boolean ok = !subjective && q.getAnswerKey() != null && q.getAnswerKey().trim().equalsIgnoreCase(given.trim());
            if (ok) {
                correct++;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("questionId", q.getId());
            row.put("prompt", q.getPrompt());
            row.put("yourAnswer", given);
            row.put("correctAnswer", q.getAnswerKey());
            row.put("explanation", q.getExplanation() == null ? "" : q.getExplanation());
            row.put("correct", ok);
            breakdown.add(row);
        }
        int passing = exam.getPassingScore() == null ? 40 : exam.getPassingScore();
        Integer score = attempt.getScore();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", attempt.getId());
        out.put("score", score);
        out.put("maxScore", 100);
        out.put("status", attempt.getStatus());
        out.put("correctCount", correct);
        out.put("total", questions.size());
        out.put("passed", !subjective && score != null && score >= passing);
        out.put("passingScore", passing);
        out.put("pendingReview", subjective);
        out.put("reason", reason);
        out.put("startedAt", attempt.getStartedAt());
        out.put("submittedAt", attempt.getSubmittedAt());
        out.put("durationMinutes", exam.getDurationMinutes());
        out.put("breakdown", breakdown);
        return out;
    }

    private void requireAttemptOwner(PropelUser user, ExamAttempt attempt) {
        if (Access.canSeeAnswerKeys(user)) {
            return;
        }
        Student student = requireCurrentStudent(user);
        if (!student.getId().equals(attempt.getStudentId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Not your attempt");
        }
    }

    private static String sanitizeSubmitReason(Assessment exam, ExamAttempt attempt, String reason) {
        if (timedOut(exam, attempt)) {
            return "TIME";
        }
        if ("TAB".equalsIgnoreCase(reason) && exam.getKind() != null && !"PRACTICE".equalsIgnoreCase(exam.getKind())) {
            return "TAB";
        }
        return null;
    }

    private static boolean timedOut(Assessment exam, ExamAttempt attempt) {
        if (exam.getDurationMinutes() == null || exam.getDurationMinutes() <= 0 || attempt.getStartedAt() == null) {
            return false;
        }
        Instant deadline = attempt.getStartedAt().plus(Duration.ofMinutes(exam.getDurationMinutes()));
        return Instant.now().isAfter(deadline);
    }

    private Map<String, String> parseAnswers(String raw) {
        if (raw == null || raw.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, String> parsed = json.readValue(raw, new TypeReference<>() {});
            return parsed == null ? Map.of() : parsed;
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String writeAnswers(Map<String, String> answers) {
        try {
            return json.writeValueAsString(answers == null ? Map.of() : answers);
        } catch (Exception e) {
            return "{}";
        }
    }

    private static String jsonArray(List<String> values) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                out.append(',');
            }
            out.append('"').append(values.get(i).replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return out.append(']').toString();
    }
}
