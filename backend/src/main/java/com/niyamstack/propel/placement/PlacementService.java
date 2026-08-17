package com.niyamstack.propel.placement;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
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
public class PlacementService {
    private final Store store;
    private final AuditService audit;

    public PlacementService(Store store, AuditService audit) {
        this.store = store;
        this.audit = audit;
    }

    public Map<String, Object> eligibility(UUID driveId, UUID studentId) {
        PropelUser user = Auth.current();
        Drive drive = store.getOwned(Drive.class, driveId, user.organizationId());
        Student student = store.getOwned(Student.class, studentId, user.organizationId());
        int attendance = attendancePct(user.organizationId(), studentId);
        int minAtt = drive.getMinAttendancePct() == null ? parseInt(ruleJson(drive), "minAttendance", 0) : drive.getMinAttendancePct();
        int minMarks = drive.getMinMarks() == null ? parseInt(ruleJson(drive), "minMarks", 0) : drive.getMinMarks();
        boolean pass = attendance >= minAtt;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("driveId", driveId);
        out.put("studentId", studentId);
        out.put("student", student.getFullName());
        out.put("attendancePct", attendance);
        out.put("minAttendancePct", minAtt);
        out.put("minMarks", minMarks);
        out.put("eligible", pass);
        out.put("reason", pass ? "Eligible" : "Attendance below drive threshold");
        return out;
    }

    @Transactional
    public Application apply(UUID driveId, UUID studentId) {
        PropelUser user = Auth.current();
        Drive drive = store.getOwned(Drive.class, driveId, user.organizationId());
        Student student = resolveStudent(user, studentId);
        Map<String, Object> check = eligibility(driveId, student.getId());
        boolean ok = Boolean.TRUE.equals(check.get("eligible"));
        Application app = new Application();
        app.setOrganizationId(user.organizationId());
        app.setDriveId(drive.getId());
        app.setStudentId(student.getId());
        app.setEligibilityPassed(ok);
        app.setStatus(ok ? "APPLIED" : "INELIGIBLE");
        app.setCurrentRound(ok ? "APPLIED" : "BLOCKED");
        app = store.save(app);
        audit.log("DRIVE_APPLY", "Application", app.getId(), app.getStatus());
        return app;
    }

    @Transactional
    public DriveRound addRoundTemplate(UUID driveId, int seq, String name, String type) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        Drive drive = store.getOwned(Drive.class, driveId, user.organizationId());
        DriveRound round = new DriveRound();
        round.setOrganizationId(user.organizationId());
        round.setDriveId(drive.getId());
        round.setSeqNo(seq);
        round.setRoundName(name);
        round.setRoundType(type);
        return store.save(round);
    }

    @Transactional
    public InterviewRound recordRound(UUID applicationId, String roundName, String outcome, String feedback, String panel) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.RECRUITER);
        Application app = store.getOwned(Application.class, applicationId, user.organizationId());
        InterviewRound round = new InterviewRound();
        round.setOrganizationId(user.organizationId());
        round.setApplicationId(app.getId());
        round.setRoundName(roundName);
        round.setOutcome(outcome);
        round.setFeedback(feedback);
        round.setPanel(panel);
        round.setScheduledAt(Instant.now());
        round = store.save(round);
        if ("PASS".equalsIgnoreCase(outcome)) {
            app.setStatus("INTERVIEWED");
            app.setCurrentRound(roundName);
        } else if ("FAIL".equalsIgnoreCase(outcome)) {
            app.setStatus("REJECTED");
            app.setCurrentRound(roundName);
        }
        store.save(app);
        audit.log("ATS_ROUND", "InterviewRound", round.getId(), outcome);
        return round;
    }

    @Transactional
    public Offer offer(UUID applicationId, BigDecimal packageLpa, LocalDate joining, String notes) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD);
        Access.requirePackage(user, "GROWTH");
        Application app = store.getOwned(Application.class, applicationId, user.organizationId());
        Offer offer = new Offer();
        offer.setOrganizationId(user.organizationId());
        offer.setApplicationId(app.getId());
        offer.setPackageLpa(packageLpa);
        offer.setJoiningDate(joining);
        offer.setNotes(notes);
        offer.setStatus("OFFERED");
        offer = store.save(offer);
        app.setStatus("OFFERED");
        store.save(app);
        audit.log("OFFER", "Offer", offer.getId(), String.valueOf(packageLpa));
        return offer;
    }

    @Transactional
    public Application advance(UUID applicationId, String status) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.RECRUITER);
        Application app = store.getOwned(Application.class, applicationId, user.organizationId());
        app.setStatus(status);
        app.setCurrentRound(status);
        app = store.save(app);
        audit.log("ATS_ADVANCE", "Application", app.getId(), status);
        return app;
    }

    private Student resolveStudent(PropelUser user, UUID studentId) {
        if (Roles.STUDENT.equals(user.role())) {
            List<Student> mine = store.listBy(Student.class, user.organizationId(), "userId", user.userId());
            if (mine.isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "No student profile");
            }
            return mine.getFirst();
        }
        Access.requireAny(user, Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.FACULTY);
        return store.getOwned(Student.class, studentId, user.organizationId());
    }

    private int attendancePct(UUID org, UUID studentId) {
        List<AttendanceRecord> att = store.listBy(AttendanceRecord.class, org, "studentId", studentId);
        if (att.isEmpty()) {
            return 100;
        }
        long present = att.stream().filter(a -> "PRESENT".equals(a.getStatus())).count();
        return (int) (present * 100 / att.size());
    }

    private String ruleJson(Drive drive) {
        if (drive.getEligibilityRuleId() == null) {
            return "";
        }
        try {
            return store.getOwned(EligibilityRule.class, drive.getEligibilityRuleId(), Auth.current().organizationId()).getRulesJson();
        } catch (Exception e) {
            return "";
        }
    }

    private static int parseInt(String json, String key, int fallback) {
        if (json == null || json.isBlank()) {
            return fallback;
        }
        String needle = "\"" + key + "\":";
        int idx = json.indexOf(needle);
        if (idx < 0) {
            needle = "\"" + key + "\": ";
            idx = json.indexOf("\"" + key + "\"");
            if (idx < 0) {
                return fallback;
            }
            int colon = json.indexOf(':', idx);
            String num = json.substring(colon + 1).replaceAll("[^0-9].*", "");
            try {
                return Integer.parseInt(num);
            } catch (NumberFormatException e) {
                return fallback;
            }
        }
        String rest = json.substring(idx + needle.length()).trim().replaceAll("[^0-9].*", "");
        try {
            return Integer.parseInt(rest);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
