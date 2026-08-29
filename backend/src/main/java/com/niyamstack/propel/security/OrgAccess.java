package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.domain.Model.Organization;
import org.springframework.http.HttpStatus;

public final class OrgAccess {
    public static final String SUSPENDED_MESSAGE =
            "This institute is suspended. Contact Niyamstack to restore access.";
    public static final String SUBSCRIBE_MESSAGE =
            "You are not a paid user. Please subscribe to use this facility.";

    private OrgAccess() {}

    public static String status(Organization org) {
        if (org == null || org.getAccessStatus() == null || org.getAccessStatus().isBlank()) {
            return "ACTIVE";
        }
        return org.getAccessStatus().trim().toUpperCase();
    }

    public static boolean suspended(Organization org) {
        return "SUSPENDED".equals(status(org));
    }

    public static boolean demo(Organization org) {
        return "DEMO".equals(status(org));
    }

    public static void requireNotSuspended(Organization org) {
        if (suspended(org)) {
            throw new ApiException(HttpStatus.FORBIDDEN, SUSPENDED_MESSAGE);
        }
    }

    public static boolean writeBlockedForDemo(String method, String path) {
        if (method == null) {
            return false;
        }
        String verb = method.toUpperCase();
        if ("GET".equals(verb) || "HEAD".equals(verb) || "OPTIONS".equals(verb)) {
            return false;
        }
        String p = path == null ? "" : path;
        if (p.startsWith("/api/auth/password") || p.startsWith("/api/auth/profile") || p.equals("/api/auth/logout")) {
            return false;
        }
        return true;
    }
}
