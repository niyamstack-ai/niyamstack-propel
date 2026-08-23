package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import org.springframework.http.HttpStatus;

public final class Gstins {
    private static final String PATTERN = "[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]";

    private Gstins() {}

    public static String normalize(String raw) {
        return raw == null ? "" : raw.trim().toUpperCase();
    }

    public static void requireValid(String raw) {
        String gstin = normalize(raw);
        if (gstin.isBlank()) {
            return;
        }
        if (gstin.length() != 15 || !gstin.matches(PATTERN)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid 15-character GSTIN");
        }
    }
}
