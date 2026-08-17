package com.niyamstack.propel.security;

public final class Roles {
    public static final String PLATFORM_OWNER = "PLATFORM_OWNER";
    public static final String PLATFORM_STAFF = "PLATFORM_STAFF";
    public static final String PLATFORM_SALES = "PLATFORM_SALES";
    public static final String PLATFORM_SUPPORT = "PLATFORM_SUPPORT";
    public static final String PLATFORM_FINANCE = "PLATFORM_FINANCE";
    public static final String PLATFORM_HR = "PLATFORM_HR";
    public static final String PLATFORM_OPS = "PLATFORM_OPS";
    public static final String OWNER = "OWNER";
    public static final String PLACEMENT_HEAD = "PLACEMENT_HEAD";
    public static final String FACULTY = "FACULTY";
    public static final String COUNSELOR = "COUNSELOR";
    public static final String ACCOUNTANT = "ACCOUNTANT";
    public static final String STUDENT = "STUDENT";
    public static final String PARENT = "PARENT";
    public static final String RECRUITER = "RECRUITER";

    private Roles() {}

    public static boolean isPlatform(String role) {
        return role != null && role.startsWith("PLATFORM_");
    }
}
