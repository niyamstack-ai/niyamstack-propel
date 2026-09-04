package com.niyamstack.propel.integration;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.Organization;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Service
public class ConfigurablePaymentGateway implements PaymentGateway {
    private static final Logger log = LoggerFactory.getLogger(ConfigurablePaymentGateway.class);
    private final Store store;
    private final String envKey;
    private final String envSecret;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(12)).build();

    public ConfigurablePaymentGateway(
            Store store,
            @Value("${app.integrations.payments.razorpay-key-id:}") String razorpayKey,
            @Value("${app.integrations.payments.razorpay-key-secret:}") String razorpaySecret
    ) {
        this.store = store;
        this.envKey = razorpayKey == null ? "" : razorpayKey.trim();
        this.envSecret = razorpaySecret == null ? "" : razorpaySecret.trim();
    }

    @Override
    public String provider() {
        return live() ? "razorpay" : "demo";
    }

    @Override
    public boolean live() {
        return !envKey.isBlank() && !envSecret.isBlank();
    }

    @Override
    public boolean live(UUID orgId) {
        return keys(orgId) != null;
    }

    @Override
    public String provider(UUID orgId) {
        return live(orgId) ? "razorpay" : "demo";
    }

    @Override
    public String publicKey(UUID orgId) {
        String[] keys = keys(orgId);
        return keys == null ? "" : keys[0];
    }

    @Override
    public ChargeResult charge(UUID orgId, BigDecimal amount, String method, String reference) {
        return createOrder(orgId, amount, reference, Map.of());
    }

    @Override
    public ChargeResult createOrder(UUID orgId, BigDecimal amount, String reference, Map<String, String> notes) {
        String[] keys = keys(orgId);
        if (keys == null) {
            return new ChargeResult(true, "DEMO-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                    "No Razorpay keys yet — recorded in Propel only", Map.of("live", false, "provider", "demo"));
        }
        long paise = amount.multiply(BigDecimal.valueOf(100)).longValue();
        String receipt = safe(reference);
        String notesJson = notesJson(notes);
        String body = "{\"amount\":" + paise + ",\"currency\":\"INR\",\"receipt\":\"" + receipt + "\",\"notes\":" + notesJson + "}";
        try {
            HttpResponse<String> res = post(keys, "https://api.razorpay.com/v1/orders", body);
            if (res.statusCode() >= 300) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Razorpay rejected the order. Check the key ID and secret.");
            }
            String id = extract(res.body(), "id");
            return new ChargeResult(true, id.isBlank() ? "order_pending" : id,
                    "Razorpay order created", Map.of("live", true, "provider", "razorpay", "keyId", keys[0]));
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Razorpay order failed: {}", e.getMessage());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Could not reach Razorpay. Try again or check keys in Integrations.");
        }
    }

    @Override
    public boolean verifyCheckout(UUID orgId, String orderId, String paymentId, String signature) {
        String[] keys = keys(orgId);
        if (keys == null) {
            return false;
        }
        if (orderId == null || paymentId == null || signature == null || signature.isBlank()) {
            return false;
        }
        return hmac(keys[1], orderId + "|" + paymentId).equalsIgnoreCase(signature.trim());
    }

    @Override
    public String refundPayment(UUID orgId, String razorpayPaymentId, BigDecimal amount) {
        String[] keys = keys(orgId);
        if (keys == null || razorpayPaymentId == null || !razorpayPaymentId.startsWith("pay_")) {
            return "";
        }
        long paise = amount.multiply(BigDecimal.valueOf(100)).longValue();
        try {
            HttpResponse<String> res = post(keys, "https://api.razorpay.com/v1/payments/" + razorpayPaymentId + "/refund",
                    "{\"amount\":" + paise + "}");
            if (res.statusCode() >= 300) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Razorpay could not refund this payment.");
            }
            String id = extract(res.body(), "id");
            return id.isBlank() ? "rfnd" : id;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Razorpay refund failed: {}", e.getMessage());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Could not reach Razorpay to refund.");
        }
    }

    @Override
    public boolean verifyWebhook(UUID orgId, String payload, String signature) {
        Organization org = orgId == null ? null : store.get(Organization.class, orgId);
        String secret = OrgSecrets.live(org, "razorpayWebhookSecret");
        if (secret.isBlank()) {
            String[] keys = keys(orgId);
            secret = keys == null ? "" : keys[1];
        }
        if (secret.isBlank() || payload == null || signature == null) {
            return false;
        }
        return hmac(secret, payload).equalsIgnoreCase(signature.trim());
    }

    private HttpResponse<String> post(String[] keys, String url, String body) throws Exception {
        String auth = Base64.getEncoder().encodeToString((keys[0] + ":" + keys[1]).getBytes(StandardCharsets.UTF_8));
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .header("Authorization", "Basic " + auth)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(20))
                .build();
        return http.send(req, HttpResponse.BodyHandlers.ofString());
    }

    private String[] keys(UUID orgId) {
        if (orgId != null) {
            Organization org = store.get(Organization.class, orgId);
            String id = OrgSecrets.live(org, "razorpayKeyId");
            String secret = OrgSecrets.live(org, "razorpayKeySecret");
            if (!id.isBlank() && !secret.isBlank()) {
                return new String[] { id, secret };
            }
        }
        if (!envKey.isBlank() && !envSecret.isBlank()) {
            return new String[] { envKey, envSecret };
        }
        return null;
    }

    private static String notesJson(Map<String, String> notes) {
        if (notes == null || notes.isEmpty()) {
            return "{}";
        }
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> e : notes.entrySet()) {
            if (!first) {
                sb.append(',');
            }
            first = false;
            sb.append('"').append(safe(e.getKey())).append("\":\"").append(safe(e.getValue())).append('"');
        }
        return sb.append('}').toString();
    }

    private static String hmac(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return "";
        }
    }

    private static String safe(String value) {
        if (value == null || value.isBlank()) {
            return "propel";
        }
        String cleaned = value.replaceAll("[^A-Za-z0-9._-]", "");
        if (cleaned.isBlank()) {
            return "propel";
        }
        return cleaned.substring(0, Math.min(40, cleaned.length()));
    }

    private static String extract(String json, String key) {
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
