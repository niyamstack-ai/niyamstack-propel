package com.niyamstack.propel.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;

@Service
public class ConfigurableMeetingGateway implements MeetingGateway {
    private final String provider;
    private final String zoomClientId;
    private final String zoomClientSecret;

    public ConfigurableMeetingGateway(
            @Value("${app.integrations.meetings.provider:demo}") String provider,
            @Value("${app.integrations.meetings.zoom-client-id:}") String zoomClientId,
            @Value("${app.integrations.meetings.zoom-client-secret:}") String zoomClientSecret
    ) {
        this.provider = provider == null ? "demo" : provider;
        this.zoomClientId = zoomClientId == null ? "" : zoomClientId.trim();
        this.zoomClientSecret = zoomClientSecret == null ? "" : zoomClientSecret.trim();
    }

    @Override
    public String provider() {
        return live() ? provider : "jitsi";
    }

    @Override
    public boolean live() {
        return ("zoom".equalsIgnoreCase(provider) || "meet".equalsIgnoreCase(provider))
                && !zoomClientId.isBlank() && !zoomClientSecret.isBlank();
    }

    @Override
    public Meeting create(String title, Instant startsAt) {
        String room = "Niyamstack-" + (title == null ? "class" : title).replaceAll("[^A-Za-z0-9]", "").toLowerCase(Locale.ROOT);
        if (room.length() < 8) {
            room = room + Math.abs((title == null ? "class" : title).hashCode());
        }
        String url = "https://meet.jit.si/" + room;
        if (live() && "zoom".equalsIgnoreCase(provider)) {
            return new Meeting(url, "jitsi", true, Map.of("note", "Zoom OAuth is not completed; a Jitsi room was opened instead"));
        }
        return new Meeting(url, "jitsi", true, Map.of("note", "Jitsi meeting room"));
    }
}
