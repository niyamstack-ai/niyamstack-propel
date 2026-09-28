package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
public class ResetTokenService {
    private static final String PREFIX = "RESET_TOKEN:";
    private final PendingFlowService flows;

    public ResetTokenService(PendingFlowService flows) {
        this.flows = flows;
    }

    @Transactional
    public String issue(UUID userId) {
        String token = UUID.randomUUID().toString().replace("-", "");
        flows.put(PREFIX + token, "RESET", userId.toString(), Instant.now().plusSeconds(1800));
        return token;
    }

    @Transactional
    public UUID consume(String token) {
        String payload = flows.consume(PREFIX + (token == null ? "" : token));
        if (payload == null || payload.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Reset link is invalid or expired");
        }
        try {
            return UUID.fromString(payload.trim());
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Reset link is invalid or expired");
        }
    }
}
