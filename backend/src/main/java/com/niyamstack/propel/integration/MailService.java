package com.niyamstack.propel.integration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;

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
        send(to, "Your Niyamstack Propel " + label + " code",
                "Your " + label + " code is: " + code + "\n\nIt expires in 5 minutes.\n\nIf you did not request this, ignore this email.");
    }

    public void sendPasswordReset(String to, String token) {
        String link = publicUrl + "/forgot?token=" + token;
        send(to, "Reset your Niyamstack Propel password",
                "Open this link to choose a new password (valid for 30 minutes):\n\n" + link + "\n\nIf you did not request a reset, ignore this email.");
    }

    public void sendWelcome(String to, String name) {
        send(to, "Your Niyamstack Propel account",
                "Hello " + (name == null || name.isBlank() ? "there" : name) + ",\n\nYour institute account is ready. Sign in at:\n" + publicUrl + "/login\n");
    }

    public void send(String to, String subject, String body) {
        if (!live() || !canDeliver(to)) {
            return;
        }
        try {
            JavaMailSenderImpl sender = new JavaMailSenderImpl();
            sender.setHost(host);
            sender.setPort(port);
            sender.setUsername(username);
            sender.setPassword(password);
            Properties props = sender.getJavaMailProperties();
            props.put("mail.smtp.auth", "true");
            props.put("mail.smtp.starttls.enable", "true");
            props.put("mail.smtp.ssl.trust", host);
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to.trim());
            message.setSubject(subject);
            message.setText(body);
            sender.send(message);
        } catch (RuntimeException e) {
            log.warn("Mail send failed to {}: {}", to, e.getMessage());
            throw e;
        }
    }
}
