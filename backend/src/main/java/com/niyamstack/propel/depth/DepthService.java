package com.niyamstack.propel.depth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.integration.EventHook;
import com.niyamstack.propel.scale.ScaleService;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class DepthService {
    private final Store store;
    private final AuditService audit;
    private final EventHook hooks;
    private final ScaleService scale;
    private final ObjectMapper mapper = new ObjectMapper();

    public DepthService(Store store, AuditService audit, EventHook hooks, ScaleService scale) {
        this.store = store;
        this.audit = audit;
        this.hooks = hooks;
        this.scale = scale;
    }

    public Map<String, Object> hub() {
        requireOwnerOps();
        UUID org = orgId();
        Organization organization = store.get(Organization.class, org);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("packageTier", organization.getPackageTier());
        out.put("indiaDataResidency", organization.isIndiaDataResidency());
        out.put("dataMode", blank(organization.getDataMode(), "SHARED"));
        out.put("defaultRoyaltyPct", organization.getDefaultRoyaltyPct());
        out.put("centers", store.list(Center.class, org).size());
        out.put("openTickets", store.list(SupportTicket.class, org).stream()
                .filter(t -> !"CLOSED".equalsIgnoreCase(t.getStatus()) && !"RESOLVED".equalsIgnoreCase(t.getStatus()))
                .count());
        out.put("apiTokens", store.list(ApiToken.class, org).stream().filter(ApiToken::isActive).count());
        out.put("staffGoals", store.list(StaffGoal.class, org).size());
        out.put("successionPlans", store.list(SuccessionPlan.class, org).size());
        out.put("openPoshCases", store.list(PoshCase.class, org).stream()
                .filter(c -> !"CLOSED".equalsIgnoreCase(c.getStatus()))
                .count());
        out.put("studyPlans", store.list(StudyPlan.class, org).size());
        out.put("centerPnl", centerPnl(90));
        return out;
    }

    public Map<String, Object> centerPnl(int days) {
        requireOwnerOps();
        UUID org = orgId();
        Instant from = Instant.now().minus(Math.max(days, 1), ChronoUnit.DAYS);
        Map<UUID, Student> students = store.list(Student.class, org).stream()
                .collect(Collectors.toMap(Student::getId, s -> s, (a, b) -> a));
        Map<UUID, Invoice> invoices = store.list(Invoice.class, org).stream()
                .collect(Collectors.toMap(Invoice::getId, i -> i, (a, b) -> a));
        Map<UUID, BigDecimal[]> byCenter = new LinkedHashMap<>();
        BigDecimal unassigned = BigDecimal.ZERO;
        for (Payment p : store.list(Payment.class, org)) {
            if (p.getReceivedAt() == null || p.getReceivedAt().isBefore(from)) {
                continue;
            }
            if (!"CAPTURED".equalsIgnoreCase(blank(p.getStatus(), "CAPTURED"))) {
                continue;
            }
            BigDecimal amt = p.getAmount() == null ? BigDecimal.ZERO : p.getAmount();
            Invoice inv = p.getInvoiceId() == null ? null : invoices.get(p.getInvoiceId());
            UUID centerId = null;
            if (inv != null && inv.getStudentId() != null) {
                Student s = students.get(inv.getStudentId());
                if (s != null) {
                    centerId = s.getCenterId();
                }
            }
            if (centerId == null) {
                unassigned = unassigned.add(amt);
                continue;
            }
            byCenter.computeIfAbsent(centerId, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            byCenter.get(centerId)[0] = byCenter.get(centerId)[0].add(amt);
        }
        Organization organization = store.get(Organization.class, org);
        BigDecimal defaultRoyalty = organization.getDefaultRoyaltyPct() == null
                ? BigDecimal.ZERO : organization.getDefaultRoyaltyPct();
        List<Map<String, Object>> rows = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal totalRoyalty = BigDecimal.ZERO;
        for (Center c : store.list(Center.class, org)) {
            BigDecimal[] vals = byCenter.getOrDefault(c.getId(), new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal revenue = vals[0];
            BigDecimal royaltyPct = c.getRoyaltyPct() != null && c.getRoyaltyPct().signum() > 0
                    ? c.getRoyaltyPct() : defaultRoyalty;
            BigDecimal royalty = revenue.multiply(royaltyPct).setScale(2, RoundingMode.HALF_UP);
            total = total.add(revenue);
            totalRoyalty = totalRoyalty.add(royalty);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("centerId", c.getId());
            row.put("center", c.getName());
            row.put("revenue", revenue);
            row.put("royaltyPct", royaltyPct);
            row.put("royalty", royalty);
            row.put("retained", revenue.subtract(royalty));
            rows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("totalRevenue", total.add(unassigned));
        out.put("totalRoyalty", totalRoyalty);
        out.put("unassignedRevenue", unassigned);
        out.put("centers", rows);
        return out;
    }

    @Transactional
    public Map<String, Object> updateOrgDepth(Map<String, Object> body) {
        requireOwnerOps();
        Organization org = store.get(Organization.class, orgId());
        if (body.containsKey("indiaDataResidency")) {
            org.setIndiaDataResidency(Boolean.TRUE.equals(body.get("indiaDataResidency"))
                    || "true".equalsIgnoreCase(String.valueOf(body.get("indiaDataResidency"))));
        }
        if (body.containsKey("dataMode")) {
            String mode = String.valueOf(body.get("dataMode")).trim().toUpperCase();
            if (!Set.of("SHARED", "CENTER_SCOPED").contains(mode)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "dataMode must be SHARED or CENTER_SCOPED");
            }
            org.setDataMode(mode);
        }
        if (body.containsKey("defaultRoyaltyPct")) {
            org.setDefaultRoyaltyPct(new BigDecimal(String.valueOf(body.get("defaultRoyaltyPct"))));
        }
        store.save(org);
        audit.log("ORG_DEPTH_UPDATE", "Organization", org.getId(), org.getDataMode());
        return hub();
    }

    @Transactional
    public Map<String, Object> updateCenterRoyalty(UUID centerId, Map<String, Object> body) {
        requireOwnerOps();
        Center center = store.getOwned(Center.class, centerId, orgId());
        if (body.containsKey("royaltyPct")) {
            center.setRoyaltyPct(new BigDecimal(String.valueOf(body.get("royaltyPct"))));
        }
        store.save(center);
        return Map.of("id", center.getId(), "royaltyPct", center.getRoyaltyPct());
    }

    public List<Map<String, Object>> supportHub() {
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.ACCOUNTANT, Roles.FACULTY);
        return store.list(SupportTicket.class, orgId()).stream().map(t -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", t.getId());
            row.put("raisedBy", t.getRaisedBy());
            row.put("category", t.getCategory());
            row.put("subject", t.getSubject());
            row.put("body", t.getBody());
            row.put("status", t.getStatus());
            row.put("createdAt", t.getCreatedAt());
            return row;
        }).toList();
    }

    @Transactional
    public Map<String, Object> createTicket(Map<String, Object> body) {
        Access.requireTenant(Auth.current());
        SupportTicket t = new SupportTicket();
        t.setOrganizationId(orgId());
        t.setRaisedBy(Auth.current().email());
        t.setCategory(blank(str(body, "category"), "GENERAL"));
        t.setSubject(blank(str(body, "subject"), "Support request"));
        t.setBody(str(body, "body"));
        t.setStatus("OPEN");
        t = store.save(t);
        hooks.fire(orgId(), "support.ticket.created", Map.of("id", t.getId().toString(), "subject", t.getSubject()));
        audit.log("SUPPORT_TICKET", "SupportTicket", t.getId(), t.getSubject());
        return Map.of("id", t.getId(), "status", t.getStatus(), "subject", t.getSubject());
    }

    @Transactional
    public Map<String, Object> updateTicket(UUID id, Map<String, Object> body) {
        requireOwnerOps();
        SupportTicket t = store.getOwned(SupportTicket.class, id, orgId());
        if (body.containsKey("status")) {
            t.setStatus(str(body, "status").toUpperCase());
        }
        store.save(t);
        return Map.of("id", t.getId(), "status", t.getStatus());
    }

    @Transactional
    public Map<String, Object> requestUpgrade(Map<String, Object> body) {
        requireOwnerOps();
        Organization org = store.get(Organization.class, orgId());
        SupportTicket t = new SupportTicket();
        t.setOrganizationId(org.getId());
        t.setRaisedBy(Auth.current().email());
        t.setCategory("BILLING");
        t.setSubject("Upgrade request: " + blank(str(body, "tier"), "GROWTH"));
        t.setBody(blank(str(body, "note"), "Please upgrade our package / billing cycle."));
        t.setStatus("OPEN");
        t = store.save(t);
        audit.log("BILLING_UPGRADE_REQUEST", "SupportTicket", t.getId(), t.getSubject());
        return Map.of("ticketId", t.getId(), "status", "OPEN", "paymentStatus", org.getPaymentStatus());
    }

    public List<Map<String, Object>> helpArticles(String locale, String pageKey) {
        Access.requireTenant(Auth.current());
        String loc = blank(locale, "en");
        List<HelpArticle> articles = store.em().createQuery(
                        "select h from HelpArticle h where (h.organizationId is null or h.organizationId = :o) and h.locale = :l order by h.sortOrder, h.createdAt",
                        HelpArticle.class)
                .setParameter("o", orgId())
                .setParameter("l", loc)
                .setMaxResults(50)
                .getResultList();
        if (articles.isEmpty()) {
            return defaultHelp(loc, pageKey);
        }
        return articles.stream()
                .filter(a -> pageKey == null || pageKey.isBlank() || pageKey.equalsIgnoreCase(a.getPageKey()))
                .map(a -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("pageKey", a.getPageKey());
                    row.put("title", a.getTitle());
                    row.put("body", a.getBody());
                    row.put("locale", a.getLocale());
                    return row;
                }).toList();
    }

    public Map<String, Object> guidedTour(String pageKey) {
        Access.requireTenant(Auth.current());
        String key = blank(pageKey, "dashboard");
        List<Map<String, Object>> steps = switch (key) {
            case "compliance" -> List.of(
                    step("Trust hub", "Review exports, deletion requests, and residency."),
                    step("Subject export", "Download a student data bundle with masking."),
                    step("Deletion queue", "Log GDPR-style erasure requests."));
            case "enterprise" -> List.of(
                    step("Workflows", "Build multi-step approval chains."),
                    step("AI suite", "Use coach, resume, and career tools."),
                    step("Accreditation", "Track NAAC/NBA evidence."));
            case "support" -> List.of(
                    step("Raise a ticket", "Describe the issue and category."),
                    step("Track status", "Owners can close or resolve tickets."));
            default -> List.of(
                    step("Dashboard", "See KPIs and alerts for your institute."),
                    step("People", "Manage students, staff, and alumni."),
                    step("Help", "Open Help anytime from the sidebar."));
        };
        return Map.of("pageKey", key, "steps", steps);
    }

    @Transactional
    public Map<String, Object> createApiToken(Map<String, Object> body) {
        requireOwnerOps();
        String name = blank(str(body, "name"), "Public API");
        String raw = "propel_" + UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        ApiToken token = new ApiToken();
        token.setOrganizationId(orgId());
        token.setName(name);
        token.setTokenHash(sha256(raw));
        token.setTokenPrefix(raw.substring(0, 12));
        token.setScopesCsv(blank(str(body, "scopes"), "students:read,courses:read"));
        token.setActive(true);
        token = store.save(token);
        audit.log("API_TOKEN_CREATE", "ApiToken", token.getId(), token.getTokenPrefix());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", token.getId());
        out.put("name", token.getName());
        out.put("prefix", token.getTokenPrefix());
        out.put("scopes", token.getScopesCsv());
        out.put("token", raw);
        out.put("warning", "Copy this token now. It will not be shown again.");
        return out;
    }

    public List<Map<String, Object>> apiTokens() {
        requireOwnerOps();
        return store.list(ApiToken.class, orgId()).stream().map(t -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", t.getId());
            row.put("name", t.getName());
            row.put("prefix", t.getTokenPrefix());
            row.put("scopes", t.getScopesCsv());
            row.put("active", t.isActive());
            row.put("lastUsedAt", t.getLastUsedAt());
            return row;
        }).toList();
    }

    @Transactional
    public Map<String, Object> testWebhook() {
        requireOwnerOps();
        hooks.fire(orgId(), "webhook.test", Map.of("at", Instant.now().toString(), "source", "depth"));
        return Map.of("status", "fired");
    }

    public Organization resolveOrgByApiToken(String bearer) {
        if (bearer == null || !bearer.startsWith("propel_")) {
            return null;
        }
        String hash = sha256(bearer);
        List<ApiToken> tokens = store.em().createQuery(
                        "select t from ApiToken t where t.tokenHash = :h and t.active = true", ApiToken.class)
                .setParameter("h", hash)
                .setMaxResults(1)
                .getResultList();
        if (tokens.isEmpty()) {
            return null;
        }
        ApiToken token = tokens.getFirst();
        token.setLastUsedAt(Instant.now());
        store.save(token);
        return store.get(Organization.class, token.getOrganizationId());
    }

    public List<Map<String, Object>> publicStudents(UUID orgId) {
        return store.list(Student.class, orgId).stream().limit(100).map(s -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", s.getId());
            row.put("fullName", s.getFullName());
            row.put("studentCode", s.getStudentCode());
            row.put("status", s.getStatus());
            return row;
        }).toList();
    }

    public List<Map<String, Object>> publicCourses(UUID orgId) {
        return store.list(Course.class, orgId).stream().limit(100).map(c -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", c.getId());
            row.put("name", c.getName());
            row.put("code", c.getCode());
            return row;
        }).toList();
    }

    @Transactional
    public Map<String, Object> saveStaffGoal(Map<String, Object> body) {
        requireOwnerOps();
        StaffGoal goal = new StaffGoal();
        goal.setOrganizationId(orgId());
        goal.setEmployeeId(UUID.fromString(str(body, "employeeId")));
        goal.setTitle(blank(str(body, "title"), "Goal"));
        goal.setCycleLabel(blank(str(body, "cycleLabel"), "FY"));
        goal.setTargetValue(bd(body, "targetValue", BigDecimal.valueOf(100)));
        goal.setProgressValue(bd(body, "progressValue", BigDecimal.ZERO));
        goal.setStatus("OPEN");
        goal = store.save(goal);
        return Map.of("id", goal.getId(), "title", goal.getTitle(), "progressValue", goal.getProgressValue());
    }

    public List<Map<String, Object>> staffGoals() {
        requireOwnerOps();
        return store.list(StaffGoal.class, orgId()).stream().map(g -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", g.getId());
            row.put("employeeId", g.getEmployeeId());
            row.put("title", g.getTitle());
            row.put("cycleLabel", g.getCycleLabel());
            row.put("targetValue", g.getTargetValue());
            row.put("progressValue", g.getProgressValue());
            row.put("status", g.getStatus());
            return row;
        }).toList();
    }

    @Transactional
    public Map<String, Object> saveSuccession(Map<String, Object> body) {
        requireOwnerOps();
        SuccessionPlan plan = new SuccessionPlan();
        plan.setOrganizationId(orgId());
        plan.setRoleTitle(blank(str(body, "roleTitle"), "Role"));
        if (!str(body, "incumbentEmployeeId").isBlank()) {
            plan.setIncumbentEmployeeId(UUID.fromString(str(body, "incumbentEmployeeId")));
        }
        if (!str(body, "successorEmployeeId").isBlank()) {
            plan.setSuccessorEmployeeId(UUID.fromString(str(body, "successorEmployeeId")));
        }
        plan.setReadiness(blank(str(body, "readiness"), "DEVELOPING"));
        plan.setNotes(str(body, "notes"));
        plan = store.save(plan);
        return Map.of("id", plan.getId(), "roleTitle", plan.getRoleTitle(), "readiness", plan.getReadiness());
    }

    public List<Map<String, Object>> successionPlans() {
        requireOwnerOps();
        return store.list(SuccessionPlan.class, orgId()).stream().map(p -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", p.getId());
            row.put("roleTitle", p.getRoleTitle());
            row.put("incumbentEmployeeId", p.getIncumbentEmployeeId());
            row.put("successorEmployeeId", p.getSuccessorEmployeeId());
            row.put("readiness", p.getReadiness());
            row.put("notes", p.getNotes());
            return row;
        }).toList();
    }

    @Transactional
    public Map<String, Object> openPoshCase(Map<String, Object> body) {
        Access.requireAny(Auth.current(), Roles.OWNER);
        PoshCase c = new PoshCase();
        c.setOrganizationId(orgId());
        c.setCaseCode("POSH-" + LocalDate.now().getYear() + "-" + (store.list(PoshCase.class, orgId()).size() + 1));
        c.setSeverity(blank(str(body, "severity"), "MEDIUM").toUpperCase());
        c.setStatus("OPEN");
        c.setSummary(blank(str(body, "summary"), "Case opened"));
        c.setOpenedBy(Auth.current().userId());
        c = store.save(c);
        audit.log("POSH_CASE_OPEN", "PoshCase", c.getId(), c.getCaseCode());
        return Map.of("id", c.getId(), "caseCode", c.getCaseCode(), "status", c.getStatus());
    }

    public List<Map<String, Object>> poshCases() {
        Access.requireAny(Auth.current(), Roles.OWNER);
        return store.list(PoshCase.class, orgId()).stream().map(c -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", c.getId());
            row.put("caseCode", c.getCaseCode());
            row.put("severity", c.getSeverity());
            row.put("status", c.getStatus());
            row.put("summary", c.getSummary());
            row.put("closedAt", c.getClosedAt());
            return row;
        }).toList();
    }

    @Transactional
    public Map<String, Object> createStudyPlan(Map<String, Object> body) {
        Access.requirePackage(Auth.current(), "ENTERPRISE");
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.FACULTY, Roles.STUDENT);
        UUID studentId = UUID.fromString(str(body, "studentId"));
        store.getOwned(Student.class, studentId, orgId());
        Map<String, String> coach = scale.aiCoach(Map.of("question",
                blank(str(body, "focus"), "Build a 4-week personalized study plan for placement readiness.")));
        StudyPlan plan = new StudyPlan();
        plan.setOrganizationId(orgId());
        plan.setStudentId(studentId);
        plan.setTitle(blank(str(body, "title"), "Personalized study plan"));
        try {
            plan.setPlanJson(mapper.writeValueAsString(Map.of(
                    "weeks", List.of("Week 1: fundamentals", "Week 2: practice", "Week 3: mocks", "Week 4: revision"),
                    "coach", coach.getOrDefault("answer", ""),
                    "focus", blank(str(body, "focus"), "placement")
            )));
        } catch (Exception e) {
            plan.setPlanJson("{\"coach\":\"" + coach.getOrDefault("answer", "").replace("\"", "'") + "\"}");
        }
        plan = store.save(plan);
        return Map.of("id", plan.getId(), "title", plan.getTitle(), "planJson", plan.getPlanJson());
    }

    @Transactional
    public Map<String, Object> setLocale(Map<String, Object> body) {
        Access.requireTenant(Auth.current());
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        String locale = blank(str(body, "locale"), "en").toLowerCase();
        if (!Set.of("en", "hi").contains(locale)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "locale must be en or hi");
        }
        user.setUiLocale(locale);
        store.save(user);
        return Map.of("locale", locale, "dictionary", dictionary(locale));
    }

    public Map<String, Object> localeBundle() {
        Access.requireTenant(Auth.current());
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        String locale = blank(user.getUiLocale(), "en");
        return Map.of("locale", locale, "dictionary", dictionary(locale));
    }

    private Map<String, String> dictionary(String locale) {
        Map<String, String> en = new LinkedHashMap<>();
        en.put("dashboard", "Dashboard");
        en.put("grow", "Grow");
        en.put("website", "Website");
        en.put("your_app", "Your App");
        en.put("mobile_apps", "Mobile apps");
        en.put("landing_pages", "Landing Pages");
        en.put("campaigns", "Campaigns");
        en.put("courses", "Courses");
        en.put("tests", "Tests");
        en.put("lms", "LMS");
        en.put("academics", "Academics");
        en.put("people", "People");
        en.put("students", "Students");
        en.put("staff", "Staff");
        en.put("alumni", "Alumni");
        en.put("ess", "ESS");
        en.put("admissions", "Admissions");
        en.put("money", "Money");
        en.put("fees", "Fees");
        en.put("analytics", "Analytics");
        en.put("intelligence", "Intelligence");
        en.put("enterprise", "Enterprise");
        en.put("compliance", "Compliance");
        en.put("scale", "Scale depth");
        en.put("placements", "Placements");
        en.put("placement", "Placement");
        en.put("readiness", "Readiness");
        en.put("communicate", "Communicate");
        en.put("notices", "Notices");
        en.put("chats", "Chats");
        en.put("one_to_one", "1:1 Sessions");
        en.put("support", "Support");
        en.put("help", "Help");
        en.put("settings", "Settings");
        en.put("institute", "Institute");
        en.put("activity_log", "Activity log");
        en.put("integrations", "Integrations");
        en.put("license_map", "License map");
        en.put("email_support", "Email support");
        en.put("help_center", "Help center");
        en.put("get_started", "Get started");
        en.put("create_course", "Create a course");
        en.put("invite_staff", "Invite staff");
        en.put("publish_website", "Publish website");
        en.put("institute_profile", "Institute profile");
        en.put("add_center", "Add a center");
        en.put("open", "Open");
        en.put("my_institute", "My institute");
        en.put("grow_and_run", "Grow and run the institute");
        if (!"hi".equals(locale)) {
            return en;
        }
        Map<String, String> hi = new LinkedHashMap<>();
        hi.put("dashboard", "डैशबोर्ड");
        hi.put("grow", "विकास");
        hi.put("website", "वेबसाइट");
        hi.put("your_app", "आपका ऐप");
        hi.put("mobile_apps", "मोबाइल ऐप्स");
        hi.put("landing_pages", "लैंडिंग पेज");
        hi.put("campaigns", "अभियान");
        hi.put("courses", "कोर्स");
        hi.put("tests", "टेस्ट");
        hi.put("lms", "एलएमएस");
        hi.put("academics", "अकादमिक");
        hi.put("people", "लोग");
        hi.put("students", "छात्र");
        hi.put("staff", "स्टाफ");
        hi.put("alumni", "पूर्व छात्र");
        hi.put("ess", "ईएसएस");
        hi.put("admissions", "प्रवेश");
        hi.put("money", "पैसे");
        hi.put("fees", "फीस");
        hi.put("analytics", "एनालिटिक्स");
        hi.put("intelligence", "इंटेलिजेंस");
        hi.put("enterprise", "एंटरप्राइज़");
        hi.put("compliance", "अनुपालन");
        hi.put("scale", "स्केल डेप्थ");
        hi.put("placements", "प्लेसमेंट");
        hi.put("placement", "प्लेसमेंट");
        hi.put("readiness", "रेडीनेस");
        hi.put("communicate", "संपर्क");
        hi.put("notices", "सूचनाएँ");
        hi.put("chats", "चैट");
        hi.put("one_to_one", "1:1 सत्र");
        hi.put("support", "सहायता");
        hi.put("help", "मदद");
        hi.put("settings", "सेटिंग्स");
        hi.put("institute", "संस्थान");
        hi.put("activity_log", "गतिविधि लॉग");
        hi.put("integrations", "इंटीग्रेशन");
        hi.put("license_map", "लाइसेंस मैप");
        hi.put("email_support", "ईमेल सहायता");
        hi.put("help_center", "मदद केंद्र");
        hi.put("get_started", "शुरू करें");
        hi.put("create_course", "कोर्स बनाएँ");
        hi.put("invite_staff", "स्टाफ आमंत्रित करें");
        hi.put("publish_website", "वेबसाइट प्रकाशित करें");
        hi.put("institute_profile", "संस्थान प्रोफ़ाइल");
        hi.put("add_center", "केंद्र जोड़ें");
        hi.put("open", "खोलें");
        hi.put("my_institute", "मेरा संस्थान");
        hi.put("grow_and_run", "संस्थान चलाएँ और बढ़ाएँ");
        return hi;
    }

    private List<Map<String, Object>> defaultHelp(String locale, String pageKey) {
        boolean hi = "hi".equals(locale);
        List<Map<String, Object>> all = List.of(
                Map.of("pageKey", "dashboard", "title", hi ? "डैशबोर्ड" : "Dashboard",
                        "body", hi ? "यहाँ संस्थान के मुख्य आंकड़े देखें।" : "See institute KPIs and alerts here.", "locale", locale),
                Map.of("pageKey", "fees", "title", hi ? "फीस" : "Fees",
                        "body", hi ? "रसीद, किस्त और बकाया यहाँ प्रबंधित करें।" : "Manage receipts, installments, and dues.", "locale", locale),
                Map.of("pageKey", "compliance", "title", hi ? "अनुपालन" : "Compliance",
                        "body", hi ? "डेटा निर्यात और हटाने के अनुरोध।" : "Data export and deletion requests.", "locale", locale),
                Map.of("pageKey", "support", "title", hi ? "सहायता टिकट" : "Support tickets",
                        "body", hi ? "समस्या दर्ज करें और स्थिति देखें।" : "Raise issues and track status.", "locale", locale)
        );
        if (pageKey == null || pageKey.isBlank()) {
            return all;
        }
        return all.stream().filter(a -> pageKey.equalsIgnoreCase(String.valueOf(a.get("pageKey")))).toList();
    }

    private Map<String, Object> step(String title, String body) {
        return Map.of("title", title, "body", body);
    }

    private void requireOwnerOps() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
    }

    private UUID orgId() {
        return Auth.current().organizationId();
    }

    private static String str(Map<String, Object> body, String key) {
        if (body == null || body.get(key) == null) {
            return "";
        }
        return String.valueOf(body.get(key)).trim();
    }

    private static BigDecimal bd(Map<String, Object> body, String key, BigDecimal fallback) {
        try {
            if (body == null || body.get(key) == null || String.valueOf(body.get(key)).isBlank()) {
                return fallback;
            }
            return new BigDecimal(String.valueOf(body.get(key)));
        } catch (Exception e) {
            return fallback;
        }
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }

    private static String sha256(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] dig = md.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : dig) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return encoderFallback(raw);
        }
    }

    private static String encoderFallback(String raw) {
        return Integer.toHexString(raw.hashCode());
    }
}
