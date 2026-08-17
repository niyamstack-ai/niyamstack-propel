package com.niyamstack.propel.security;

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

    public static boolean canWrite(PropelUser user, String area) {
        String role = user.role();
        if (Roles.OWNER.equals(role)) {
            return true;
        }
        return switch (area) {
            case "SETUP" -> false;
            case "CRM" -> Set.of(Roles.COUNSELOR).contains(role);
            case "SIS" -> Set.of(Roles.COUNSELOR, Roles.FACULTY).contains(role);
            case "LMS" -> Set.of(Roles.FACULTY, Roles.STUDENT).contains(role);
            case "FEES" -> Set.of(Roles.ACCOUNTANT).contains(role);
            case "PLACEMENT" -> Set.of(Roles.PLACEMENT_HEAD, Roles.RECRUITER, Roles.STUDENT).contains(role);
            case "COMMS" -> Set.of(Roles.COUNSELOR, Roles.FACULTY, Roles.PLACEMENT_HEAD).contains(role);
            case "GROWTH" -> Set.of(Roles.COUNSELOR).contains(role);
            case "ADMIN" -> false;
            default -> false;
        };
    }

    public static boolean centerScoped(PropelUser user) {
        return Set.of(Roles.FACULTY, Roles.COUNSELOR, Roles.ACCOUNTANT).contains(user.role());
    }

    public static boolean canSeeAnswerKeys(PropelUser user) {
        return Set.of(Roles.OWNER, Roles.FACULTY).contains(user.role());
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

    public static void requirePackage(PropelUser user, String required) {
        if (packageRank(user.packageTier()) < packageRank(required)) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Feature requires " + required + " package (current: " + user.packageTier() + ")");
        }
    }
}
