package com.niyamstack.propel.integration;

import java.time.Instant;
import java.util.Map;

public interface MeetingGateway {
    String provider();
    boolean live();
    Meeting create(String title, Instant startsAt);

    record Meeting(String joinUrl, String provider, boolean live, Map<String, Object> details) {}
}
