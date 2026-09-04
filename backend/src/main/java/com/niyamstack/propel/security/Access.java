package com.niyamstack.propel.security;

import com.niyamstack.propel.catalog.Packs;
import com.niyamstack.propel.common.ApiException;
import org.springframework.http.HttpStatus;

import java.util.Set;

public final class Access {
    private Access() {}

    public static void requireWrite(PropelUser user, String area) {
        if (!canWrite(user, area)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This role cannot change " + area);
        }
    }

    public static void requirePlatform(PropelUser user) {
        if (user == null || !Roles.isPlatform(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Platform access only");
        }
    }

    public static void requireTenant(PropelUser user) {
        if (user == null || Roles.isPlatform(user.role()) || user.organizationId() == null) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Use the institute portal for this action");
        }
    }

    public static void requireAny(PropelUser user, String... roles) {
        for (String role : roles) {
            if (role.equals(user.role())) {
                return;
            }
        }
        throw new ApiException(HttpStatus.FORBIDDEN, "Not permitted");
    }

    public static void requireModule(PropelUser user, String module) {
        requireAnyModule(user, module);
    }

    public static void requireAnyModule(PropelUser user, String... modules) {
        if (user == null || Roles.isPlatform(user.role()) || user.organizationId() == null) {
            return;
        }
        if (Packs.hasAnyModule(user.modulesCsv(), modules)) {
            return;
        }
        String label = modules != null && modules.length > 0 ? modules[0] : "this module";
        throw new ApiException(HttpStatus.FORBIDDEN, "This institute pack does not include " + label.replace('_', ' ').toLowerCase());
    }

    public static void requireEntityModule(PropelUser user, Class<?> type) {
        requireAnyModule(user, Packs.modulesForEntity(type.getSimpleName()));
    }

    public static boolean canWrite(PropelUser user, String area) {
        String role = user.role();
        if (Roles.OWNER.equals(role)) {
            return true;
        }
        Set<String> caps = Packs.capsFor(role, user.capabilitiesCsv());
        return switch (area) {
            case "SETUP" -> caps.contains(Packs.CAP_STAFF_MANAGE);
            case "CRM" -> Roles.COUNSELOR.equals(role) || caps.contains(Packs.CAP_CRM);
            case "SIS" -> Roles.COUNSELOR.equals(role) || caps.contains(Packs.CAP_STUDENTS);
            case "LMS" -> Roles.FACULTY.equals(role) || caps.contains(Packs.CAP_EXAMS) || caps.contains(Packs.CAP_LMS);
            case "FEES" -> Roles.ACCOUNTANT.equals(role) || caps.contains(Packs.CAP_REFUND);
            case "PLACEMENT" -> Set.of(Roles.PLACEMENT_HEAD, Roles.RECRUITER).contains(role) || caps.contains(Packs.CAP_PLACEMENT);
            case "COMMS" -> Set.of(Roles.COUNSELOR, Roles.FACULTY, Roles.PLACEMENT_HEAD).contains(role);
            case "GROWTH" -> Roles.COUNSELOR.equals(role);
            case "ESS" -> Roles.ACCOUNTANT.equals(role) || Roles.FACULTY.equals(role)
                    || caps.contains(Packs.CAP_ESS_VIEW) || caps.contains(Packs.CAP_ESS_MANAGE);
            case "ADMIN" -> caps.contains(Packs.CAP_ANALYTICS);
            default -> false;
        };
    }

    public static boolean hasCap(PropelUser user, String cap) {
        if (user == null) {
            return false;
        }
        if (Roles.OWNER.equals(user.role())) {
            return true;
        }
        return Packs.capsFor(user.role(), user.capabilitiesCsv()).contains(cap);
    }

    public static boolean centerScoped(PropelUser user) {
        return Set.of(Roles.FACULTY, Roles.COUNSELOR, Roles.ACCOUNTANT).contains(user.role());
    }

    public static boolean canSeeAnswerKeys(PropelUser user) {
        return Set.of(Roles.OWNER, Roles.FACULTY).contains(user.role()) || hasCap(user, Packs.CAP_EXAMS);
    }

    public static int packageRank(String tier) {
        if (tier == null) {
            return 1;
        }
        return switch (tier.toUpperCase()) {
            case "GROWTH", "PRO" -> 2;
            case "ENTERPRISE", "PLUS", "SCALE" -> 3;
            default -> 1;
        };
    }

    public static int effectiveRank(PropelUser user) {
        int rank = packageRank(user == null ? null : user.packageTier());
        if (user != null && Packs.hasAnyModule(user.modulesCsv(),
                Packs.MOD_PLACEMENT, Packs.MOD_ANALYTICS, Packs.MOD_LMS, Packs.MOD_GROW)) {
            rank = Math.max(rank, packageRank("GROWTH"));
        }
        return rank;
    }

    public static void requirePackage(PropelUser user, String required) {
        if (effectiveRank(user) < packageRank(required)) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Feature requires " + required + " package (current: " + (user == null ? "none" : user.packageTier()) + ")");
        }
    }
}
