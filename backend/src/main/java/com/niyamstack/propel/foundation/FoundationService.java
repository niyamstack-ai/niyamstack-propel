package com.niyamstack.propel.foundation;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.catalog.Packs;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.platform.OrgSettings;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class FoundationService {
    private static final Set<String> STAFF_ROLES = Set.of(
            Roles.PLACEMENT_HEAD, Roles.FACULTY, Roles.COUNSELOR, Roles.ACCOUNTANT);

    private final Store store;
    private final AuditService audit;

    public FoundationService(Store store, AuditService audit) {
        this.store = store;
        this.audit = audit;
    }

    public Map<String, Object> onboardingStatus() {
        requireOwner();
        Organization org = org();
        Map<String, Object> status = OrgSettings.onboarding(org);
        status.put("centers", store.list(Center.class, org.getId()).size());
        status.put("courses", store.list(Course.class, org.getId()).size());
        status.put("staff", staffCount(org.getId()));
        status.put("websitePublished", org.isWebsitePublished());
        Map<String, Object> steps = new LinkedHashMap<>((Map<String, Object>) status.get("steps"));
        steps.put("profile", org.getName() != null && !org.getName().isBlank());
        steps.put("center", ((Number) status.get("centers")).intValue() > 0);
        steps.put("course", ((Number) status.get("courses")).intValue() > 0);
        steps.put("staff", ((Number) status.get("staff")).intValue() > 0);
        steps.put("website", org.isWebsitePublished());
        status.put("steps", steps);
        boolean completed = steps.values().stream().allMatch(v -> Boolean.TRUE.equals(v));
        status.put("completed", completed || Boolean.TRUE.equals(status.get("completed")));
        return status;
    }

    @Transactional
    public Map<String, Object> updateOnboarding(Map<String, Object> body) {
        requireOwner();
        Organization org = org();
        OrgSettings.saveOnboarding(org, body);
        store.save(org);
        audit.log("ONBOARDING_UPDATE", "Organization", org.getId(), null);
        return onboardingStatus();
    }

    public List<Map<String, Object>> instituteRoles() {
        requireOwner();
        return store.list(InstituteRole.class, orgId()).stream().map(this::roleView).toList();
    }

    @Transactional
    public Map<String, Object> createInstituteRole(Map<String, Object> body) {
        requireOwner();
        String name = str(body, "name");
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Role name is required");
        }
        String baseRole = normalizeStaffRole(str(body, "baseRole"));
        boolean dup = store.list(InstituteRole.class, orgId()).stream()
                .anyMatch(r -> name.equalsIgnoreCase(r.getName()));
        if (dup) {
            throw new ApiException(HttpStatus.CONFLICT, "A role with this name already exists");
        }
        InstituteRole role = new InstituteRole();
        role.setOrganizationId(orgId());
        role.setName(name);
        role.setBaseRole(baseRole);
        role.setCapabilitiesCsv(Packs.sanitizeCapsCsv(str(body, "capabilitiesCsv"), capsList(body)));
        role = store.save(role);
        audit.log("INSTITUTE_ROLE_CREATE", "InstituteRole", role.getId(), role.getName());
        return roleView(role);
    }

    @Transactional
    public Map<String, Object> updateInstituteRole(UUID id, Map<String, Object> body) {
        requireOwner();
        InstituteRole role = store.getOwned(InstituteRole.class, id, orgId());
        if (body.containsKey("name") && !str(body, "name").isBlank()) {
            String name = str(body, "name");
            boolean dup = store.list(InstituteRole.class, orgId()).stream()
                    .anyMatch(r -> !r.getId().equals(id) && name.equalsIgnoreCase(r.getName()));
            if (dup) {
                throw new ApiException(HttpStatus.CONFLICT, "A role with this name already exists");
            }
            role.setName(name);
        }
        if (body.containsKey("baseRole") && !str(body, "baseRole").isBlank()) {
            role.setBaseRole(normalizeStaffRole(str(body, "baseRole")));
        }
        if (body.containsKey("capabilities") || body.containsKey("capabilitiesCsv")) {
            role.setCapabilitiesCsv(Packs.sanitizeCapsCsv(str(body, "capabilitiesCsv"), capsList(body)));
        }
        role = store.save(role);
        audit.log("INSTITUTE_ROLE_UPDATE", "InstituteRole", role.getId(), role.getName());
        return roleView(role);
    }

    @Transactional
    public void deleteInstituteRole(UUID id) {
        requireOwner();
        InstituteRole role = store.getOwned(InstituteRole.class, id, orgId());
        store.deleteOwned(InstituteRole.class, id, orgId());
        audit.log("INSTITUTE_ROLE_DELETE", "InstituteRole", id, role.getName());
    }

    @Transactional
    public Map<String, Object> linkStaffEmployee(UUID staffUserId) {
        requireSetupAccess();
        Access.requireAnyModule(Auth.current(), Packs.MOD_STAFF);
        if (Packs.hasModule(org().getModulesCsv(), Packs.MOD_ESS)) {
            Access.requireAnyModule(Auth.current(), Packs.MOD_ESS);
        }
        AppUser user = store.get(AppUser.class, staffUserId);
        if (user.getOrganizationId() == null || !user.getOrganizationId().equals(orgId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Staff member not found");
        }
        if (!STAFF_ROLES.contains(user.getRole())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only institute staff can be linked to an employee record");
        }
        Employee existing = findEmployeeByUser(user);
        if (existing != null) {
            return employeeLinkView(user, existing);
        }
        Employee e = new Employee();
        e.setOrganizationId(orgId());
        e.setUserId(user.getId());
        e.setFullName(user.getFullName());
        e.setEmail(user.getEmail());
        e.setPhone(user.getPhone());
        e.setDepartment(departmentForRole(user.getRole()));
        e.setDesignation(prettyRole(user.getRole()));
        e.setJoiningDate(LocalDate.now());
        e.setCenterId(user.getCenterId());
        e.setStatus("ACTIVE");
        e.setEmploymentType(employmentForRole(user.getRole()));
        e.setEmployeeCode(nextEmployeeCode(orgId()));
        e = store.save(e);
        audit.log("STAFF_EMPLOYEE_LINK", "Employee", e.getId(), user.getEmail());
        return employeeLinkView(user, e);
    }

    public List<Map<String, Object>> auditFeed(int limit) {
        requireOwner();
        int max = Math.min(Math.max(limit, 1), 200);
        List<AuditEvent> events = store.list(AuditEvent.class, orgId()).stream().limit(max).toList();
        List<AppUser> users = store.em().createQuery(
                        "select u from AppUser u where u.organizationId = :o", AppUser.class)
                .setParameter("o", orgId())
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>();
        for (AuditEvent event : events) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", event.getId());
            row.put("action", event.getAction());
            row.put("entityType", event.getEntityType());
            row.put("entityId", event.getEntityId());
            row.put("detail", event.getDetail());
            row.put("createdAt", event.getCreatedAt());
            row.put("actorUserId", event.getActorUserId());
            row.put("actorName", users.stream()
                    .filter(u -> u.getId().equals(event.getActorUserId()))
                    .map(AppUser::getFullName)
                    .findFirst()
                    .orElse("System"));
            out.add(row);
        }
        return out;
    }

    @Transactional
    public void seedStarter(UUID orgId, UUID ownerUserId) {
        if (orgId == null) {
            return;
        }
        if (!store.list(Center.class, orgId).isEmpty()) {
            return;
        }
        Organization org = store.get(Organization.class, orgId);
        Center center = new Center();
        center.setOrganizationId(orgId);
        center.setName(blank(org.getName(), "Main") + " — Main center");
        center.setCode("MAIN");
        center.setCity("—");
        center.setActive(true);
        center = store.save(center);

        AppUser owner = store.get(AppUser.class, ownerUserId);
        owner.setCenterId(center.getId());
        store.save(owner);

        AcademicYear year = new AcademicYear();
        year.setOrganizationId(orgId);
        int y = LocalDate.now().getYear();
        year.setName(y + "-" + (y + 1));
        year.setStartDate(LocalDate.of(y, 4, 1));
        year.setEndDate(LocalDate.of(y + 1, 3, 31));
        year.setActive(true);
        year = store.save(year);

        Course course = new Course();
        course.setOrganizationId(orgId);
        course.setName("Starter course");
        course.setCode("START-01");
        course.setPublished(false);
        course.setActive(true);
        store.save(course);

        HelpArticle tip = new HelpArticle();
        tip.setOrganizationId(orgId);
        tip.setLocale("en");
        tip.setPageKey("dashboard");
        tip.setTitle("Welcome to your institute");
        tip.setBody("Complete onboarding: publish website, invite staff, and add students.");
        tip.setSortOrder(1);
        store.save(tip);

        audit.log("SIGNUP_SEED", "Organization", orgId, "Starter center/course seeded");
    }

    public Employee ensureEmployeeForStaff(AppUser user) {
        if (user == null || user.getOrganizationId() == null || !STAFF_ROLES.contains(user.getRole())) {
            return null;
        }
        Organization org = store.get(Organization.class, user.getOrganizationId());
        if (!Packs.hasModule(org.getModulesCsv(), Packs.MOD_ESS)) {
            return null;
        }
        Employee existing = findEmployeeByUser(user);
        if (existing != null) {
            return existing;
        }
        Employee e = new Employee();
        e.setOrganizationId(user.getOrganizationId());
        e.setUserId(user.getId());
        e.setFullName(user.getFullName());
        e.setEmail(user.getEmail());
        e.setPhone(user.getPhone());
        e.setDepartment(departmentForRole(user.getRole()));
        e.setDesignation(prettyRole(user.getRole()));
        e.setJoiningDate(LocalDate.now());
        e.setCenterId(user.getCenterId());
        e.setStatus("ACTIVE");
        e.setEmploymentType(employmentForRole(user.getRole()));
        e.setEmployeeCode(nextEmployeeCode(user.getOrganizationId()));
        return store.save(e);
    }

    public Map<String, Object> staffLinkInfo(AppUser user) {
        Employee employee = findEmployeeByUser(user);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("employeeId", employee == null ? "" : employee.getId());
        row.put("employeeCode", employee == null ? "" : employee.getEmployeeCode());
        row.put("hasEmployee", employee != null);
        return row;
    }

    private Map<String, Object> roleView(InstituteRole role) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", role.getId());
        row.put("name", role.getName());
        row.put("baseRole", role.getBaseRole());
        row.put("capabilitiesCsv", role.getCapabilitiesCsv() == null ? "" : role.getCapabilitiesCsv());
        row.put("capabilities", Packs.parseCaps(role.getCapabilitiesCsv()));
        return row;
    }

    private Map<String, Object> employeeLinkView(AppUser user, Employee e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("staffUserId", user.getId());
        out.put("employeeId", e.getId());
        out.put("employeeCode", e.getEmployeeCode());
        out.put("fullName", e.getFullName());
        out.put("hasEmployee", true);
        return out;
    }

    private Employee findEmployeeByUser(AppUser user) {
        if (user.getId() != null) {
            Employee byUser = store.list(Employee.class, user.getOrganizationId()).stream()
                    .filter(e -> user.getId().equals(e.getUserId()))
                    .findFirst()
                    .orElse(null);
            if (byUser != null) {
                return byUser;
            }
        }
        if (user.getEmail() != null) {
            return store.list(Employee.class, user.getOrganizationId()).stream()
                    .filter(e -> user.getEmail().equalsIgnoreCase(blank(e.getEmail(), "")))
                    .findFirst()
                    .orElse(null);
        }
        return null;
    }

    private int staffCount(UUID orgId) {
        return (int) store.em().createQuery("select u from AppUser u where u.organizationId = :o", AppUser.class)
                .setParameter("o", orgId)
                .getResultList()
                .stream()
                .filter(u -> STAFF_ROLES.contains(u.getRole()))
                .count();
    }

    private String nextEmployeeCode(UUID orgId) {
        int n = store.list(Employee.class, orgId).size() + 1;
        return "EMP-" + String.format("%04d", n);
    }

    private static String normalizeStaffRole(String role) {
        String r = role == null ? "" : role.trim().toUpperCase();
        if (!STAFF_ROLES.contains(r)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose faculty, counselor, accountant, or placement head");
        }
        return r;
    }

    private static String departmentForRole(String role) {
        return switch (role) {
            case Roles.COUNSELOR -> "Admissions";
            case Roles.ACCOUNTANT -> "Finance";
            case Roles.PLACEMENT_HEAD -> "Placement";
            default -> "Academics";
        };
    }

    private static String employmentForRole(String role) {
        return Roles.FACULTY.equals(role) ? "FACULTY" : "SUPPORT";
    }

    private static String prettyRole(String role) {
        return switch (role) {
            case Roles.COUNSELOR -> "Counselor";
            case Roles.ACCOUNTANT -> "Accountant";
            case Roles.PLACEMENT_HEAD -> "Placement head";
            default -> "Faculty";
        };
    }

    private static List<String> capsList(Map<String, Object> body) {
        Object raw = body.get("capabilities");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(String::valueOf).toList();
    }

    private void requireOwner() {
        Access.requireTenant(Auth.current());
        Access.requireAny(Auth.current(), Roles.OWNER);
    }

    private void requireSetupAccess() {
        Access.requireTenant(Auth.current());
        if (!Access.canWrite(Auth.current(), "SETUP") && !Access.hasCap(Auth.current(), Packs.CAP_STAFF_MANAGE)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only the owner or staff managers can do this");
        }
    }

    private Organization org() {
        return store.get(Organization.class, orgId());
    }

    private UUID orgId() {
        return Auth.current().organizationId();
    }

    private static String str(Map<String, ?> body, String key) {
        if (body == null || body.get(key) == null) {
            return "";
        }
        return String.valueOf(body.get(key)).trim();
    }

    private static String blank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
