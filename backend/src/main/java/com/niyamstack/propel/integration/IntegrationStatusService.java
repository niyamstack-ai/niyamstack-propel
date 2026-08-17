package com.niyamstack.propel.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class IntegrationStatusService {
    private final PaymentGateway payments;
    private final MessagingGateway messaging;
    private final MeetingGateway meetings;
    private final ObjectStorage storage;
    private final String mailProvider;

    public IntegrationStatusService(
            PaymentGateway payments,
            MessagingGateway messaging,
            MeetingGateway meetings,
            ObjectStorage storage,
            @Value("${app.integrations.mail.provider:demo}") String mailProvider
    ) {
        this.payments = payments;
        this.messaging = messaging;
        this.meetings = meetings;
        this.storage = storage;
        this.mailProvider = mailProvider;
    }

    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("payments", Map.of("provider", payments.provider(), "live", payments.live()));
        out.put("whatsapp", Map.of("provider", messaging.provider(), "live", messaging.live()));
        out.put("meetings", Map.of("provider", meetings.provider(), "live", meetings.live()));
        out.put("storage", Map.of("provider", storage.provider(), "live", !"local".equals(storage.provider())));
        out.put("mail", Map.of("provider", mailProvider, "live", !"demo".equalsIgnoreCase(mailProvider)));
        out.put("note", "Live is true only when vendor credentials are configured. Demo adapters never claim a live send.");
        return out;
    }
}
