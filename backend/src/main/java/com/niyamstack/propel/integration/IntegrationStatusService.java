package com.niyamstack.propel.integration;

import com.niyamstack.propel.security.Auth;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class IntegrationStatusService {
    private final PaymentGateway payments;
    private final MessagingGateway messaging;
    private final MeetingGateway meetings;
    private final ObjectStorage storage;
    private final MailService mail;

    public IntegrationStatusService(
            PaymentGateway payments,
            MessagingGateway messaging,
            MeetingGateway meetings,
            ObjectStorage storage,
            MailService mail
    ) {
        this.payments = payments;
        this.messaging = messaging;
        this.meetings = meetings;
        this.storage = storage;
        this.mail = mail;
    }

    public Map<String, Object> status() {
        UUID orgId = null;
        try {
            orgId = Auth.current().organizationId();
        } catch (Exception ignored) {
            /* platform or anonymous */
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("payments", Map.of("provider", payments.provider(orgId), "live", payments.live(orgId)));
        out.put("whatsapp", Map.of("provider", messaging.provider(orgId), "live", messaging.live(orgId)));
        out.put("meetings", Map.of("provider", meetings.provider(), "live", meetings.live()));
        out.put("storage", Map.of("provider", storage.provider(), "live", !"local".equals(storage.provider())));
        out.put("mail", Map.of("provider", mail.provider(), "live", mail.live()));
        out.put("note", "Live is true only when you have saved vendor keys in Integrations, or Niyamstack has configured server keys.");
        return out;
    }
}
