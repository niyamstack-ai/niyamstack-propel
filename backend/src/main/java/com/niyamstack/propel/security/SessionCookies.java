package com.niyamstack.propel.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;

import java.util.Map;

public final class SessionCookies {
    public static final String INSTITUTE = "propel_token";

    private SessionCookies() {}

    public static void attachInstitute(HttpServletResponse response, Map<String, Object> session) {
        if (response == null || session == null) {
            return;
        }
        Object raw = session.get("token");
        if (raw == null || raw.toString().isBlank()) {
            return;
        }
        ResponseCookie cookie = ResponseCookie.from(INSTITUTE, raw.toString())
                .httpOnly(true)
                .path("/")
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public static void clearInstitute(HttpServletResponse response) {
        if (response == null) {
            return;
        }
        ResponseCookie cookie = ResponseCookie.from(INSTITUTE, "")
                .httpOnly(true)
                .path("/")
                .maxAge(0)
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
