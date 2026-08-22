package com.niyamstack.propel.integration;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.Organization;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.MimeMessage;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

@Service
public class ConfigurableMessagingGateway implements MessagingGateway {
    private static final Logger log = LoggerFactory.getLogger(ConfigurableMessagingGateway.class);
    private final Store store;
    private final String envToken;
    private final String envPhoneId;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(12)).build();

    public ConfigurableMessagingGateway(
            Store store,
            @Value("${app.integrations.whatsapp.token:}") String token,
            @Value("${app.integrations.whatsapp.phone-number-id:}") String phoneNumberId
    ) {
        this.store = store;
        this.envToken = token == null ? "" : token.trim();
        this.envPhoneId = phoneNumberId == null ? "" : phoneNumberId.trim();
    }

    @Override
    public String provider() {
        return live() ? "whatsapp" : "demo";
    }

    @Override
    public boolean live() {
        return !envToken.isBlank() && !envPhoneId.isBlank();
    }

    @Override
    public boolean live(UUID orgId) {
        return whatsapp(orgId) != null || smtp(orgId) != null;
    }

    @Override
    public String provider(UUID orgId) {
        if (whatsapp(orgId) != null) {
            return "whatsapp";
        }
        if (smtp(orgId) != null) {
            return "smtp";
        }
        return "demo";
    }

    @Override
    public SendResult send(String channel, String to, String title, String body) {
        return send(null, channel, to, title, body);
    }

    @Override
    public SendResult send(UUID orgId, String channel, String to, String title, String body) {
        String ch = channel == null ? "" : channel.toUpperCase();
        if ("WHATSAPP".equals(ch) || "SMS".equals(ch)) {
            String[] wa = whatsapp(orgId);
            if (wa == null) {
                return new SendResult(true, "QUEUED", "WhatsApp is not connected yet", Map.of("live", false, "to", to));
            }
            return sendWhatsApp(wa[0], wa[1], to, title, body);
        }
        if ("EMAIL".equals(ch)) {
            String[] mail = smtp(orgId);
            if (mail == null) {
                return new SendResult(true, "QUEUED", "Email SMTP is not connected yet", Map.of("live", false, "to", to));
            }
            return sendSmtp(mail, to, title, body);
        }
        return new SendResult(true, "QUEUED", "Shown in the student website", Map.of("live", false, "channel", ch));
    }

    private SendResult sendWhatsApp(String token, String phoneId, String to, String title, String body) {
        String digits = to == null ? "" : to.replaceAll("\\D", "");
        if (digits.length() == 10) {
            digits = "91" + digits;
        }
        if (digits.length() < 10) {
            return new SendResult(false, "FAILED", "Need a mobile number to send WhatsApp", Map.of("live", true));
        }
        String payload = "{\"messaging_product\":\"whatsapp\",\"to\":\"" + digits
                + "\",\"type\":\"text\",\"text\":{\"body\":\"" + escape(title + "\\n" + body) + "\"}}";
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create("https://graph.facebook.com/v21.0/" + phoneId + "/messages"))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                    .timeout(Duration.ofSeconds(20))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 300) {
                log.warn("WhatsApp send failed: {}", res.body());
                return new SendResult(false, "FAILED", "WhatsApp Cloud API rejected the message", Map.of("live", true));
            }
            return new SendResult(true, "SENT", "WhatsApp sent", Map.of("live", true));
        } catch (Exception e) {
            log.warn("WhatsApp send failed: {}", e.getMessage());
            return new SendResult(false, "FAILED", "Could not reach WhatsApp", Map.of("live", true));
        }
    }

    private SendResult sendSmtp(String[] mail, String to, String title, String body) {
        if (to == null || !to.contains("@")) {
            return new SendResult(false, "FAILED", "Need an email address", Map.of("live", true));
        }
        try {
            JavaMailSenderImpl sender = new JavaMailSenderImpl();
            sender.setHost(mail[0]);
            sender.setPort(Integer.parseInt(mail[1]));
            sender.setUsername(mail[2]);
            sender.setPassword(mail[3]);
            Properties props = sender.getJavaMailProperties();
            props.put("mail.smtp.auth", "true");
            props.put("mail.smtp.starttls.enable", "true");
            MimeMessage mime = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, "UTF-8");
            helper.setFrom(mail[4].isBlank() ? mail[2] : mail[4]);
            helper.setTo(to.trim());
            helper.setSubject(title == null ? "Notice" : title);
            helper.setText(body == null ? "" : body, false);
            sender.send(mime);
            return new SendResult(true, "SENT", "Email sent", Map.of("live", true));
        } catch (Exception e) {
            log.warn("SMTP send failed: {}", e.getMessage());
            return new SendResult(false, "FAILED", "Could not send email. Check SMTP in Integrations.", Map.of("live", true));
        }
    }

    private String[] whatsapp(UUID orgId) {
        if (orgId != null) {
            Organization org = store.get(Organization.class, orgId);
            String token = OrgSecrets.live(org, "whatsappToken");
            String phone = OrgSecrets.live(org, "whatsappPhoneId");
            if (!token.isBlank() && !phone.isBlank()) {
                return new String[] { token, phone };
            }
        }
        if (!envToken.isBlank() && !envPhoneId.isBlank()) {
            return new String[] { envToken, envPhoneId };
        }
        return null;
    }

    private String[] smtp(UUID orgId) {
        if (orgId == null) {
            return null;
        }
        Organization org = store.get(Organization.class, orgId);
        String host = OrgSecrets.live(org, "smtpHost");
        String user = OrgSecrets.live(org, "smtpUser");
        String pass = OrgSecrets.live(org, "smtpPass");
        if (host.isBlank() || user.isBlank() || pass.isBlank()) {
            return null;
        }
        String port = OrgSecrets.live(org, "smtpPort");
        if (port.isBlank()) {
            port = "587";
        }
        String from = OrgSecrets.live(org, "smtpFrom");
        return new String[] { host, port, user, pass, from };
    }

    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}
