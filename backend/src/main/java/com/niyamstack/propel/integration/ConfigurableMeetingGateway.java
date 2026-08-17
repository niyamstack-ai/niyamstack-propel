package com.niyamstack.propel.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
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
        this.provider = provider;
        this.zoomClientId = zoomClientId;
        this.zoomClientSecret = zoomClientSecret;
    }

    @Override
    public String provider() {
        return live() ? provider : "demo";
    }

    @Override
    public boolean live() {
        return ("zoom".equalsIgnoreCase(provider) || "meet".equalsIgnoreCase(provider))
                && !zoomClientId.isBlank() && !zoomClientSecret.isBlank();
    }

    @Override
    public Meeting create(String title, Instant startsAt) {
        if (!live()) {
            return new Meeting("https://meet.demo.niyamstack.local/" + title.hashCode(), "demo", false,
                    Map.of("note", "Zoom/Meet OAuth is not configured"));
        }
        return new Meeting("https://zoom.us/j/pending-oauth", provider, true,
                Map.of("note", "OAuth client present; meeting create API not called until OAuth tokens are stored"));
    }
}
