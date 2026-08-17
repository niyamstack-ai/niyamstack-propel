package com.niyamstack.propel.platform;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.domain.Model.PlatformRole;
import com.niyamstack.propel.domain.Model.PlatformUserRole;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.JwtService;
import com.niyamstack.propel.security.PasswordPolicy;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class PlatformService {
    public static final String DEFAULT_MODULES = "STUDENTS,CRM,LMS,FEES";

    private final Store store;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final AuditService audit;

    public PlatformService(Store store, PasswordEncoder encoder, JwtService jwt, AuditService audit) {
        this.store = store;
        this.encoder = encoder;
        this.jwt = jwt;
        this.audit = audit;
    }

    @Transactional
    public Map<String, Object> login(String username, String password) {
        String id = username == null ? "" : username.trim().toLowerCase();
        AppUser user = store.findUserByEmail(id);
        if (user == null || !Roles.isPlatform(user.getRole()) || !user.isActive()
                || !encoder.matches(password, user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid id or password");
        }
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.LOCKED, "Account temporarily locked");
        }
        user.setFailedLogins(0);
        user.setLockedUntil(null);
        store.save(user);
        audit.log("PLATFORM_LOGIN", "AppUser", user.getId(), user.getEmail());
        return session(user);
    }

    @Transactional
    public Map<String, String> changePassword(String current, String next) {
        PropelUser principal = Auth.current();
        Access.requirePlatform(principal);
        AppUser user = store.get(AppUser.class, principal.userId());
        if (!encoder.matches(current, user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Current password is incorrect");
        }
        PasswordPolicy.validate(next);
        user.setPasswordHash(encoder.encode(next));
        user.setPasswordChangedAt(Instant.now());
        store.save(user);
        audit.log("PLATFORM_PASSWORD_CHANGE", "AppUser", user.getId(), null);
        return Map.of("status", "updated");
    }

    public Map<String, Object> me() {
        Access.requirePlatform(Auth.current());
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        return profile(user);
    }

    public Map<String, Object> dashboard() {
        requireCap(PlatformCaps.VIEW_DASHBOARD);
        List<Organization> orgs = store.listOrganizations();
        Instant weekAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        int demo = 0;
        int unpaid = 0;
        int paidPending = 0;
        int active = 0;
        int suspended = 0;
        int failed = 0;
        int newSignups = 0;
        BigDecimal mrr = BigDecimal.ZERO;
        for (Organization org : orgs) {
            String access = nz(org.getAccessStatus(), "DEMO");
            String pay = nz(org.getPaymentStatus(), "UNPAID");
            if (org.getCreatedAt() != null && org.getCreatedAt().isAfter(weekAgo)) {
                newSignups++;
            }
            if ("DEMO".equals(access)) {
                demo++;
            }
            if ("UNPAID".equals(pay)) {
                unpaid++;
            }
            if ("FAILED".equals(pay)) {
                failed++;
            }
            if ("PAID".equals(pay) && ("PENDING_APPROVAL".equals(access) || "DEMO".equals(access))) {
                paidPending++;
            }
            if ("ACTIVE".equals(access)) {
                active++;
                mrr = mrr.add(monthlyValue(org));
            }
            if ("SUSPENDED".equals(access)) {
                suspended++;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("institutes", orgs.size());
        out.put("newSignups", newSignups);
        out.put("demo", demo);
        out.put("unpaid", unpaid);
        out.put("paidPending", paidPending);
        out.put("active", active);
        out.put("suspended", suspended);
        out.put("failedPay", failed);
        out.put("mrr", mrr.setScale(2, RoundingMode.HALF_UP));
        return out;
    }

    public List<Map<String, Object>> institutes() {
        requireCap(PlatformCaps.VIEW_INSTITUTES);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Organization org : store.listOrganizations()) {
            rows.add(toView(org));
        }
        return rows;
    }

    public Map<String, Object> institute(UUID id) {
        requireCap(PlatformCaps.VIEW_INSTITUTES);
        return toView(store.get(Organization.class, id));
    }

    @Transactional
    public Map<String, Object> saveDeal(UUID id, DealRequest body) {
        requireCap(PlatformCaps.EDIT_DEAL);
        Organization org = store.get(Organization.class, id);
        if (body.dealAmount() != null) {
            org.setDealAmount(body.dealAmount());
        }
        if (body.billingCycle() != null && !body.billingCycle().isBlank()) {
            org.setBillingCycle(normalizeCycle(body.billingCycle()));
        } else if (org.getBillingCycle() == null || org.getBillingCycle().isBlank()) {
            org.setBillingCycle("MONTHLY");
        }
        if (body.modulesCsv() != null) {
            org.setModulesCsv(body.modulesCsv().trim().toUpperCase());
        }
        if (body.maxStudents() != null) {
            org.setMaxStudents(body.maxStudents());
        }
        if (body.maxCenters() != null) {
            org.setMaxCenters(body.maxCenters());
        }
        if (body.couponCode() != null) {
            org.setCouponCode(body.couponCode().trim());
        }
        if (body.dealNotes() != null) {
            org.setDealNotes(body.dealNotes().trim());
        }
        if (body.packageTier() != null && !body.packageTier().isBlank()) {
            org.setPackageTier(body.packageTier().trim().toUpperCase());
        }
        store.save(org);
        audit.log("PLATFORM_DEAL_SAVE", "Organization", org.getId(), org.getName());
        return toView(org);
    }

    @Transactional
    public Map<String, Object> markPaid(UUID id) {
        requireCap(PlatformCaps.MARK_PAID);
        Organization org = store.get(Organization.class, id);
        org.setPaymentStatus("PAID");
        org.setPaidAt(Instant.now());
        if (!"ACTIVE".equals(org.getAccessStatus())) {
            org.setAccessStatus("PENDING_APPROVAL");
        }
        store.save(org);
        audit.log("PLATFORM_MARK_PAID", "Organization", org.getId(), org.getName());
        return toView(org);
    }

    @Transactional
    public Map<String, Object> markFailed(UUID id) {
        requireCap(PlatformCaps.MARK_PAID);
        Organization org = store.get(Organization.class, id);
        org.setPaymentStatus("FAILED");
        store.save(org);
        audit.log("PLATFORM_PAY_FAILED", "Organization", org.getId(), org.getName());
        return toView(org);
    }

    @Transactional
    public Map<String, Object> approve(UUID id) {
        requireCap(PlatformCaps.APPROVE);
        Organization org = store.get(Organization.class, id);
        if (!"PAID".equals(nz(org.getPaymentStatus(), "UNPAID"))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Mark payment received before activating this institute");
        }
        org.setAccessStatus("ACTIVE");
        org.setApprovedAt(Instant.now());
        org.setApprovedBy(Auth.current().userId());
        store.save(org);
        audit.log("PLATFORM_APPROVE", "Organization", org.getId(), org.getName());
        return toView(org);
    }

    @Transactional
    public Map<String, Object> suspend(UUID id) {
        requireCap(PlatformCaps.SUSPEND);
        Organization org = store.get(Organization.class, id);
        org.setAccessStatus("SUSPENDED");
        store.save(org);
        audit.log("PLATFORM_SUSPEND", "Organization", org.getId(), org.getName());
        return toView(org);
    }

    public List<Map<String, Object>> employees() {
        requireCap(PlatformCaps.MANAGE_EMPLOYEES);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (AppUser user : store.listPlatformUsers()) {
            rows.add(employeeView(user));
        }
        return rows;
    }

    @Transactional
    public Map<String, Object> createEmployee(EmployeeRequest body) {
        requireCap(PlatformCaps.MANAGE_EMPLOYEES);
        String email = body.email() == null ? "" : body.email().trim().toLowerCase();
        if (body.fullName() == null || body.fullName().isBlank() || email.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name and login id are required");
        }
        if (store.findUserByEmail(email) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this id already exists");
        }
        PasswordPolicy.validate(body.password());
        AppUser user = new AppUser();
        user.setFullName(body.fullName().trim());
        user.setEmail(email);
        user.setPasswordHash(encoder.encode(body.password()));
        user.setRole(Roles.PLATFORM_STAFF);
        user.setActive(true);
        store.save(user);
        assignRoles(user.getId(), body.roleIds());
        audit.log("PLATFORM_EMPLOYEE_CREATE", "AppUser", user.getId(), email);
        return employeeView(user);
    }

    @Transactional
    public Map<String, Object> updateEmployee(UUID id, EmployeeUpdate body) {
        requireCap(PlatformCaps.MANAGE_EMPLOYEES);
        AppUser user = store.get(AppUser.class, id);
        if (user.getOrganizationId() != null || !Roles.isPlatform(user.getRole())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Employee not found");
        }
        if (Roles.PLATFORM_OWNER.equals(user.getRole()) && Boolean.FALSE.equals(body.active())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "The platform owner cannot be disabled");
        }
        if (body.fullName() != null && !body.fullName().isBlank()) {
            user.setFullName(body.fullName().trim());
        }
        if (body.active() != null) {
            user.setActive(body.active());
        }
        if (body.password() != null && !body.password().isBlank()) {
            PasswordPolicy.validate(body.password());
            user.setPasswordHash(encoder.encode(body.password()));
            user.setPasswordChangedAt(Instant.now());
        }
        store.save(user);
        if (body.roleIds() != null) {
            if (Roles.PLATFORM_OWNER.equals(user.getRole())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Do not change the owner roles here");
            }
            assignRoles(user.getId(), body.roleIds());
        }
        audit.log("PLATFORM_EMPLOYEE_UPDATE", "AppUser", user.getId(), user.getEmail());
        return employeeView(user);
    }

    public Map<String, Object> roleCatalog() {
        Access.requirePlatform(Auth.current());
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        List<String> caps = capsForUser(user);
        if (!caps.contains(PlatformCaps.MANAGE_RIGHTS) && !caps.contains(PlatformCaps.MANAGE_EMPLOYEES)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Not permitted");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("capabilities", PlatformCaps.ALL.stream().map(cap -> Map.of(
                "id", cap,
                "label", PlatformCaps.label(cap)
        )).toList());
        out.put("roles", store.listPlatformRoles().stream().map(this::roleView).toList());
        return out;
    }

    @Transactional
    public Map<String, Object> createRole(RoleRequest body) {
        requireCap(PlatformCaps.MANAGE_RIGHTS);
        String name = requireRoleName(body.name());
        if (store.listPlatformRoles().stream().anyMatch(r -> r.getName().equalsIgnoreCase(name))) {
            throw new ApiException(HttpStatus.CONFLICT, "A role with this name already exists");
        }
        PlatformRole role = new PlatformRole();
        role.setName(name);
        role.setCapabilitiesCsv(capsCsv(body.capabilities()));
        store.save(role);
        audit.log("PLATFORM_ROLE_CREATE", "PlatformRole", role.getId(), name);
        return roleView(role);
    }

    @Transactional
    public Map<String, Object> updateRole(UUID id, RoleRequest body) {
        requireCap(PlatformCaps.MANAGE_RIGHTS);
        PlatformRole role = store.get(PlatformRole.class, id);
        if (body.name() != null && !body.name().isBlank()) {
            String name = requireRoleName(body.name());
            boolean taken = store.listPlatformRoles().stream()
                    .anyMatch(r -> !r.getId().equals(id) && r.getName().equalsIgnoreCase(name));
            if (taken) {
                throw new ApiException(HttpStatus.CONFLICT, "A role with this name already exists");
            }
            role.setName(name);
        }
        if (body.capabilities() != null) {
            role.setCapabilitiesCsv(capsCsv(body.capabilities()));
        }
        store.save(role);
        audit.log("PLATFORM_ROLE_UPDATE", "PlatformRole", role.getId(), role.getName());
        return roleView(role);
    }

    @Transactional
    public void deleteRole(UUID id) {
        requireCap(PlatformCaps.MANAGE_RIGHTS);
        if (store.countUsersWithRole(id) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Remove this role from employees before deleting it");
        }
        PlatformRole role = store.get(PlatformRole.class, id);
        store.em().remove(role);
        audit.log("PLATFORM_ROLE_DELETE", "PlatformRole", id, role.getName());
    }

    public Map<String, Object> rights() {
        return roleCatalog();
    }

    public record EmployeeRequest(String fullName, String email, String password, List<UUID> roleIds) {}

    public record EmployeeUpdate(String fullName, Boolean active, String password, List<UUID> roleIds) {}

    public record RoleRequest(String name, List<String> capabilities) {}

    public record DealRequest(
            BigDecimal dealAmount,
            String billingCycle,
            String modulesCsv,
            Integer maxStudents,
            Integer maxCenters,
            String couponCode,
            String dealNotes,
            String packageTier
    ) {}

    private Map<String, Object> session(AppUser user) {
        PropelUser principal = new PropelUser(
                user.getId(),
                null,
                null,
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                "PLATFORM");
        return Map.of("token", jwt.issue(principal), "user", profile(user));
    }

    private Map<String, Object> profile(AppUser user) {
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", user.getId());
        profile.put("name", user.getFullName());
        profile.put("email", user.getEmail());
        profile.put("role", user.getRole());
        profile.put("capabilities", capsForUser(user));
        profile.put("roles", assignedRoles(user.getId()));
        return profile;
    }

    private Map<String, Object> employeeView(AppUser user) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", user.getId());
        row.put("name", user.getFullName());
        row.put("email", user.getEmail());
        row.put("role", user.getRole());
        row.put("roles", assignedRoles(user.getId()));
        row.put("active", user.isActive());
        row.put("capabilities", capsForUser(user));
        return row;
    }

    private Map<String, Object> roleView(PlatformRole role) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", role.getId());
        row.put("name", role.getName());
        row.put("capabilities", splitCaps(role.getCapabilitiesCsv()));
        return row;
    }

    private void requireCap(String cap) {
        Access.requirePlatform(Auth.current());
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        if (!capsForUser(user).contains(cap)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This role cannot " + PlatformCaps.label(cap).toLowerCase());
        }
    }

    private List<String> capsForUser(AppUser user) {
        if (Roles.PLATFORM_OWNER.equals(user.getRole())) {
            return PlatformCaps.ALL;
        }
        LinkedHashSet<String> caps = new LinkedHashSet<>();
        for (PlatformUserRole link : store.listUserRoles(user.getId())) {
            PlatformRole role = store.get(PlatformRole.class, link.getRoleId());
            caps.addAll(splitCaps(role.getCapabilitiesCsv()));
        }
        return new ArrayList<>(caps);
    }

    private List<Map<String, Object>> assignedRoles(UUID userId) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (PlatformUserRole link : store.listUserRoles(userId)) {
            PlatformRole role = store.get(PlatformRole.class, link.getRoleId());
            rows.add(Map.of("id", role.getId(), "name", role.getName()));
        }
        return rows;
    }

    private void assignRoles(UUID userId, List<UUID> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Select at least one role for this employee");
        }
        store.deleteUserRoles(userId);
        store.em().flush();
        LinkedHashSet<UUID> unique = new LinkedHashSet<>(roleIds);
        for (UUID roleId : unique) {
            store.get(PlatformRole.class, roleId);
            PlatformUserRole link = new PlatformUserRole();
            link.setUserId(userId);
            link.setRoleId(roleId);
            store.save(link);
        }
    }

    private static List<String> splitCaps(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        List<String> caps = new ArrayList<>();
        for (String part : csv.split(",")) {
            String cap = part.trim();
            if (PlatformCaps.ALL.contains(cap)) {
                caps.add(cap);
            }
        }
        return caps;
    }

    private static String capsCsv(List<String> capabilities) {
        if (capabilities == null) {
            return "";
        }
        return String.join(",", capabilities.stream().filter(PlatformCaps.ALL::contains).distinct().toList());
    }

    private static String requireRoleName(String raw) {
        if (raw == null || raw.trim().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Role name is required");
        }
        String name = raw.trim();
        if (name.length() > 80) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Role name is too long");
        }
        return name;
    }

    private static Map<String, Object> toView(Organization org) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", org.getId());
        row.put("name", org.getName());
        row.put("legalName", org.getLegalName());
        row.put("slug", org.getSlug());
        row.put("email", org.getEmail());
        row.put("phone", org.getPhone());
        row.put("gstin", org.getGstin());
        row.put("packageTier", org.getPackageTier());
        row.put("accessStatus", nz(org.getAccessStatus(), "DEMO"));
        row.put("paymentStatus", nz(org.getPaymentStatus(), "UNPAID"));
        row.put("billingCycle", org.getBillingCycle());
        row.put("dealAmount", org.getDealAmount());
        row.put("modulesCsv", org.getModulesCsv());
        row.put("maxStudents", org.getMaxStudents());
        row.put("maxCenters", org.getMaxCenters());
        row.put("couponCode", org.getCouponCode());
        row.put("dealNotes", org.getDealNotes());
        row.put("createdAt", org.getCreatedAt());
        row.put("paidAt", org.getPaidAt());
        row.put("approvedAt", org.getApprovedAt());
        return row;
    }

    private static BigDecimal monthlyValue(Organization org) {
        if (org.getDealAmount() == null) {
            return BigDecimal.ZERO;
        }
        String cycle = nz(org.getBillingCycle(), "MONTHLY");
        return switch (cycle) {
            case "QUARTERLY" -> org.getDealAmount().divide(new BigDecimal("3"), 2, RoundingMode.HALF_UP);
            case "YEARLY" -> org.getDealAmount().divide(new BigDecimal("12"), 2, RoundingMode.HALF_UP);
            default -> org.getDealAmount();
        };
    }

    private static String normalizeCycle(String cycle) {
        String value = cycle.trim().toUpperCase();
        if (!value.equals("MONTHLY") && !value.equals("QUARTERLY") && !value.equals("YEARLY")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Billing cycle must be monthly, quarterly, or yearly");
        }
        return value;
    }

    private static String nz(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
