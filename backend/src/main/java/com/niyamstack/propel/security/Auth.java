package com.niyamstack.propel.security;

import org.springframework.security.core.context.SecurityContextHolder;

public final class Auth {
    private Auth() {}

    public static PropelUser current() {
        PropelUser user = optional();
        if (user == null) {
            throw new com.niyamstack.propel.common.ApiException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "Sign in required");
        }
        return user;
    }

    public static PropelUser optional() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof PropelUser user)) {
            return null;
        }
        return user;
    }
}
