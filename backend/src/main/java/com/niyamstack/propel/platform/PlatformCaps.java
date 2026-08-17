package com.niyamstack.propel.platform;

import com.niyamstack.propel.security.Roles;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class PlatformCaps {
    public static final String VIEW_DASHBOARD = "VIEW_DASHBOARD";
    public static final String VIEW_INSTITUTES = "VIEW_INSTITUTES";
    public static final String EDIT_DEAL = "EDIT_DEAL";
    public static final String MARK_PAID = "MARK_PAID";
    public static final String APPROVE = "APPROVE";
    public static final String SUSPEND = "SUSPEND";
    public static final String MANAGE_EMPLOYEES = "MANAGE_EMPLOYEES";
    public static final String MANAGE_RIGHTS = "MANAGE_RIGHTS";

    public static final List<String> ALL = List.of(
            VIEW_DASHBOARD,
            VIEW_INSTITUTES,
            EDIT_DEAL,
            MARK_PAID,
            APPROVE,
            SUSPEND,
            MANAGE_EMPLOYEES,
            MANAGE_RIGHTS
    );

    public static final List<String> STAFF_ROLES = List.of(
            Roles.PLATFORM_SALES,
            Roles.PLATFORM_SUPPORT,
            Roles.PLATFORM_FINANCE,
            Roles.PLATFORM_HR,
            Roles.PLATFORM_OPS
    );

    private PlatformCaps() {}

    public static Map<String, List<String>> defaults() {
        Map<String, List<String>> map = new LinkedHashMap<>();
        map.put(Roles.PLATFORM_SALES, List.of(VIEW_DASHBOARD, VIEW_INSTITUTES, EDIT_DEAL));
        map.put(Roles.PLATFORM_SUPPORT, List.of(VIEW_DASHBOARD, VIEW_INSTITUTES));
        map.put(Roles.PLATFORM_FINANCE, List.of(VIEW_DASHBOARD, VIEW_INSTITUTES, EDIT_DEAL, MARK_PAID));
        map.put(Roles.PLATFORM_HR, List.of(VIEW_DASHBOARD, MANAGE_EMPLOYEES));
        map.put(Roles.PLATFORM_OPS, List.of(VIEW_DASHBOARD, VIEW_INSTITUTES, EDIT_DEAL, MARK_PAID, APPROVE, SUSPEND));
        return map;
    }

    public static boolean allowed(String role) {
        return Roles.PLATFORM_OWNER.equals(role) || STAFF_ROLES.contains(role);
    }

    public static String label(String cap) {
        return switch (cap) {
            case VIEW_DASHBOARD -> "View dashboard";
            case VIEW_INSTITUTES -> "View institutes";
            case EDIT_DEAL -> "Set customer price and modules";
            case MARK_PAID -> "Mark payment received / failed";
            case APPROVE -> "Approve / activate institute";
            case SUSPEND -> "Suspend institute";
            case MANAGE_EMPLOYEES -> "Add and manage employees";
            case MANAGE_RIGHTS -> "Change staff rights";
            default -> cap;
        };
    }

    public static String roleLabel(String role) {
        return switch (role) {
            case Roles.PLATFORM_OWNER -> "Owner";
            case Roles.PLATFORM_SALES -> "Sales";
            case Roles.PLATFORM_SUPPORT -> "Support";
            case Roles.PLATFORM_FINANCE -> "Finance";
            case Roles.PLATFORM_HR -> "HR";
            case Roles.PLATFORM_OPS -> "Operations";
            default -> role;
        };
    }

    public static Set<String> allCaps() {
        return Set.copyOf(ALL);
    }
}
