package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OtpService {
    public static final String LOGIN = "LOGIN";
    public static final String SIGNUP = "SIGNUP";
    public static final String RESET = "RESET";

    private final String devCode;
    private final boolean reveal;
    private final ConcurrentHashMap<String, Challenge> challenges = new ConcurrentHashMap<>();

    public OtpService(
            @Value("${app.otp.dev-code:123456}") String devCode,
            @Value("${app.otp.reveal:false}") boolean reveal
    ) {
        this.devCode = devCode;
        this.reveal = reveal;
    }

    public record Issued(String phone, boolean reveal, String code) {}

    public Issued issue(String phone, String purpose) {
        Challenge challenge = new Challenge(devCode, purpose, Instant.now().plusSeconds(300), 0);
        challenges.put(key(phone, purpose), challenge);
        return new Issued(phone, reveal, reveal ? devCode : null);
    }

    public void verify(String phone, String purpose, String otp) {
        String k = key(phone, purpose);
        Challenge challenge = challenges.get(k);
        if (challenge == null || challenge.expires.isBefore(Instant.now())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "OTP expired. Request a new one.");
        }
        if (challenge.tries >= 5) {
            challenges.remove(k);
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many OTP attempts. Request a new one.");
        }
        challenge.tries++;
        String given = otp == null ? "" : otp.trim();
        boolean ok = challenge.code.equals(given) || (reveal && devCode.equals(given));
        if (!ok) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid OTP");
        }
        challenges.remove(k);
    }

    public boolean reveal() {
        return reveal;
    }

    public Map<String, Object> publicIssue(Issued issued) {
        if (issued.reveal && issued.code != null) {
            return Map.of("status", "otp_sent", "phone", issued.phone, "devOtp", issued.code);
        }
        return Map.of("status", "otp_sent", "phone", issued.phone);
    }

    private static String key(String phone, String purpose) {
        return purpose + ":" + phone;
    }

    private static final class Challenge {
        private final String code;
        private final String purpose;
        private final Instant expires;
        private int tries;

        private Challenge(String code, String purpose, Instant expires, int tries) {
            this.code = code;
            this.purpose = purpose;
            this.expires = expires;
            this.tries = tries;
        }
    }
}
