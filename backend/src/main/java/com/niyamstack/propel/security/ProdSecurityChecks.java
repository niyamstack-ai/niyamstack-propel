package com.niyamstack.propel.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

@Component
@Profile("prod")
public class ProdSecurityChecks {
    private final String jwtSecret;

    public ProdSecurityChecks(@Value("${app.jwt.secret}") String jwtSecret) {
        this.jwtSecret = jwtSecret;
    }

    @PostConstruct
    void verify() {
        if (jwtSecret == null || jwtSecret.length() < 32 || jwtSecret.contains("change-in-production")) {
            throw new IllegalStateException("Set PROPEL_JWT_SECRET (32+ characters) before starting with the prod profile");
        }
    }
}
