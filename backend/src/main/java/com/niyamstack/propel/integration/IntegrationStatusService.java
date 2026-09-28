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
        out.put("payments", channel(
                payments.provider(orgId),
                payments.live(orgId),
                "Razorpay Checkout when Niyamstack has platform keys; otherwise fees are recorded in Propel only (demo)."));
        out.put("whatsapp", channel(
                messaging.provider(orgId),
                messaging.live(orgId),
                "Cloud API when institute keys are saved; otherwise messages are queued locally (demo)."));
        out.put("meetings", channel(
                meetings.provider(),
                meetings.live(),
                "Zoom/Meet when configured; otherwise Propel opens a built-in Jitsi room."));
        String storageProvider = storage.provider();
        boolean storageLive = !"local".equalsIgnoreCase(storageProvider) && !storageProvider.toLowerCase().contains("pending");
        out.put("storage", channel(
                storageProvider,
                storageLive,
                "Object storage when configured; otherwise files stay on this server (built-in)."));
        out.put("mail", channel(
                mail.provider(),
                mail.live(),
                "SMTP when institute or server mail is configured; otherwise OTP/mail stay in demo/local reveal."));
        out.put("note", "Each card shows Live, Demo, or Built-in. Demo still works for testing; Live means a real external provider is connected.");
        return out;
    }

    private static Map<String, Object> channel(String provider, boolean live, String meaning) {
        String p = provider == null || provider.isBlank() ? "demo" : provider;
        String mode;
        if (live) {
            mode = "LIVE";
        } else if ("jitsi".equalsIgnoreCase(p) || "local".equalsIgnoreCase(p) || p.toLowerCase().contains("pending")) {
            mode = "BUILT_IN";
        } else {
            mode = "DEMO";
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("provider", p);
        row.put("live", live);
        row.put("mode", mode);
        row.put("meaning", meaning);
        return row;
    }
}
