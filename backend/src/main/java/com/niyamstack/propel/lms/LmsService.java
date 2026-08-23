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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
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
    private final CodeRunner runner;

    public LmsService(Store store, ObjectStorage storage, MeetingGateway meetings, AuditService audit, ObjectMapper json, CodeRunner runner) {
        this.store = store;
        this.storage = storage;
        this.meetings = meetings;
        this.audit = audit;
        this.json = json;
        this.runner = runner;
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
        Access.requirePackage(user, "GROWTH");
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
        Access.requireWrite(user, "LMS");
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
        requireEnrolled(student, assignment.getCourseId(), assignment.getBatchId());
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
        if (assignment.getCourseId() != null) {
            issueIfComplete(user.organizationId(), student.getId(), assignment.getCourseId());
        }
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
        requireExamOpen(user, exam);
        Student student = requireCurrentStudent(user);
        requireEnrolled(student, exam.getCourseId(), exam.getBatchId());
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
        if (!Access.canSeeAnswerKeys(user)) {
            requireExamOpen(user, exam);
        }
        if (!exam.isPublished() && !Access.canSeeAnswerKeys(user)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Exam is not published");
        }
        if (!Access.canSeeAnswerKeys(user)) {
            requireEnrolled(requireCurrentStudent(user), exam.getCourseId(), exam.getBatchId());
        }
        boolean keys = Access.canSeeAnswerKeys(user);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Question q : store.listBy(Question.class, user.organizationId(), "assessmentId", exam.getId())) {
            String type = questionType(q);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", q.getId());
            row.put("assessmentId", q.getAssessmentId());
            row.put("prompt", q.getPrompt());
            row.put("questionType", type);
            row.put("language", q.getLanguage());
            row.put("starterCode", q.getStarterCode());
            if ("MATCH".equals(type)) {
                Map<String, List<String>> sides = matchSides(q);
                List<String> right = new ArrayList<>(sides.getOrDefault("right", List.of()));
                Collections.shuffle(right);
                row.put("left", sides.getOrDefault("left", List.of()));
                row.put("right", right);
            } else if (!"CODE".equals(type)) {
                row.put("optionsJson", q.getOptionsJson());
            }
            if ("CODE".equals(type)) {
                row.put("publicTests", runner.publicCases(q.getTestsJson()).stream().map(c -> {
                    Map<String, Object> t = new LinkedHashMap<>();
                    t.put("stdin", c.stdin);
                    t.put("stdout", c.stdout);
                    return t;
                }).toList());
            }
            if (keys) {
                row.put("answerKey", q.getAnswerKey());
                row.put("explanation", q.getExplanation());
                row.put("testsJson", q.getTestsJson());
            }
            out.add(row);
        }
        return out;
    }

    public Map<String, Object> codeLanguages(UUID courseId) {
        PropelUser user = Auth.current();
        Access.requireTenant(user);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("languages", runner.languages());
        out.put("runnerConfigured", runner.languages().stream().anyMatch(row -> Boolean.TRUE.equals(row.get("available")) && !"sql".equals(row.get("id"))));
        if (courseId != null) {
            Course course = store.getOwned(Course.class, courseId, user.organizationId());
            String inferred = CodeRunner.inferLanguage(course.getName(), course.getCategory());
            out.put("suggested", inferred);
            out.put("starter", CodeRunner.starter(inferred));
            out.put("courseName", course.getName());
        }
        return out;
    }

    public Map<String, Object> runCode(UUID questionId, String source, String stdin) {
        PropelUser user = Auth.current();
        Question q = store.getOwned(Question.class, questionId, user.organizationId());
        if (!"CODE".equals(questionType(q))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This is not a coding question");
        }
        if (q.getAssessmentId() == null) {
            Access.requireWrite(user, "LMS");
        } else {
            Assessment exam = store.getOwned(Assessment.class, q.getAssessmentId(), user.organizationId());
            if (!Access.canSeeAnswerKeys(user)) {
                requireEnrolled(requireCurrentStudent(user), exam.getCourseId(), exam.getBatchId());
            }
        }
        String language = q.getLanguage() == null || q.getLanguage().isBlank()
                ? CodeRunner.inferLanguage(null, null)
                : q.getLanguage();
        if (stdin != null && !stdin.isBlank()) {
            return runner.run(language, source, stdin);
        }
        List<CodeRunner.Case> pub = runner.publicCases(q.getTestsJson());
        if (pub.isEmpty()) {
            return runner.run(language, source, "");
        }
        CodeRunner.GradeResult grade = runner.grade(language, source, jsonArrayOfPublic(q.getTestsJson()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("language", language);
        out.put("ok", grade.passed());
        out.put("passedCount", grade.passedCount());
        out.put("total", grade.total());
        out.put("cases", grade.cases());
        if (!grade.cases().isEmpty()) {
            out.put("stdout", grade.cases().getFirst().get("stdout"));
            out.put("stderr", grade.cases().getFirst().get("stderr"));
        }
        return out;
    }

    @Transactional
    public Map<String, Object> practiceLab(UUID courseId) {
        PropelUser user = Auth.current();
        Course course = store.getOwned(Course.class, courseId, user.organizationId());
        if (!Access.canSeeAnswerKeys(user)) {
            requireEnrolled(requireCurrentStudent(user), courseId, null);
        }
        String language = CodeRunner.inferLanguage(course.getName(), course.getCategory());
        Assessment lab = store.listBy(Assessment.class, user.organizationId(), "courseId", courseId).stream()
                .filter(a -> "PRACTICE_LAB".equalsIgnoreCase(a.getKind()))
                .findFirst()
                .orElse(null);
        if (lab == null) {
            lab = new Assessment();
            lab.setOrganizationId(user.organizationId());
            lab.setCourseId(courseId);
            lab.setTitle("Practice lab");
            lab.setKind("PRACTICE_LAB");
            lab.setPublished(true);
            lab.setDurationMinutes(0);
            lab.setMaxAttempts(0);
            lab.setPassingScore(0);
            lab.setTotalMarks(0);
            lab = store.save(lab);
            Question q = new Question();
            q.setOrganizationId(user.organizationId());
            q.setAssessmentId(lab.getId());
            q.setQuestionType("CODE");
            q.setLanguage(language);
            q.setPrompt("Use the " + language + " runner. Print Hello, then read one line from stdin and print it back.");
            q.setStarterCode(CodeRunner.starter(language));
            q.setTestsJson("[{\"stdin\":\"world\",\"stdout\":\"Hello\\nworld\",\"hidden\":false}]");
            q.setDifficulty("EASY");
            q.setOptionsJson("[]");
            q.setAnswerKey("");
            store.save(q);
        }
        Question question = store.listBy(Question.class, user.organizationId(), "assessmentId", lab.getId()).stream().findFirst().orElse(null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("courseId", courseId);
        out.put("courseName", course.getName());
        out.put("language", question != null && question.getLanguage() != null ? question.getLanguage() : language);
        out.put("starter", question != null && question.getStarterCode() != null ? question.getStarterCode() : CodeRunner.starter(language));
        out.put("prompt", question != null ? question.getPrompt() : "Write and run code.");
        out.put("questionId", question == null ? null : question.getId());
        out.put("languages", runner.languages());
        return out;
    }

    public Map<String, Object> runPractice(UUID courseId, String language, String source, String stdin) {
        PropelUser user = Auth.current();
        Course course = store.getOwned(Course.class, courseId, user.organizationId());
        if (!Access.canSeeAnswerKeys(user)) {
            requireEnrolled(requireCurrentStudent(user), courseId, null);
        }
        String lang = language == null || language.isBlank()
                ? CodeRunner.inferLanguage(course.getName(), course.getCategory())
                : language;
        return runner.run(lang, source, stdin == null ? "" : stdin);
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
        Map<String, Object> result = buildResult(scoreAndSave(attempt, exam, given, safeReason), exam, given, safeReason);
        if (exam.getCourseId() != null) {
            Student student = store.getOwned(Student.class, attempt.getStudentId(), user.organizationId());
            issueIfComplete(user.organizationId(), student.getId(), exam.getCourseId());
        }
        return result;
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

    @Transactional
    public Map<String, Object> markContentViewed(UUID contentId) {
        PropelUser user = Auth.current();
        Student student = requireCurrentStudent(user);
        ContentItem item = store.getOwned(ContentItem.class, contentId, user.organizationId());
        if ("FOLDER".equalsIgnoreCase(item.getContentType())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Folders are not study items");
        }
        requireEnrolled(student, item.getCourseId(), item.getBatchId());
        boolean already = store.listBy(ContentProgress.class, user.organizationId(), "studentId", student.getId()).stream()
                .anyMatch(p -> contentId.equals(p.getContentItemId()));
        if (!already) {
            ContentProgress row = new ContentProgress();
            row.setOrganizationId(user.organizationId());
            row.setStudentId(student.getId());
            row.setContentItemId(contentId);
            row.setViewedAt(Instant.now());
            store.save(row);
        }
        if (item.getCourseId() != null) {
            issueIfComplete(user.organizationId(), student.getId(), item.getCourseId());
        }
        return Map.of("status", "ok");
    }

    private void requireExamOpen(PropelUser user, Assessment exam) {
        if (Access.canSeeAnswerKeys(user)) {
            return;
        }
        if (!exam.isPublished()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This test is not published yet");
        }
        if (exam.getScheduledAt() != null && exam.getScheduledAt().isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This test opens at " + exam.getScheduledAt());
        }
    }

    public List<Question> questionBank(String subject, String topic, String difficulty) {
        PropelUser user = Auth.current();
        Access.requireWrite(user, "LMS");
        return store.list(Question.class, user.organizationId()).stream()
                .filter(q -> q.getAssessmentId() == null)
                .filter(q -> subject == null || subject.isBlank() || subject.equalsIgnoreCase(q.getSubject()))
                .filter(q -> topic == null || topic.isBlank() || topic.equalsIgnoreCase(q.getTopic()))
                .filter(q -> difficulty == null || difficulty.isBlank() || difficulty.equalsIgnoreCase(q.getDifficulty()))
                .toList();
    }

    @Transactional
    public Question saveBankQuestion(QuizQuestionInput body) {
        PropelUser user = Auth.current();
        Access.requireWrite(user, "LMS");
        if (body == null || body.prompt == null || body.prompt.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a question");
        }
        Question row = new Question();
        row.setOrganizationId(user.organizationId());
        row.setAssessmentId(null);
        row.setPrompt(body.prompt.trim());
        String type = body.questionType == null || body.questionType.isBlank() ? "MCQ" : body.questionType.trim().toUpperCase();
        row.setQuestionType(type);
        row.setLanguage(body.language);
        row.setStarterCode(body.starterCode);
        row.setTestsJson(body.testsJson);
        row.setExplanation(body.explanation == null ? "" : body.explanation.trim());
        row.setDifficulty(body.difficulty == null || body.difficulty.isBlank() ? "MEDIUM" : body.difficulty.trim().toUpperCase());
        row.setSubject(body.subject);
        row.setTopic(body.topic);
        if ("MATCH".equals(type)) {
            Map<String, Object> sides = new LinkedHashMap<>();
            sides.put("left", body.left == null ? List.of() : body.left);
            sides.put("right", body.right == null ? List.of() : body.right);
            row.setOptionsJson(writeJson(sides));
            row.setAnswerKey(body.matchAnswer == null ? "{}" : writeJson(body.matchAnswer));
        } else if ("MULTI".equals(type)) {
            List<String> options = body.options == null ? List.of() : body.options.stream().filter(o -> o != null && !o.isBlank()).toList();
            row.setOptionsJson(jsonArray(options));
            row.setAnswerKey(body.correctOptions == null ? "[]" : jsonArray(body.correctOptions));
        } else {
            List<String> options = body.options == null ? List.of() : body.options.stream().filter(o -> o != null && !o.isBlank()).toList();
            row.setOptionsJson(jsonArray(options));
            row.setAnswerKey(body.answerKey == null ? "" : body.answerKey);
        }
        if ("CODE".equals(type) && (row.getStarterCode() == null || row.getStarterCode().isBlank())) {
            row.setStarterCode(CodeRunner.starter(row.getLanguage()));
        }
        return store.save(row);
    }

    private void saveBankCopy(UUID orgId, Question source) {
        boolean exists = store.list(Question.class, orgId).stream()
                .anyMatch(q -> q.getAssessmentId() == null && source.getPrompt() != null && source.getPrompt().equals(q.getPrompt())
                        && String.valueOf(source.getQuestionType()).equals(String.valueOf(q.getQuestionType())));
        if (exists) {
            return;
        }
        Question copy = new Question();
        copy.setOrganizationId(orgId);
        copy.setAssessmentId(null);
        copy.setPrompt(source.getPrompt());
        copy.setQuestionType(source.getQuestionType());
        copy.setLanguage(source.getLanguage());
        copy.setStarterCode(source.getStarterCode());
        copy.setTestsJson(source.getTestsJson());
        copy.setExplanation(source.getExplanation());
        copy.setDifficulty(source.getDifficulty());
        copy.setSubject(source.getSubject());
        copy.setTopic(source.getTopic());
        copy.setOptionsJson(source.getOptionsJson());
        copy.setAnswerKey(source.getAnswerKey());
        store.save(copy);
    }

    @Transactional
    public Certificate issueIfComplete(UUID orgId, UUID studentId, UUID courseId) {
        if (courseId == null) {
            return null;
        }
        int pct = completionPct(orgId, studentId, courseId);
        if (pct < 100) {
            return null;
        }
        Certificate existing = store.listBy(Certificate.class, orgId, "studentId", studentId).stream()
                .filter(c -> courseId.equals(c.getCourseId()))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            return existing;
        }
        Course course = store.getOwned(Course.class, courseId, orgId);
        Certificate cert = new Certificate();
        cert.setOrganizationId(orgId);
        cert.setStudentId(studentId);
        cert.setCourseId(courseId);
        cert.setTitle("Certificate of completion — " + course.getName());
        cert.setCertificateNo("CERT-" + Instant.now().toEpochMilli());
        cert.setIssuedOn(LocalDate.now());
        cert = store.save(cert);
        audit.log("CERTIFICATE_ISSUE", "Certificate", cert.getId(), course.getName());
        return cert;
    }

    public Map<String, Object> certificate(UUID certificateId) {
        PropelUser user = Auth.current();
        Certificate cert = store.getOwned(Certificate.class, certificateId, user.organizationId());
        Student student = store.getOwned(Student.class, cert.getStudentId(), user.organizationId());
        if (Roles.STUDENT.equals(user.role()) && !student.getUserId().equals(user.userId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Not your certificate");
        }
        Organization org = store.get(Organization.class, user.organizationId());
        String courseName = "";
        if (cert.getCourseId() != null) {
            try {
                courseName = store.getOwned(Course.class, cert.getCourseId(), user.organizationId()).getName();
            } catch (Exception ignored) {
                courseName = "";
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", cert.getId());
        out.put("certificateNo", cert.getCertificateNo());
        out.put("title", cert.getTitle());
        out.put("issuedOn", cert.getIssuedOn());
        out.put("studentName", student.getFullName());
        out.put("courseName", courseName);
        out.put("instituteName", org.getName());
        return out;
    }

    private int completionPct(UUID orgId, UUID studentId, UUID courseId) {
        Set<UUID> submittedExams = store.listBy(ExamAttempt.class, orgId, "studentId", studentId).stream()
                .filter(a -> "SUBMITTED".equals(a.getStatus()))
                .map(ExamAttempt::getAssessmentId)
                .collect(java.util.stream.Collectors.toSet());
        Set<UUID> submittedAsg = store.listBy(Submission.class, orgId, "studentId", studentId).stream()
                .map(Submission::getAssignmentId)
                .collect(java.util.stream.Collectors.toSet());
        Set<UUID> viewedContent = store.listBy(ContentProgress.class, orgId, "studentId", studentId).stream()
                .map(ContentProgress::getContentItemId)
                .collect(java.util.stream.Collectors.toSet());
        Set<UUID> batchIds = store.listBy(Batch.class, orgId, "courseId", courseId).stream().map(Batch::getId).collect(java.util.stream.Collectors.toSet());
        List<Assessment> exams = store.list(Assessment.class, orgId).stream()
                .filter(Assessment::isPublished)
                .filter(a -> !"PRACTICE_LAB".equalsIgnoreCase(a.getKind()))
                .filter(a -> courseId.equals(a.getCourseId()) || (a.getBatchId() != null && batchIds.contains(a.getBatchId())))
                .toList();
        List<Assignment> homework = store.list(Assignment.class, orgId).stream()
                .filter(Assignment::isPublished)
                .filter(a -> courseId.equals(a.getCourseId()) || (a.getBatchId() != null && batchIds.contains(a.getBatchId())))
                .toList();
        List<ContentItem> materials = store.listBy(ContentItem.class, orgId, "courseId", courseId).stream()
                .filter(c -> c.isPublished() && !"FOLDER".equalsIgnoreCase(c.getContentType()))
                .toList();
        int total = materials.size() + homework.size() + exams.size();
        if (total == 0) {
            return 0;
        }
        int done = (int) materials.stream().filter(c -> viewedContent.contains(c.getId())).count()
                + (int) homework.stream().filter(a -> submittedAsg.contains(a.getId())).count()
                + (int) exams.stream().filter(a -> submittedExams.contains(a.getId())).count();
        return (int) Math.min(100, done * 100L / total);
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

    private void requireEnrolled(Student student, UUID courseId, UUID batchId) {
        PropelUser user = Auth.current();
        if (Access.canSeeAnswerKeys(user)) {
            return;
        }
        if (courseId != null) {
            Set<UUID> courses = new HashSet<>();
            if (student.getCourseId() != null) {
                courses.add(student.getCourseId());
            }
            store.listBy(CourseEnrollment.class, student.getOrganizationId(), "studentId", student.getId()).stream()
                    .filter(e -> !"CANCELLED".equals(e.getStatus()))
                    .map(CourseEnrollment::getCourseId)
                    .filter(id -> id != null)
                    .forEach(courses::add);
            if (!courses.contains(courseId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You are not enrolled in this course");
            }
            return;
        }
        if (batchId != null && student.getBatchId() != null && !batchId.equals(student.getBatchId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You are not in this batch");
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CourseQuizInput {
        public UUID id;
        public UUID courseId;
        public String title;
        public String kind;
        public UUID parentFolderId;
        public Integer durationMinutes;
        public Integer passingScore;
        public Integer maxAttempts;
        public Boolean published;
        public Boolean proctoring;
        public Boolean scoresPublished;
        public Instant scheduledAt;
        public Boolean keepInBank;
        public List<QuizQuestionInput> questions;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class QuizQuestionInput {
        public String prompt;
        public String questionType;
        public String language;
        public String starterCode;
        public String testsJson;
        public String subject;
        public String topic;
        public String difficulty;
        public List<String> options;
        public List<String> left;
        public List<String> right;
        public Map<String, String> matchAnswer;
        public List<String> correctOptions;
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
        if (body == null || body.title == null || body.title.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a test name.");
        }
        if (courseId == null) {
            courseId = body.courseId;
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
            if (courseId == null) {
                courseId = exam.getCourseId();
            }
            if (exam.getCourseId() != null && courseId != null && !courseId.equals(exam.getCourseId())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "This test belongs to another course.");
            }
        } else {
            exam = new Assessment();
            exam.setOrganizationId(user.organizationId());
            exam.setSortOrder(nextSortOrder(user.organizationId(), courseId, body.parentFolderId));
        }
        if (courseId != null) {
            store.getOwned(Course.class, courseId, user.organizationId());
            exam.setCourseId(courseId);
        }
        exam.setTitle(body.title.trim());
        exam.setKind(body.kind == null || body.kind.isBlank() ? "MCQ" : body.kind);
        exam.setParentFolderId(body.parentFolderId);
        exam.setDurationMinutes(body.durationMinutes == null ? 30 : body.durationMinutes);
        exam.setPassingScore(body.passingScore == null ? 40 : body.passingScore);
        exam.setTotalMarks(100);
        exam.setMaxAttempts(body.maxAttempts == null ? 0 : body.maxAttempts);
        exam.setPublished(body.published == null || body.published);
        exam.setProctoring(Boolean.TRUE.equals(body.proctoring));
        exam.setScoresPublished(body.scoresPublished == null || body.scoresPublished);
        exam.setScheduledAt(body.scheduledAt);
        exam = store.save(exam);
        for (Question old : store.listBy(Question.class, user.organizationId(), "assessmentId", exam.getId())) {
            store.deleteOwned(Question.class, old.getId(), user.organizationId());
        }
        for (QuizQuestionInput q : questions) {
            Question row = new Question();
            row.setOrganizationId(user.organizationId());
            row.setAssessmentId(exam.getId());
            row.setPrompt(q.prompt.trim());
            String type = q.questionType == null || q.questionType.isBlank() ? inferSavedType(exam, q) : q.questionType.trim().toUpperCase();
            row.setQuestionType(type);
            row.setLanguage(q.language);
            row.setStarterCode(q.starterCode);
            row.setTestsJson(q.testsJson);
            row.setExplanation(q.explanation == null ? "" : q.explanation.trim());
            row.setDifficulty(q.difficulty == null || q.difficulty.isBlank() ? "MEDIUM" : q.difficulty.trim().toUpperCase());
            row.setSubject(q.subject);
            row.setTopic(q.topic);
            if ("MATCH".equals(type)) {
                Map<String, Object> sides = new LinkedHashMap<>();
                sides.put("left", q.left == null ? List.of() : q.left);
                sides.put("right", q.right == null ? List.of() : q.right);
                row.setOptionsJson(writeJson(sides));
                row.setAnswerKey(q.matchAnswer == null ? "{}" : writeJson(q.matchAnswer));
            } else if ("MULTI".equals(type)) {
                List<String> options = q.options == null ? List.of() : q.options.stream().filter(o -> o != null && !o.isBlank()).toList();
                row.setOptionsJson(jsonArray(options));
                row.setAnswerKey(q.correctOptions == null ? "[]" : jsonArray(q.correctOptions));
            } else {
                List<String> options = q.options == null ? List.of() : q.options.stream().filter(o -> o != null && !o.isBlank()).toList();
                row.setOptionsJson(jsonArray(options));
                row.setAnswerKey(q.answerKey == null ? "" : q.answerKey);
            }
            if ("CODE".equals(type) && (row.getLanguage() == null || row.getLanguage().isBlank())) {
                if (courseId != null) {
                    Course course = store.getOwned(Course.class, courseId, user.organizationId());
                    row.setLanguage(CodeRunner.inferLanguage(course.getName(), course.getCategory()));
                } else {
                    row.setLanguage(CodeRunner.inferLanguage(null, null));
                }
            }
            if ("CODE".equals(type) && (row.getStarterCode() == null || row.getStarterCode().isBlank())) {
                row.setStarterCode(CodeRunner.starter(row.getLanguage()));
            }
            store.save(row);
            if (Boolean.TRUE.equals(body.keepInBank)) {
                saveBankCopy(user.organizationId(), row);
            }
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
        int autoTotal = 0;
        int correct = 0;
        boolean pending = false;
        for (Question q : questions) {
            String type = questionType(q);
            String given = answers.getOrDefault(q.getId().toString(), "");
            if ("LONG".equals(type)) {
                pending = true;
                continue;
            }
            autoTotal++;
            if (answersCorrect(q, given)) {
                correct++;
            }
        }
        int max = Math.max(autoTotal, 1);
        Integer score = autoTotal == 0 && pending ? null : (int) Math.round(correct * 100.0 / max);
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
        int correct = 0;
        boolean pending = false;
        List<Map<String, Object>> breakdown = new ArrayList<>();
        for (Question q : questions) {
            String type = questionType(q);
            String given = answers.getOrDefault(q.getId().toString(), "");
            boolean longForm = "LONG".equals(type);
            boolean ok = !longForm && answersCorrect(q, given);
            if (longForm) {
                pending = true;
            } else if (ok) {
                correct++;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("questionId", q.getId());
            row.put("prompt", q.getPrompt());
            row.put("questionType", type);
            row.put("language", q.getLanguage());
            row.put("yourAnswer", given);
            row.put("correctAnswer", "CODE".equals(type) ? (ok ? "All tests passed" : "Tests failed") : q.getAnswerKey());
            row.put("explanation", q.getExplanation() == null ? "" : q.getExplanation());
            row.put("correct", ok);
            row.put("pendingReview", longForm);
            breakdown.add(row);
        }
        int autoTotal = (int) questions.stream().filter(q -> !"LONG".equals(questionType(q))).count();
        boolean emptyAnswers = answers.values().stream().allMatch(s -> s == null || s.isBlank());
        if (emptyAnswers && attempt.getScore() != null && autoTotal > 0) {
            correct = (int) Math.round(attempt.getScore() * autoTotal / 100.0);
            boolean allRight = attempt.getScore() >= 100;
            for (Map<String, Object> row : breakdown) {
                Object yours = row.get("yourAnswer");
                if (yours == null || String.valueOf(yours).isBlank()) {
                    row.put("yourAnswer", "Recorded on submit");
                    row.put("correct", allRight);
                }
            }
        }
        int passing = exam.getPassingScore() == null ? 40 : exam.getPassingScore();
        Integer score = attempt.getScore();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", attempt.getId());
        out.put("score", score);
        out.put("maxScore", 100);
        out.put("status", attempt.getStatus());
        out.put("correctCount", correct);
        out.put("total", Math.max(autoTotal, questions.size()));
        out.put("passed", !pending && score != null && score >= passing);
        out.put("passingScore", passing);
        out.put("pendingReview", pending);
        out.put("reason", reason);
        out.put("startedAt", attempt.getStartedAt());
        out.put("submittedAt", attempt.getSubmittedAt());
        out.put("durationMinutes", exam.getDurationMinutes());
        out.put("scoresPublished", exam.isScoresPublished());
        boolean hideScores = !exam.isScoresPublished() && !Access.canSeeAnswerKeys(Auth.current());
        if (hideScores) {
            out.put("score", null);
            out.put("passed", false);
            out.put("correctCount", 0);
            out.put("pendingReview", false);
            out.put("scoresPending", true);
            out.put("breakdown", List.of());
        } else {
            out.put("breakdown", breakdown);
        }
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
        if ("TAB".equalsIgnoreCase(reason) && exam.isProctoring()) {
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

    private static String questionType(Question q) {
        if (q.getQuestionType() != null && !q.getQuestionType().isBlank()) {
            return q.getQuestionType().trim().toUpperCase(Locale.ROOT);
        }
        if (q.getOptionsJson() == null || q.getOptionsJson().isBlank() || "[]".equals(q.getOptionsJson().trim())) {
            return "LONG";
        }
        return "MCQ";
    }

    private static String inferSavedType(Assessment exam, QuizQuestionInput q) {
        if (q.options != null && q.options.stream().anyMatch(o -> o != null && !o.isBlank())) {
            return "MCQ";
        }
        if (q.left != null && !q.left.isEmpty()) {
            return "MATCH";
        }
        if (q.language != null && !q.language.isBlank()) {
            return "CODE";
        }
        return "SUBJECTIVE".equalsIgnoreCase(exam.getKind()) ? "LONG" : "SHORT";
    }

    private boolean answersCorrect(Question q, String given) {
        String type = questionType(q);
        String expected = q.getAnswerKey() == null ? "" : q.getAnswerKey().trim();
        String actual = given == null ? "" : given.trim();
        return switch (type) {
            case "MCQ", "SHORT" -> !expected.isBlank() && expected.equalsIgnoreCase(actual);
            case "MULTI" -> sameJsonList(expected, actual);
            case "MATCH" -> sameJsonMap(expected, actual);
            case "CODE" -> {
                if (actual.isBlank()) {
                    yield false;
                }
                try {
                    String language = q.getLanguage() == null || q.getLanguage().isBlank() ? "python" : q.getLanguage();
                    yield runner.grade(language, actual, q.getTestsJson()).passed();
                } catch (Exception e) {
                    yield false;
                }
            }
            default -> false;
        };
    }

    private Map<String, List<String>> matchSides(Question q) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        out.put("left", List.of());
        out.put("right", List.of());
        if (q.getOptionsJson() == null || q.getOptionsJson().isBlank()) {
            return out;
        }
        try {
            Map<String, List<String>> parsed = json.readValue(q.getOptionsJson(), new TypeReference<>() {});
            if (parsed != null) {
                return parsed;
            }
        } catch (Exception ignored) {
            /* old rows */
        }
        return out;
    }

    private String jsonArrayOfPublic(String testsJson) {
        try {
            return json.writeValueAsString(runner.publicCases(testsJson));
        } catch (Exception e) {
            return "[]";
        }
    }

    private String writeJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (Exception e) {
            return "{}";
        }
    }

    private boolean sameJsonList(String a, String b) {
        try {
            List<String> left = json.readValue(a == null || a.isBlank() ? "[]" : a, new TypeReference<>() {});
            List<String> right = json.readValue(b == null || b.isBlank() ? "[]" : b, new TypeReference<>() {});
            if (left == null || right == null || left.size() != right.size()) {
                return false;
            }
            List<String> la = left.stream().map(s -> s.trim().toLowerCase(Locale.ROOT)).sorted().toList();
            List<String> ra = right.stream().map(s -> s.trim().toLowerCase(Locale.ROOT)).sorted().toList();
            return la.equals(ra);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean sameJsonMap(String a, String b) {
        try {
            Map<String, String> left = json.readValue(a == null || a.isBlank() ? "{}" : a, new TypeReference<>() {});
            Map<String, String> right = json.readValue(b == null || b.isBlank() ? "{}" : b, new TypeReference<>() {});
            if (left == null || right == null || left.size() != right.size()) {
                return false;
            }
            for (Map.Entry<String, String> e : left.entrySet()) {
                if (!e.getValue().equalsIgnoreCase(right.getOrDefault(e.getKey(), ""))) {
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
