package com.niyamstack.propel.integration;

import com.niyamstack.propel.data.Store;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * RazorpayX payouts (contacts + fund accounts + payouts).
 * Uses the same platform Razorpay key ID/secret. When keys or the RazorpayX
 * current-account number are missing, {@link #live()} / payout returns NOT_CONFIGURED
 * so callers keep the batch in READY_AUTO for later.
 */
@Service
public class RazorpayXClient {
    private static final Logger log = LoggerFactory.getLogger(RazorpayXClient.class);
    private final Store store;
    private final String envKey;
    private final String envSecret;
    private final String envAccountNumber;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

    public RazorpayXClient(
            Store store,
            @Value("${app.integrations.payments.razorpay-key-id:}") String razorpayKey,
            @Value("${app.integrations.payments.razorpay-key-secret:}") String razorpaySecret,
            @Value("${app.integrations.payments.razorpayx-account-number:}") String razorpayxAccount
    ) {
        this.store = store;
        this.envKey = razorpayKey == null ? "" : razorpayKey.trim();
        this.envSecret = razorpaySecret == null ? "" : razorpaySecret.trim();
        this.envAccountNumber = razorpayxAccount == null ? "" : razorpayxAccount.trim();
    }

    public boolean live() {
        return keys() != null && !sourceAccountNumber().isBlank();
    }

    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("keysConfigured", keys() != null);
        out.put("accountConfigured", !sourceAccountNumber().isBlank());
        out.put("configured", live());
        out.put("provider", live() ? "razorpayx" : "demo");
        return out;
    }

    public record PayoutResult(
            boolean ok,
            String payoutId,
            String contactId,
            String fundAccountId,
            String message,
            String status
    ) {}

    public PayoutResult payout(
            String contactId,
            String fundAccountId,
            String name,
            String accountNumber,
            String ifsc,
            BigDecimal amountInr,
            String reference,
            String idempotencyKey
    ) {
        String[] keys = keys();
        if (keys == null) {
            return new PayoutResult(false, null, contactId, fundAccountId, "RazorpayX keys are not configured yet", "NOT_CONFIGURED");
        }
        String sourceAccount = sourceAccountNumber();
        if (sourceAccount.isBlank()) {
            return new PayoutResult(false, null, contactId, fundAccountId,
                    "Set razorpayxAccountNumber (RazorpayX current account) before automatic payouts", "NOT_CONFIGURED");
        }
        if (amountInr == null || amountInr.signum() <= 0) {
            return new PayoutResult(false, null, contactId, fundAccountId, "Payout amount must be positive", "INVALID");
        }
        if (accountNumber == null || accountNumber.isBlank() || ifsc == null || ifsc.isBlank()) {
            return new PayoutResult(false, null, contactId, fundAccountId, "Beneficiary bank details are incomplete", "INVALID");
        }
        try {
            String contact = contactId;
            if (contact == null || contact.isBlank()) {
                contact = createContact(keys, name);
            }
            String fund = fundAccountId;
            if (fund == null || fund.isBlank()) {
                fund = createFundAccount(keys, contact, name, accountNumber, ifsc);
            }
            long paise = amountInr.multiply(BigDecimal.valueOf(100)).longValueExact();
            String body = "{"
                    + "\"account_number\":\"" + escape(sourceAccount) + "\","
                    + "\"fund_account_id\":\"" + escape(fund) + "\","
                    + "\"amount\":" + paise + ","
                    + "\"currency\":\"INR\","
                    + "\"mode\":\"IMPS\","
                    + "\"purpose\":\"payout\","
                    + "\"queue_if_low_balance\":true,"
                    + "\"reference_id\":\"" + escape(safeRef(reference)) + "\","
                    + "\"narration\":\"Niyamstack settlement\""
                    + "}";
            HttpResponse<String> res = post(keys, "https://api.razorpay.com/v1/payouts", body, idempotencyKey);
            if (res.statusCode() >= 300) {
                log.warn("RazorpayX payout failed: {}", res.body());
                return new PayoutResult(false, null, contact, fund, "RazorpayX rejected the payout", "FAILED");
            }
            String id = extract(res.body(), "id");
            String status = extract(res.body(), "status");
            return new PayoutResult(true, id.isBlank() ? null : id, contact, fund, "Payout submitted",
                    status.isBlank() ? "processing" : status);
        } catch (Exception e) {
            log.warn("RazorpayX payout error: {}", e.getMessage());
            return new PayoutResult(false, null, contactId, fundAccountId,
                    e.getMessage() == null ? "RazorpayX error" : e.getMessage(), "ERROR");
        }
    }

    private String createContact(String[] keys, String name) throws Exception {
        String body = "{\"name\":\"" + escape(name) + "\",\"type\":\"vendor\",\"reference_id\":\""
                + UUID.randomUUID().toString().substring(0, 8) + "\"}";
        HttpResponse<String> res = post(keys, "https://api.razorpay.com/v1/contacts", body, null);
        if (res.statusCode() >= 300) {
            throw new IllegalStateException("Could not create RazorpayX contact");
        }
        String id = extract(res.body(), "id");
        if (id.isBlank()) {
            throw new IllegalStateException("RazorpayX contact id missing");
        }
        return id;
    }

    private String createFundAccount(String[] keys, String contactId, String name, String accountNumber, String ifsc) throws Exception {
        String body = "{"
                + "\"contact_id\":\"" + escape(contactId) + "\","
                + "\"account_type\":\"bank_account\","
                + "\"bank_account\":{"
                + "\"name\":\"" + escape(name) + "\","
                + "\"ifsc\":\"" + escape(ifsc.toUpperCase()) + "\","
                + "\"account_number\":\"" + escape(accountNumber) + "\""
                + "}}";
        HttpResponse<String> res = post(keys, "https://api.razorpay.com/v1/fund_accounts", body, null);
        if (res.statusCode() >= 300) {
            throw new IllegalStateException("Could not create RazorpayX fund account");
        }
        String id = extract(res.body(), "id");
        if (id.isBlank()) {
            throw new IllegalStateException("RazorpayX fund account id missing");
        }
        return id;
    }

    private HttpResponse<String> post(String[] keys, String url, String body, String idempotency) throws Exception {
        String auth = Base64.getEncoder().encodeToString((keys[0] + ":" + keys[1]).getBytes(StandardCharsets.UTF_8));
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                .header("Authorization", "Basic " + auth)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .timeout(Duration.ofSeconds(30));
        if (idempotency != null && !idempotency.isBlank()) {
            b.header("X-Payout-Idempotency", idempotency);
        }
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String[] keys() {
        String id = store.settingValue("razorpayKeyId");
        String secret = store.settingValue("razorpayKeySecret");
        if (!id.isBlank() && !secret.isBlank()) {
            return new String[] { id, secret };
        }
        if (!envKey.isBlank() && !envSecret.isBlank()) {
            return new String[] { envKey, envSecret };
        }
        return null;
    }

    private String sourceAccountNumber() {
        String fromStore = store.settingValue("razorpayxAccountNumber");
        if (!fromStore.isBlank()) {
            return fromStore;
        }
        return envAccountNumber;
    }

    private static String escape(String v) {
        if (v == null) {
            return "";
        }
        return v.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String safeRef(String value) {
        if (value == null || value.isBlank()) {
            return "propel";
        }
        String cleaned = value.replaceAll("[^A-Za-z0-9._-]", "");
        return cleaned.substring(0, Math.min(40, cleaned.length()));
    }

    private static String extract(String json, String key) {
        if (json == null) {
            return "";
        }
        String needle = "\"" + key + "\":\"";
        int i = json.indexOf(needle);
        if (i < 0) {
            return "";
        }
        int start = i + needle.length();
        int end = json.indexOf('"', start);
        return end < 0 ? "" : json.substring(start, end);
    }
}
