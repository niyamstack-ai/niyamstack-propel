package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import org.springframework.http.HttpStatus;

import java.util.regex.Pattern;

public final class PasswordPolicy {
    private static final Pattern UPPER = Pattern.compile("[A-Z]");
    private static final Pattern LOWER = Pattern.compile("[a-z]");
    private static final Pattern DIGIT = Pattern.compile("[0-9]");
    private static final Pattern SPECIAL = Pattern.compile("[^A-Za-z0-9]");

    private PasswordPolicy() {}

    public static String temporary() {
        return "Welcome@" + String.format("%05d", System.currentTimeMillis() % 100_000);
    }

    public static void validate(String password) {
        if (password == null || password.length() < 10) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be at least 10 characters");
        }
        if (!UPPER.matcher(password).find() || !LOWER.matcher(password).find()
                || !DIGIT.matcher(password).find() || !SPECIAL.matcher(password).find()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Password must include upper, lower, digit, and special character");
        }
    }
}
