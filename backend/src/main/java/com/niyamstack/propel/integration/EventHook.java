package com.niyamstack.propel.integration;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.IntegrationConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class EventHook {
    private static final Logger log = LoggerFactory.getLogger(EventHook.class);
    private final Store store;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();

    public EventHook(Store store) {
        this.store = store;
    }

    public Map<String, String> tracking(UUID orgId) {
        Map<String, String> out = new LinkedHashMap<>();
        for (IntegrationConnection row : store.list(IntegrationConnection.class, orgId)) {
            if (!"CONNECTED".equals(row.getStatus())) {
                continue;
            }
            String value = configValue(row);
            if (value.isBlank()) {
                continue;
            }
            if ("FACEBOOK_PIXEL".equals(row.getProvider())) {
                out.put("facebookPixelId", value);
            } else if ("GOOGLE_ANALYTICS".equals(row.getProvider())) {
                out.put("googleAnalyticsId", value);
            } else if ("GOOGLE_ADS".equals(row.getProvider())) {
                out.put("googleAdsId", value);
            }
        }
        return out;
    }

    public void fire(UUID orgId, String event, Map<String, Object> payload) {
        if (orgId == null) {
            return;
        }
        for (IntegrationConnection row : store.list(IntegrationConnection.class, orgId)) {
            if (!"WEBHOOKS".equals(row.getProvider()) || !"CONNECTED".equals(row.getStatus())) {
                continue;
            }
            String url = configValue(row);
            if (url.isBlank() || !url.startsWith("https://")) {
                continue;
            }
            String body = "{\"event\":\"" + event + "\",\"organizationId\":\"" + orgId + "\",\"payload\":" + looseJson(payload) + "}";
            try {
                HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                        .timeout(Duration.ofSeconds(6))
                        .build();
                http.sendAsync(req, HttpResponse.BodyHandlers.discarding());
            } catch (Exception e) {
                log.warn("Webhook {} failed: {}", url, e.getMessage());
            }
        }
    }

    private static String configValue(IntegrationConnection row) {
        String json = row.getConfigJson();
        if (json == null || json.isBlank()) {
            return "";
        }
        int at = json.indexOf("\"value\"");
        if (at < 0) {
            return json.replace("\"", "").trim();
        }
        int colon = json.indexOf(':', at);
        int q1 = json.indexOf('"', colon + 1);
        int q2 = json.indexOf('"', q1 + 1);
        if (q1 < 0 || q2 < 0) {
            return "";
        }
        return json.substring(q1 + 1, q2).trim();
    }

    private static String looseJson(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return "{}";
        }
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : payload.entrySet()) {
            if (!first) {
                sb.append(',');
            }
            first = false;
            sb.append('"').append(e.getKey()).append("\":");
            Object v = e.getValue();
            if (v == null) {
                sb.append("null");
            } else if (v instanceof Number || v instanceof Boolean) {
                sb.append(v);
            } else {
                sb.append('"').append(String.valueOf(v).replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
            }
        }
        return sb.append('}').toString();
    }
}
