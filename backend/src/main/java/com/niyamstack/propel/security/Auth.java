package com.niyamstack.propel.security;

import org.springframework.security.core.context.SecurityContextHolder;

public final class Auth {
    private Auth() {}

    public static PropelUser current() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof PropelUser user)) {
            throw new com.niyamstack.propel.common.ApiException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "Sign in required");
        }
        return user;
    }
}
