package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ResetTokenService {
    private final ConcurrentHashMap<String, Entry> tokens = new ConcurrentHashMap<>();

    public String issue(UUID userId) {
        String token = UUID.randomUUID().toString().replace("-", "");
        tokens.put(token, new Entry(userId, Instant.now().plusSeconds(1800)));
        return token;
    }

    public UUID consume(String token) {
        Entry entry = tokens.remove(token == null ? "" : token);
        if (entry == null || entry.expires.isBefore(Instant.now())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Reset link is invalid or expired");
        }
        return entry.userId;
    }

    private record Entry(UUID userId, Instant expires) {}
}
