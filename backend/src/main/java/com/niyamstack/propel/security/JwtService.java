package com.niyamstack.propel.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {
    private final SecretKey key;
    private final long expirationMs;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-ms}") long expirationMs
    ) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("app.jwt.secret must be at least 32 bytes");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.expirationMs = expirationMs;
    }

    public String issue(PropelUser user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.userId().toString())
                .claim("org", user.organizationId() == null ? null : user.organizationId().toString())
                .claim("center", user.centerId() == null ? null : user.centerId().toString())
                .claim("email", user.email())
                .claim("name", user.name())
                .claim("role", user.role())
                .claim("tier", user.packageTier())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(expirationMs)))
                .signWith(key)
                .compact();
    }

    public PropelUser parse(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        String org = claims.get("org", String.class);
        String center = claims.get("center", String.class);
        return new PropelUser(
                UUID.fromString(claims.getSubject()),
                org == null ? null : UUID.fromString(org),
                center == null ? null : UUID.fromString(center),
                claims.get("email", String.class),
                claims.get("name", String.class),
                claims.get("role", String.class),
                claims.get("tier", String.class)
        );
    }
}
