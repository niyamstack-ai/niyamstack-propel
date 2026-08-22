package com.niyamstack.propel.integration;

import java.util.Map;
import java.util.UUID;

public interface MessagingGateway {
    String provider();
    boolean live();
    SendResult send(String channel, String to, String title, String body);

    default boolean live(UUID orgId) {
        return live();
    }

    default String provider(UUID orgId) {
        return provider();
    }

    default SendResult send(UUID orgId, String channel, String to, String title, String body) {
        return send(channel, to, title, body);
    }

    record SendResult(boolean queued, String status, String message, Map<String, Object> details) {}
}
