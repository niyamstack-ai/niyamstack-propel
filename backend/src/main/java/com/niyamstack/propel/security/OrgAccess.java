package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.domain.Model.Organization;
import org.springframework.http.HttpStatus;

public final class OrgAccess {
    public static final String SUSPENDED_MESSAGE =
            "This institute is suspended. Contact Niyamstack to restore access.";
    public static final String SUBSCRIBE_MESSAGE =
            "You are not a paid user. Please subscribe to use this facility.";
    public static final String PAST_DUE_MESSAGE =
            "Institute subscription payment failed. Renew to create courses and sell online.";
    public static final String STOREFRONT_INACTIVE_MESSAGE =
            "This institute is not accepting online enrollments right now.";
    public static final String BANK_REQUIRED_MESSAGE =
            "Add bank account details under Institute setup before selling courses online.";

    private OrgAccess() {}

    public static String status(Organization org) {
        if (org == null || org.getAccessStatus() == null || org.getAccessStatus().isBlank()) {
            return "ACTIVE";
        }
        return org.getAccessStatus().trim().toUpperCase();
    }

    public static String payment(Organization org) {
        if (org == null || org.getPaymentStatus() == null || org.getPaymentStatus().isBlank()) {
            return "UNPAID";
        }
        return org.getPaymentStatus().trim().toUpperCase();
    }

    public static boolean suspended(Organization org) {
        return "SUSPENDED".equals(status(org));
    }

    public static boolean demo(Organization org) {
        return "DEMO".equals(status(org));
    }

    public static boolean active(Organization org) {
        return "ACTIVE".equals(status(org));
    }

    public static boolean paymentFailed(Organization org) {
        return "FAILED".equals(payment(org));
    }

    /** Writes (create course, publish, etc.) only for fully active paid institutes. */
    public static boolean writeBlocked(Organization org) {
        if (org == null) {
            return true;
        }
        if (suspended(org) || demo(org) || "PENDING_APPROVAL".equals(status(org))) {
            return true;
        }
        if (paymentFailed(org)) {
            return true;
        }
        return !active(org);
    }

    public static String writeBlockMessage(Organization org) {
        if (suspended(org)) {
            return SUSPENDED_MESSAGE;
        }
        if (paymentFailed(org)) {
            return PAST_DUE_MESSAGE;
        }
        return SUBSCRIBE_MESSAGE;
    }

    public static void requireNotSuspended(Organization org) {
        if (suspended(org)) {
            throw new ApiException(HttpStatus.FORBIDDEN, SUSPENDED_MESSAGE);
        }
    }

    /** Public storefront may sell only when ACTIVE, not failed, and bank details present. */
    public static void requireCanSell(Organization org) {
        requireNotSuspended(org);
        if (!active(org) || paymentFailed(org) || !"PAID".equals(payment(org))) {
            throw new ApiException(HttpStatus.FORBIDDEN, STOREFRONT_INACTIVE_MESSAGE);
        }
        if (!hasBankDetails(org)) {
            throw new ApiException(HttpStatus.FORBIDDEN, BANK_REQUIRED_MESSAGE);
        }
    }

    public static boolean hasBankDetails(Organization org) {
        if (org == null) {
            return false;
        }
        String name = org.getBankAccountName() == null ? "" : org.getBankAccountName().trim();
        String number = org.getBankAccountNumber() == null ? "" : org.getBankAccountNumber().trim();
        String ifsc = org.getBankIfsc() == null ? "" : org.getBankIfsc().trim();
        return !name.isBlank() && !number.isBlank() && ifsc.length() >= 8;
    }

    public static boolean writeBlockedForDemo(String method, String path) {
        return writeBlockedForMethod(method, path);
    }

    public static boolean writeBlockedForMethod(String method, String path) {
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
        // Allow institute to save bank details while past-due so they can recover selling.
        if (p.equals("/api/organization") || p.startsWith("/api/organization?")) {
            return false;
        }
        return true;
    }
}
