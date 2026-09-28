package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.OtpChallenge;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;

@Service
public class OtpService {
    public static final String LOGIN = "LOGIN";
    public static final String SIGNUP = "SIGNUP";
    public static final String STUDENT_REGISTER = "STUDENT_REGISTER";
    public static final String RESET = "RESET";
    public static final String VERIFY_EMAIL = "VERIFY_EMAIL";
    public static final String VERIFY_PHONE = "VERIFY_PHONE";

    private final Store store;
    private final String devCode;
    private final boolean reveal;
    private final SecureRandom random = new SecureRandom();

    public OtpService(
            Store store,
            @Value("${app.otp.dev-code:123456}") String devCode,
            @Value("${app.otp.reveal:false}") boolean reveal
    ) {
        this.store = store;
        this.devCode = devCode == null || devCode.isBlank() ? "123456" : devCode.trim();
        this.reveal = reveal;
    }

    public record Issued(String phone, boolean reveal, String code) {}

    @Transactional
    public Issued issue(String phone, String purpose) {
        String code = reveal ? devCode : randomCode();
        String challengeKey = key(phone, purpose);
        OtpChallenge challenge = store.findOtpChallenge(challengeKey);
        if (challenge == null) {
            challenge = new OtpChallenge();
            challenge.setChallengeKey(challengeKey);
        }
        challenge.setPurpose(purpose);
        challenge.setCodeHash(hash(code));
        challenge.setExpiresAt(Instant.now().plusSeconds(300));
        challenge.setTries(0);
        store.save(challenge);
        return new Issued(phone, reveal, code);
    }

    @Transactional
    public void verify(String phone, String purpose, String otp) {
        String k = key(phone, purpose);
        OtpChallenge challenge = store.findOtpChallenge(k);
        if (challenge == null || challenge.getExpiresAt() == null || challenge.getExpiresAt().isBefore(Instant.now())) {
            if (challenge != null) {
                store.deleteOtpChallenge(challenge);
            }
            throw new ApiException(HttpStatus.BAD_REQUEST, "OTP expired. Request a new one.");
        }
        if (challenge.getTries() >= 5) {
            store.deleteOtpChallenge(challenge);
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many OTP attempts. Request a new one.");
        }
        challenge.setTries(challenge.getTries() + 1);
        store.save(challenge);
        String given = otp == null ? "" : otp.trim();
        boolean ok = hash(given).equals(challenge.getCodeHash()) || (reveal && devCode.equals(given));
        if (!ok) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid OTP");
        }
        store.deleteOtpChallenge(challenge);
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

    private String randomCode() {
        int n = random.nextInt(1_000_000);
        return String.format("%06d", n);
    }

    private static String key(String phone, String purpose) {
        return purpose + ":" + phone;
    }

    private static String hash(String code) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] dig = md.digest(code.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(dig);
        } catch (Exception e) {
            throw new IllegalStateException("OTP hash unavailable", e);
        }
    }
}
