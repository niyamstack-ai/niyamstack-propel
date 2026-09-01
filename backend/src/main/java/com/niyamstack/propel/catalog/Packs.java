package com.niyamstack.propel.catalog;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class Packs {
    public static final String STUDENT_PORTAL = "STUDENT_PORTAL";
    public static final String ADMISSIONS = "ADMISSIONS";
    public static final String FULL_OPS = "FULL_OPS";
    public static final String ESS = "ESS";

    public static final String MOD_STUDENTS = "STUDENTS";
    public static final String MOD_CRM = "CRM";
    public static final String MOD_LMS = "LMS";
    public static final String MOD_FEES = "FEES";
    public static final String MOD_PLACEMENT = "PLACEMENT";
    public static final String MOD_COMMS = "COMMS";
    public static final String MOD_ANALYTICS = "ANALYTICS";
    public static final String MOD_WEBSITE = "WEBSITE";
    public static final String MOD_TESTS = "TESTS";
    public static final String MOD_STAFF = "STAFF";
    public static final String MOD_GROW = "GROW";
    public static final String MOD_ESS = "ESS";

    public static final String CAP_VIEW_FEES = "VIEW_FEES";
    public static final String CAP_REFUND = "REFUND";
    public static final String CAP_STUDENTS = "STUDENTS";
    public static final String CAP_EXAMS = "EXAMS";
    public static final String CAP_ESS_VIEW = "ESS_VIEW";
    public static final String CAP_ESS_MANAGE = "ESS_MANAGE";
    public static final String CAP_LEAVE_APPROVE = "LEAVE_APPROVE";
    public static final String CAP_STAFF_MANAGE = "STAFF_MANAGE";
    public static final String CAP_ANALYTICS = "ANALYTICS";
    public static final String CAP_CRM = "CRM";
    public static final String CAP_PLACEMENT = "PLACEMENT";
    public static final String CAP_LMS = "LMS";

    public static final Set<String> ALL_CAPS = Set.of(
            CAP_STUDENTS, CAP_VIEW_FEES, CAP_REFUND, CAP_EXAMS,
            CAP_ESS_VIEW, CAP_ESS_MANAGE, CAP_LEAVE_APPROVE, CAP_STAFF_MANAGE,
            CAP_ANALYTICS, CAP_CRM, CAP_PLACEMENT, CAP_LMS);

    private Packs() {}

    public static List<Map<String, Object>> catalog() {
        List<Map<String, Object>> packs = new ArrayList<>();
        packs.add(pack(STUDENT_PORTAL, "Student portal", "Website, classes, tests, and fee pay for students.", studentPortalModules()));
        packs.add(pack(ADMISSIONS, "Admissions", "Leads, landing pages, and converting inquiries to students.", admissionsModules()));
        packs.add(pack(FULL_OPS, "Full ops", "Run the institute: people, classes, fees, placements, and growth.", fullOpsModules()));
        packs.add(pack(ESS, "ESS", "Employee self-service for institute staff HR.", essModules()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("packs", packs);
        out.put("modules", modules());
        out.put("staffRights", staffRights());
        return List.of(out);
    }

    public static Map<String, Object> catalogMap() {
        return catalog().get(0);
    }

    public static List<Map<String, String>> modules() {
        return List.of(
                module(MOD_STUDENTS, "Student management"),
                module(MOD_CRM, "Admissions / CRM"),
                module(MOD_LMS, "LMS / live classes"),
                module(MOD_FEES, "Fees"),
                module(MOD_PLACEMENT, "Placement"),
                module(MOD_COMMS, "Communication"),
                module(MOD_ANALYTICS, "Analytics"),
                module(MOD_WEBSITE, "Website"),
                module(MOD_TESTS, "Tests"),
                module(MOD_STAFF, "Staff"),
                module(MOD_GROW, "Grow (landing pages, campaigns, app)"),
                module(MOD_ESS, "ESS")
        );
    }

    public static List<Map<String, String>> staffRights() {
        return List.of(
                Map.of("id", CAP_STUDENTS, "label", "See students"),
                Map.of("id", CAP_VIEW_FEES, "label", "See fees"),
                Map.of("id", CAP_REFUND, "label", "Refund"),
                Map.of("id", CAP_EXAMS, "label", "Exams"),
                Map.of("id", CAP_ESS_VIEW, "label", "ESS self-service"),
                Map.of("id", CAP_ESS_MANAGE, "label", "Manage HR records"),
                Map.of("id", CAP_LEAVE_APPROVE, "label", "Approve leave"),
                Map.of("id", CAP_STAFF_MANAGE, "label", "Manage staff logins"),
                Map.of("id", CAP_ANALYTICS, "label", "View analytics"),
                Map.of("id", CAP_CRM, "label", "Admissions / CRM"),
                Map.of("id", CAP_PLACEMENT, "label", "Placement"),
                Map.of("id", CAP_LMS, "label", "LMS / academics")
        );
    }

    public static List<String> parseCaps(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .map(String::toUpperCase)
                .filter(s -> !s.isEmpty() && ALL_CAPS.contains(s))
                .distinct()
                .toList();
    }

    public static String sanitizeCapsCsv(String csv, List<String> caps) {
        if (caps != null && !caps.isEmpty()) {
            return String.join(",", caps.stream()
                    .map(c -> c.trim().toUpperCase())
                    .filter(ALL_CAPS::contains)
                    .distinct()
                    .toList());
        }
        return String.join(",", parseCaps(csv));
    }

    public static String normalizePack(String pack) {
        if (pack == null || pack.isBlank()) {
            return FULL_OPS;
        }
        String id = pack.trim().toUpperCase(Locale.ROOT).replace(' ', '_');
        return switch (id) {
            case STUDENT_PORTAL, "STUDENT", "STUDENTS" -> STUDENT_PORTAL;
            case ADMISSIONS, "CRM" -> ADMISSIONS;
            case ESS, "HR" -> ESS;
            default -> FULL_OPS;
        };
    }

    public static String modulesCsvForPack(String pack) {
        return String.join(",", modulesForPack(normalizePack(pack)));
    }

    public static List<String> modulesForPack(String pack) {
        return switch (normalizePack(pack)) {
            case STUDENT_PORTAL -> studentPortalModules();
            case ADMISSIONS -> admissionsModules();
            case ESS -> essModules();
            default -> fullOpsModules();
        };
    }

    public static Set<String> parse(String csv) {
        Set<String> out = new LinkedHashSet<>();
        if (csv == null || csv.isBlank()) {
            return out;
        }
        for (String part : csv.split(",")) {
            String id = part.trim().toUpperCase(Locale.ROOT);
            if (!id.isEmpty()) {
                out.add(id);
            }
        }
        return out;
    }

    public static boolean hasModule(String csv, String module) {
        if (module == null || module.isBlank()) {
            return true;
        }
        Set<String> mods = parse(csv);
        if (mods.isEmpty()) {
            return true;
        }
        return mods.contains(module.toUpperCase(Locale.ROOT));
    }

    public static boolean hasAnyModule(String csv, String... modules) {
        if (modules == null || modules.length == 0) {
            return true;
        }
        Set<String> mods = parse(csv);
        if (mods.isEmpty()) {
            return true;
        }
        return Arrays.stream(modules).anyMatch(m -> m != null && mods.contains(m.toUpperCase(Locale.ROOT)));
    }

    public static String[] modulesForEntity(String simpleName) {
        return switch (simpleName) {
            case "Inquiry", "CounselingNote", "AdmissionForm", "Referral", "Scholarship" -> new String[]{MOD_CRM};
            case "ContentItem", "Assignment", "Submission", "LiveSession", "Recording", "TimetableSlot",
                 "DoubtTicket", "LmsPackage", "LmsLaunch", "AttendanceRecord", "ContentProgress" -> new String[]{MOD_LMS};
            case "Assessment", "Question", "ExamAttempt", "PracticeAttempt" -> new String[]{MOD_LMS, MOD_TESTS};
            case "Invoice", "Payment", "Receipt", "Refund", "FeePlan", "FeeInstallment" -> new String[]{MOD_FEES};
            case "Drive", "Application", "Offer", "Company", "Internship", "InterviewRound", "DriveRound",
                 "MockInterview", "Resume", "Skill", "Alumnus", "AlumniJob", "EligibilityRule" -> new String[]{MOD_PLACEMENT};
            case "Announcement", "Notification", "InboxMessage", "ChatThread", "ChatMessage", "MessageTemplate",
                 "OneToOneSession" -> new String[]{MOD_COMMS};
            case "WebsitePage" -> new String[]{MOD_WEBSITE};
            case "LandingPage", "Campaign", "AppBanner", "AppPush", "FreeMaterial", "Coupon", "BackendAddition" ->
                    new String[]{MOD_GROW};
            case "Student", "Guardian", "StudentDocument" -> new String[]{MOD_STUDENTS};
            case "Course", "Batch" -> new String[]{MOD_LMS, MOD_STUDENTS, MOD_CRM};
            case "Employee", "StaffAttendance", "BiometricPunch", "LeaveBalance", "LeaveRequest",
                 "SalaryStructure", "Payslip", "PayrollSettings", "StaffVacancy", "StaffCandidate" -> new String[]{MOD_ESS};
            case "InstituteRole" -> new String[]{MOD_STAFF};
            case "ApprovalRequest", "CustomField", "Workflow", "DocumentTemplate", "AcademicYear", "Term",
                 "Classroom" -> new String[]{MOD_STUDENTS, MOD_LMS};
            case "ReportDefinition", "ScheduledReport" -> new String[]{MOD_ANALYTICS};
            case "XapiStatement" -> new String[]{MOD_LMS};
            case "AccreditationFolder", "AccreditationEvidence" -> new String[]{MOD_LMS, MOD_ANALYTICS};
            case "UsageEvent", "DataDeletionRequest", "TenantReleaseNote", "ApiToken", "HelpArticle" -> new String[]{MOD_ANALYTICS};
            case "StaffGoal", "SuccessionPlan", "PoshCase" -> new String[]{MOD_ESS};
            case "StudyPlan" -> new String[]{MOD_LMS, MOD_STUDENTS};
            default -> new String[0];
        };
    }

    public static String[] modulesForPath(String path) {
        if (path == null || path.equals("/")) {
            return new String[0];
        }
        if (path.startsWith("/website")) return new String[]{MOD_WEBSITE};
        if (path.startsWith("/your-app") || path.startsWith("/landing-pages") || path.startsWith("/campaigns")
                || path.startsWith("/coupons")) {
            return new String[]{MOD_GROW};
        }
        if (path.startsWith("/content-hub")) return new String[]{MOD_TESTS, MOD_LMS};
        if (path.startsWith("/lms") || path.startsWith("/courses")) return new String[]{MOD_LMS, MOD_STUDENTS};
        if (path.startsWith("/people/staff")) return new String[]{MOD_STAFF};
        if (path.startsWith("/people/alumni") || path.startsWith("/alumni")) return new String[]{MOD_PLACEMENT, MOD_STUDENTS};
        if (path.startsWith("/people") || path.startsWith("/students")) return new String[]{MOD_STUDENTS};
        if (path.startsWith("/crm")) return new String[]{MOD_CRM};
        if (path.startsWith("/fees")) return new String[]{MOD_FEES};
        if (path.startsWith("/analytics")) return new String[]{MOD_ANALYTICS};
        if (path.startsWith("/m")) return new String[0];
        if (path.startsWith("/placement") || path.startsWith("/readiness")) return new String[]{MOD_PLACEMENT};
        if (path.startsWith("/comms") || path.startsWith("/chats") || path.startsWith("/one-to-one")) {
            return new String[]{MOD_COMMS};
        }
        if (path.startsWith("/ess")) return new String[]{MOD_ESS};
        if (path.startsWith("/academics")) return new String[]{MOD_LMS, MOD_STUDENTS};
        return new String[0];
    }

    public static Set<String> defaultCaps(String role) {
        if (role == null) {
            return Set.of();
        }
        return switch (role) {
            case "FACULTY" -> Set.of(CAP_EXAMS, CAP_ESS_VIEW, CAP_LMS);
            case "COUNSELOR" -> Set.of(CAP_STUDENTS, CAP_CRM);
            case "ACCOUNTANT" -> Set.of(CAP_VIEW_FEES, CAP_REFUND, CAP_ESS_VIEW, CAP_ESS_MANAGE);
            case "PLACEMENT_HEAD" -> Set.of(CAP_STUDENTS, CAP_PLACEMENT);
            case "RECRUITER" -> Set.of(CAP_PLACEMENT);
            default -> Set.of();
        };
    }

    public static Set<String> capsFor(String role, String csv) {
        List<String> parsed = parseCaps(csv);
        if (!parsed.isEmpty()) {
            return new LinkedHashSet<>(parsed);
        }
        return defaultCaps(role);
    }

    public static List<String> studentPortalModules() {
        return List.of(MOD_STUDENTS, MOD_LMS, MOD_FEES, MOD_WEBSITE, MOD_TESTS);
    }

    public static List<String> admissionsModules() {
        return List.of(MOD_STUDENTS, MOD_CRM, MOD_WEBSITE, MOD_GROW, MOD_STAFF);
    }

    public static List<String> fullOpsModules() {
        return List.of(MOD_STUDENTS, MOD_CRM, MOD_LMS, MOD_FEES, MOD_PLACEMENT, MOD_COMMS, MOD_ANALYTICS,
                MOD_WEBSITE, MOD_TESTS, MOD_STAFF, MOD_GROW, MOD_ESS);
    }

    public static List<String> essModules() {
        return List.of(MOD_ESS, MOD_STAFF);
    }

    private static Map<String, Object> pack(String id, String name, String blurb, List<String> modules) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("name", name);
        row.put("blurb", blurb);
        row.put("modules", modules);
        return row;
    }

    private static Map<String, String> module(String id, String label) {
        return Map.of("id", id, "label", label);
    }
}
