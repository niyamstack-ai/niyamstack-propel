package com.niyamstack.propel.integration;

import java.util.Map;

public interface MessagingGateway {
    String provider();
    boolean live();
    SendResult send(String channel, String to, String title, String body);

    record SendResult(boolean queued, String status, String message, Map<String, Object> details) {}
}
