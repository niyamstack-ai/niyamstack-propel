package com.niyamstack.propel.integration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.MimeMessage;

import java.util.Properties;

@Service
public class MailService {
    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final String provider;
    private final String host;
    private final int port;
    private final String username;
    private final String password;
    private final String from;
    private final String publicUrl;

    public MailService(
            @Value("${app.integrations.mail.provider:demo}") String provider,
            @Value("${app.integrations.mail.host:smtp.gmail.com}") String host,
            @Value("${app.integrations.mail.port:587}") int port,
            @Value("${app.integrations.mail.username:}") String username,
            @Value("${app.integrations.mail.password:}") String password,
            @Value("${app.integrations.mail.from:}") String from,
            @Value("${app.integrations.mail.public-url:http://localhost:5173}") String publicUrl
    ) {
        this.provider = provider;
        this.host = host;
        this.port = port;
        this.username = username == null ? "" : username.trim();
        this.password = password == null ? "" : password.trim();
        this.from = from == null || from.isBlank() ? this.username : from.trim();
        this.publicUrl = publicUrl == null || publicUrl.isBlank() ? "http://localhost:5173" : publicUrl.trim().replaceAll("/$", "");
    }

    public boolean live() {
        return "smtp".equalsIgnoreCase(provider) && !username.isBlank() && !password.isBlank();
    }

    public String provider() {
        return live() ? "smtp" : "demo";
    }

    public String publicUrl() {
        return publicUrl;
    }

    public boolean canDeliver(String email) {
        if (email == null || !email.contains("@")) {
            return false;
        }
        String e = email.trim().toLowerCase();
        return !e.endsWith(".demo") && !e.endsWith(".local") && !e.endsWith("@demo.test");
    }

    public void sendOtp(String to, String purpose, String code) {
        String label = "RESET".equals(purpose) ? "password reset" : "login";
        String title = "RESET".equals(purpose) ? "Your password reset code" : "Your login code";
        String plain = "Your Niyamstack Propel " + label + " code expires in 5 minutes. If you did not request this, ignore this email.";
        String inner = """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155;">Use this code for your %s. It expires in 5 minutes.</p>
                <p style="margin:24px 0;text-align:center;font-size:28px;letter-spacing:8px;font-weight:700;color:#071a33;">%s</p>
                <p style="margin:0;font-size:13px;color:#64748b;">If you did not request this, you can ignore this email.</p>
                """.formatted(esc(label), esc(code));
        sendHtml(to, title, plain, layout(title, inner));
    }

    public void sendPasswordReset(String to, String token) {
        String link = publicUrl + "/forgot?token=" + token;
        String plain = "Niyamstack Propel received a password reset request. Open this email and click Reset password. The button expires in 30 minutes. If you did not request this, ignore this email.";
        String inner = """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155;">We received a request to reset the password for your Niyamstack Propel account.</p>
                <p style="margin:28px 0;text-align:center;">
                  <a href="%s" style="display:inline-block;background:#0078f0;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;">Reset password</a>
                </p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748b;">This button expires in 30 minutes and can be used once.</p>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">If you did not ask for a reset, ignore this email. Your password will not change.</p>
                """.formatted(esc(link));
        sendHtml(to, "Reset your Niyamstack Propel password", plain, layout("Reset your password", inner));
    }

    public void sendWelcome(String to, String name) {
        String greet = name == null || name.isBlank() ? "there" : name;
        String login = publicUrl + "/login";
        String plain = "Your Niyamstack Propel account is ready. Sign in from the portal. If you did not create this account, ignore this email.";
        String inner = """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155;">Hello %s, your institute account is ready.</p>
                <p style="margin:28px 0;text-align:center;">
                  <a href="%s" style="display:inline-block;background:#0078f0;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;">Sign in</a>
                </p>
                """.formatted(esc(greet), esc(login));
        sendHtml(to, "Your Niyamstack Propel account", plain, layout("Welcome to Propel", inner));
    }

    private void sendHtml(String to, String subject, String plain, String html) {
        if (!live() || !canDeliver(to)) {
            return;
        }
        try {
            JavaMailSenderImpl sender = mailSender();
            MimeMessage mime = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
            helper.setFrom(from, "Niyamstack Propel");
            helper.setTo(to.trim());
            helper.setSubject(subject);
            helper.setText(plain, html);
            sender.send(mime);
        } catch (RuntimeException e) {
            log.warn("Mail send failed to {}: {}", to, e.getMessage());
            throw e;
        } catch (Exception e) {
            log.warn("Mail send failed to {}: {}", to, e.getMessage());
            throw new IllegalStateException("Could not send email", e);
        }
    }

    private String layout(String heading, String inner) {
        String logo = publicUrl + "/brand/logo-icon.png";
        return """
                <!DOCTYPE html>
                <html><body style="margin:0;padding:0;background:#f1f5f9;">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
                  <tr><td align="center">
                    <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
                      <tr><td style="background:#071a33;padding:22px 28px;">
                        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                          <td><img src="%s" width="44" height="44" alt="Niyamstack" style="display:block;border-radius:10px;"/></td>
                          <td style="padding-left:12px;">
                            <div style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.02em;">Niyamstack</div>
                            <div style="color:#7dd3fc;font-size:10px;font-weight:700;letter-spacing:0.28em;padding-top:3px;">TECHNOLOGIES</div>
                          </td>
                        </tr></table>
                      </td></tr>
                      <tr><td style="padding:28px;">
                        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#071a33;">%s</h1>
                        %s
                      </td></tr>
                      <tr><td style="padding:0 28px 24px;font-size:12px;color:#94a3b8;">
                        Niyamstack Technologies · Propel
                      </td></tr>
                    </table>
                  </td></tr>
                </table>
                </body></html>
                """.formatted(esc(logo), esc(heading), inner);
    }

    private JavaMailSenderImpl mailSender() {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(host);
        sender.setPort(port);
        sender.setUsername(username);
        sender.setPassword(password);
        Properties props = sender.getJavaMailProperties();
        props.put("mail.smtp.auth", "true");
        props.put("mail.smtp.starttls.enable", "true");
        props.put("mail.smtp.ssl.trust", host);
        return sender;
    }

    private static String esc(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
