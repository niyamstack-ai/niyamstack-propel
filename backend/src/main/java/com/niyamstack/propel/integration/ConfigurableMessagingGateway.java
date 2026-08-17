package com.niyamstack.propel.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class ConfigurableMessagingGateway implements MessagingGateway {
    private final String provider;
    private final String token;
    private final String phoneNumberId;

    public ConfigurableMessagingGateway(
            @Value("${app.integrations.whatsapp.provider:demo}") String provider,
            @Value("${app.integrations.whatsapp.token:}") String token,
            @Value("${app.integrations.whatsapp.phone-number-id:}") String phoneNumberId
    ) {
        this.provider = provider;
        this.token = token;
        this.phoneNumberId = phoneNumberId;
    }

    @Override
    public String provider() {
        return live() ? provider : "demo";
    }

    @Override
    public boolean live() {
        return "whatsapp".equalsIgnoreCase(provider) && !token.isBlank() && !phoneNumberId.isBlank();
    }

    @Override
    public SendResult send(String channel, String to, String title, String body) {
        if (!live()) {
            return new SendResult(true, "QUEUED", "Demo channel — WhatsApp Cloud API is not live",
                    Map.of("live", false, "channel", channel, "to", to));
        }
        return new SendResult(true, "QUEUED", "WhatsApp credentials present; Cloud API send is not executed until templates are approved",
                Map.of("live", true, "phoneNumberId", phoneNumberId));
    }
}
