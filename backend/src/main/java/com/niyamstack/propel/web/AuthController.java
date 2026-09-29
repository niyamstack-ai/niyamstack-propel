package com.niyamstack.propel.web;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.foundation.FoundationService;
import com.niyamstack.propel.integration.MailService;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.IpRateLimiter;
import com.niyamstack.propel.security.OtpService;
import com.niyamstack.propel.security.SessionCookies;
import com.niyamstack.propel.security.PasswordPolicy;
import com.niyamstack.propel.security.PendingFlowService;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.ResetTokenService;
import com.niyamstack.propel.security.Roles;
import com.niyamstack.propel.security.SessionService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import jakarta.servlet.http.HttpServletResponse;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final int MAX_FAILURES = 8;
    private final Store store;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final OtpService otp;
    private final ResetTokenService resets;
    private final SessionService sessions;
    private final MailService mail;
    private final FoundationService foundation;
    private final Environment environment;
    private final boolean demoAliases;
    private final PendingFlowService pendingFlows;
    private final ObjectMapper json;
    private final IpRateLimiter ipRateLimiter;

    public AuthController(
            Store store,
            PasswordEncoder encoder,
            AuditService audit,
            OtpService otp,
            ResetTokenService resets,
            SessionService sessions,
            MailService mail,
            FoundationService foundation,
            Environment environment,
            PendingFlowService pendingFlows,
            ObjectMapper json,
            IpRateLimiter ipRateLimiter,
            @Value("${propel.demo-aliases:false}") boolean demoAliases
    ) {
        this.store = store;
        this.encoder = encoder;
        this.audit = audit;
        this.otp = otp;
        this.resets = resets;
        this.sessions = sessions;
        this.mail = mail;
        this.foundation = foundation;
        this.environment = environment;
        this.pendingFlows = pendingFlows;
        this.json = json;
        this.ipRateLimiter = ipRateLimiter;
        this.demoAliases = demoAliases;
    }

    public record LoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password
    ) {}

    public record PhoneLoginRequest(@NotBlank String phone, @NotBlank String password) {}

    public record PhoneRequest(@NotBlank String phone) {}

    public record OtpVerifyRequest(@NotBlank String phone, @NotBlank String otp) {}

    public record SignupRequest(
            @NotBlank String instituteName,
            @NotBlank String fullName,
            @NotBlank @Email String email,
            @NotBlank String phone,
            @NotBlank String password,
            String productPack
    ) {}

    public record SignupVerifyRequest(@NotBlank String phone, @NotBlank String otp) {}

    public record ForgotEmailRequest(@NotBlank @Email String email) {}

    public record ResetOtpRequest(@NotBlank String phone, @NotBlank String otp, @NotBlank String newPassword) {}

    public record ResetEmailRequest(@NotBlank String token, @NotBlank String newPassword) {}

    public record PasswordChangeRequest(String currentPassword, @NotBlank String newPassword) {}

    public record ProfileUpdateRequest(String name, String email, String phone) {}

    @PostMapping("/login")
    @Transactional
    public Map<String, Object> login(@Valid @RequestBody LoginRequest body, jakarta.servlet.http.HttpServletRequest request, HttpServletResponse response) {
        String ip = IpRateLimiter.clientIp(request);
        ipRateLimiter.guard(ip);
        AppUser user = store.findUserByEmail(body.email() == null ? "" : body.email().trim());
        if (user == null && allowDemoAliases()) {
            String email = body.email() == null ? "" : body.email().trim();
            if ("deepak@yopmail.com".equalsIgnoreCase(email)) {
                user = store.findUserByEmail("owner@aarohan.demo");
            } else if ("owner@aarohan.demo".equalsIgnoreCase(email)) {
                user = store.findUserByEmail("deepak@yopmail.com");
            }
            if (user == null && ("deepak@yopmail.com".equalsIgnoreCase(email) || "owner@aarohan.demo".equalsIgnoreCase(email))) {
                user = store.findUserByPhone("9876500001");
            }
        }
        if (user != null && Roles.isPlatform(user.getRole())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        if (!passwordOk(user, body.password(), ip, body.email())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        requireOrgAccess(user);
        requireEmailVerified(user);
        clearLock(user, ip);
        audit.log("LOGIN", "AppUser", user.getId(), user.getEmail());
        Map<String, Object> session = sessions.issue(user);
        SessionCookies.attachInstitute(response, session);
        return session;
    }

    @PostMapping("/login/phone")
    @Transactional
    public Map<String, Object> loginPhone(@Valid @RequestBody PhoneLoginRequest body, jakarta.servlet.http.HttpServletRequest request, HttpServletResponse response) {
        String ip = IpRateLimiter.clientIp(request);
        ipRateLimiter.guard(ip);
        AppUser user = requirePhoneUser(body.phone());
        if (Roles.isPlatform(user.getRole())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid mobile or password");
        }
        if (!passwordOk(user, body.password(), ip, user.getPhone())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid mobile or password");
        }
        ensureActive(user);
        requireOrgAccess(user);
        requireEmailVerified(user);
        clearLock(user, ip);
        audit.log("LOGIN_PHONE", "AppUser", user.getId(), user.getPhone());
        Map<String, Object> session = sessions.issue(user);
        SessionCookies.attachInstitute(response, session);
        return session;
    }

    @PostMapping("/otp/request")
    @Transactional
    public Map<String, Object> requestLoginOtp(@Valid @RequestBody PhoneRequest body, jakarta.servlet.http.HttpServletRequest request) {
        ipRateLimiter.guard(request);
        AppUser user = requirePhoneUser(body.phone());
        ensureActive(user);
        requireOrgAccess(user);
        if (user.getEmail() == null || user.getEmail().isBlank() || !mail.canDeliver(user.getEmail())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Add a real email on your profile to receive OTP.");
        }
        var issued = otp.issue(user.getPhone(), OtpService.LOGIN);
        Map<String, Object> out = new LinkedHashMap<>(otp.publicIssue(issued));
        if (mail.live() && mail.canDeliver(user.getEmail())) {
            mail.sendOtp(user.getEmail(), OtpService.LOGIN, issued.code());
        } else if (otp.reveal()) {
            out.put("devOtp", issued.code());
        } else if (!mail.live() || !mail.canDeliver(user.getEmail())) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Email delivery is not configured. Configure SMTP or enable OTP reveal for local testing.");
        }
        out.put("emailMasked", maskEmail(user.getEmail()));
        out.put("channel", "email");
        return out;
    }

    @PostMapping("/otp/verify")
    @Transactional
    public Map<String, Object> verifyLoginOtp(@Valid @RequestBody OtpVerifyRequest body, jakarta.servlet.http.HttpServletRequest request, HttpServletResponse response) {
        ipRateLimiter.guard(request);
        AppUser user = requirePhoneUser(body.phone());
        ensureActive(user);
        requireOrgAccess(user);
        otp.verify(user.getPhone(), OtpService.LOGIN, body.otp());
        // OTP on mail proves inbox access — unlock password login going forward.
        user.setEmailVerified(true);
        user.setPhoneVerified(true);
        store.save(user);
        clearLock(user, "otp");
        audit.log("LOGIN_OTP", "AppUser", user.getId(), user.getPhone());
        Map<String, Object> session = sessions.issue(user);
        SessionCookies.attachInstitute(response, session);
        return session;
    }

    @PostMapping("/signup")
    public Map<String, Object> signup(@Valid @RequestBody SignupRequest body, jakarta.servlet.http.HttpServletRequest request) {
        ipRateLimiter.guard(request);
        String email = body.email().trim().toLowerCase();
        String phone = requireMobile(body.phone());
        if (!mail.canDeliver(email)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a real email address. We send a verification code there.");
        }
        if (store.findUserByEmail(email) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        if (store.findUserByPhone(phone) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this mobile already exists");
        }
        PasswordPolicy.validate(body.password());
        if (body.instituteName() == null || body.instituteName().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Institute name is required");
        }
        if (body.fullName() == null || body.fullName().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Your name is required");
        }
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("instituteName", body.instituteName().trim());
        payload.put("fullName", body.fullName().trim());
        payload.put("email", email);
        payload.put("phone", phone);
        payload.put("passwordHash", encoder.encode(body.password()));
        payload.put("productPack", com.niyamstack.propel.catalog.Packs.normalizePack(body.productPack()));
        try {
            pendingFlows.put("SIGNUP:" + phone, "SIGNUP", json.writeValueAsString(payload), Instant.now().plusSeconds(600));
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not start signup");
        }
        var issued = otp.issue(phone, OtpService.SIGNUP);
        Map<String, Object> out = new LinkedHashMap<>(otp.publicIssue(issued));
        if (mail.live() && mail.canDeliver(email)) {
            mail.sendOtp(email, OtpService.SIGNUP, issued.code());
        } else if (otp.reveal()) {
            out.put("devOtp", issued.code());
        } else if (!mail.live() || !mail.canDeliver(email)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Email delivery is not configured. Configure SMTP or enable OTP reveal for local testing.");
        }
        out.put("emailMasked", maskEmail(email));
        out.put("channel", "email");
        out.put("status", "otp_sent");
        return out;
    }

    @PostMapping("/signup/verify")
    @Transactional
    public Map<String, Object> signupVerify(@Valid @RequestBody SignupVerifyRequest body, jakarta.servlet.http.HttpServletRequest request, HttpServletResponse response) {
        ipRateLimiter.guard(request);
        String phone = requireMobile(body.phone());
        String raw = pendingFlows.getPayload("SIGNUP:" + phone);
        if (raw == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Signup expired. Start again and verify your email.");
        }
        Map<String, String> pending;
        try {
            pending = json.readValue(raw, new TypeReference<>() {});
        } catch (Exception e) {
            pendingFlows.remove("SIGNUP:" + phone);
            throw new ApiException(HttpStatus.BAD_REQUEST, "Signup expired. Start again and verify your email.");
        }
        otp.verify(phone, OtpService.SIGNUP, body.otp());
        pendingFlows.remove("SIGNUP:" + phone);
        String email = pending.getOrDefault("email", "");
        if (store.findUserByEmail(email) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        if (store.findUserByPhone(phone) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this mobile already exists");
        }

        String instituteName = pending.getOrDefault("instituteName", "Institute");
        String productPack = pending.getOrDefault("productPack", com.niyamstack.propel.catalog.Packs.FULL_OPS);
        Organization org = new Organization();
        org.setName(instituteName);
        org.setLegalName(instituteName);
        org.setEmail(email);
        org.setPhone(phone);
        org.setPackageTier("STARTER");
        org.setProductPack(productPack);
        org.setAccessStatus("DEMO");
        org.setPaymentStatus("UNPAID");
        org.setModulesCsv(com.niyamstack.propel.catalog.Packs.modulesCsvForPack(org.getProductPack()));
        org.setSlug(uniqueSlug(instituteName));
        org.setBrandPrimary("#0078f0");
        org.setBrandSecondary("#071a33");
        org = store.save(org);

        AppUser user = new AppUser();
        user.setOrganizationId(org.getId());
        user.setFullName(pending.getOrDefault("fullName", ""));
        user.setEmail(email);
        user.setPhone(phone);
        user.setPasswordHash(pending.get("passwordHash"));
        user.setRole(Roles.OWNER);
        user.setActive(true);
        user.setPasswordChangedAt(Instant.now());
        user.setEmailVerified(true);
        user = store.save(user);
        foundation.seedStarter(org.getId(), user.getId());
        audit.log("SIGNUP", "Organization", org.getId(), email);
        if (mail.live() && mail.canDeliver(email)) {
            mail.sendWelcome(email, user.getFullName());
        }
        Map<String, Object> session = sessions.issue(user);
        SessionCookies.attachInstitute(response, session);
        return session;
    }

    @PostMapping("/forgot/otp")
    @Transactional
    public Map<String, Object> forgotOtp(@Valid @RequestBody PhoneRequest body, jakarta.servlet.http.HttpServletRequest request) {
        ipRateLimiter.guard(request);
        AppUser user = requirePhoneUser(body.phone());
        ensureActive(user);
        if (user.getEmail() == null || user.getEmail().isBlank() || !mail.canDeliver(user.getEmail())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Add a real email on your profile to receive OTP.");
        }
        var issued = otp.issue(user.getPhone(), OtpService.RESET);
        Map<String, Object> out = new LinkedHashMap<>(otp.publicIssue(issued));
        if (mail.live() && mail.canDeliver(user.getEmail())) {
            mail.sendOtp(user.getEmail(), OtpService.RESET, issued.code());
        } else if (otp.reveal()) {
            out.put("devOtp", issued.code());
        } else if (!mail.live() || !mail.canDeliver(user.getEmail())) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Email delivery is not configured. Configure SMTP or enable OTP reveal for local testing.");
        }
        out.put("emailMasked", maskEmail(user.getEmail()));
        out.put("channel", "email");
        return out;
    }

    @PostMapping("/reset/otp")
    @Transactional
    public Map<String, String> resetOtp(@Valid @RequestBody ResetOtpRequest body) {
        AppUser user = requirePhoneUser(body.phone());
        otp.verify(user.getPhone(), OtpService.RESET, body.otp());
        PasswordPolicy.validate(body.newPassword());
        user.setPasswordHash(encoder.encode(body.newPassword()));
        user.setPasswordChangedAt(Instant.now());
        user.setFailedLogins(0);
        user.setLockedUntil(null);
        store.save(user);
        audit.log("PASSWORD_RESET_OTP", "AppUser", user.getId(), user.getPhone());
        return Map.of("status", "updated");
    }

    @PostMapping("/forgot/email")
    @Transactional
    public Map<String, Object> forgotEmail(@Valid @RequestBody ForgotEmailRequest body) {
        AppUser user = store.findUserByEmail(body.email().trim());
        if (user == null || !user.isActive()) {
            return Map.of("status", "sent");
        }
        // Never send a reset link to an email that has not been verified (blocks takeover after email change).
        if (!user.isEmailVerified() && !otp.reveal()) {
            return Map.of("status", "sent");
        }
        String token = resets.issue(user.getId());
        audit.log("PASSWORD_RESET_EMAIL", "AppUser", user.getId(), user.getEmail());
        if (mail.live() && mail.canDeliver(user.getEmail())) {
            mail.sendPasswordReset(user.getEmail(), token);
            return Map.of("status", "sent");
        }
        // Local/dev only: never return a reset token just because SMTP is down in prod.
        if (otp.reveal()) {
            return Map.of("status", "sent", "resetToken", token);
        }
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "Email delivery is not configured. Configure SMTP or enable OTP reveal for local testing.");
    }

    @PostMapping("/reset/email")
    @Transactional
    public Map<String, String> resetEmail(@Valid @RequestBody ResetEmailRequest body) {
        UUID userId = resets.consume(body.token());
        AppUser user = store.get(AppUser.class, userId);
        PasswordPolicy.validate(body.newPassword());
        user.setPasswordHash(encoder.encode(body.newPassword()));
        user.setPasswordChangedAt(Instant.now());
        user.setFailedLogins(0);
        user.setLockedUntil(null);
        store.save(user);
        audit.log("PASSWORD_RESET", "AppUser", user.getId(), user.getEmail());
        return Map.of("status", "updated");
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletResponse response) {
        SessionCookies.clearInstitute(response);
        return Map.of("ok", true);
    }

    @PatchMapping("/profile")
    @Transactional
    public Map<String, Object> updateProfile(@RequestBody ProfileUpdateRequest body, HttpServletResponse response) {
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        if (body != null && body.name() != null && !body.name().isBlank()) {
            user.setFullName(body.name().trim());
        }
        if (body != null && body.email() != null && !body.email().isBlank()) {
            String email = body.email().trim().toLowerCase();
            if (!email.contains("@") || !mail.canDeliver(email)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid email");
            }
            AppUser other = store.findUserByEmail(email);
            if (other != null && !other.getId().equals(user.getId())) {
                throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
            }
            if (!email.equalsIgnoreCase(user.getEmail() == null ? "" : user.getEmail())) {
                user.setEmail(email);
                user.setEmailVerified(false);
            }
        }
        if (body != null && body.phone() != null && !body.phone().isBlank()) {
            String phone = requireMobile(body.phone());
            AppUser other = store.findUserByPhone(phone);
            if (other != null && !other.getId().equals(user.getId())) {
                throw new ApiException(HttpStatus.CONFLICT, "An account with this mobile already exists");
            }
            String prior = Phones.normalize(user.getPhone() == null ? "" : user.getPhone());
            if (!phone.equals(prior)) {
                user.setPhone(phone);
                user.setPhoneVerified(false);
            }
        }
        store.save(user);
        if (user.getOrganizationId() != null) {
            for (var student : store.listBy(com.niyamstack.propel.domain.Model.Student.class, user.getOrganizationId(), "userId", user.getId())) {
                student.setFullName(user.getFullName());
                student.setEmail(user.getEmail());
                student.setPhone(user.getPhone());
                store.save(student);
            }
        }
        audit.log("PROFILE_UPDATE", "AppUser", user.getId(), user.getEmail());
        Map<String, Object> session = sessions.issue(user);
        SessionCookies.attachInstitute(response, session);
        return session;
    }

    @PostMapping("/password")
    @Transactional
    public Map<String, String> changePassword(@Valid @RequestBody PasswordChangeRequest body) {
        AppUser user = store.get(AppUser.class, Auth.current().userId());
        boolean student = Roles.STUDENT.equals(user.getRole());
        boolean hasCurrent = body.currentPassword() != null && !body.currentPassword().isBlank();
        if (!student || hasCurrent) {
            if (!hasCurrent || !encoder.matches(body.currentPassword(), user.getPasswordHash())) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Current password is incorrect");
            }
        }
        PasswordPolicy.validate(body.newPassword());
        user.setPasswordHash(encoder.encode(body.newPassword()));
        user.setPasswordChangedAt(Instant.now());
        store.save(user);
        audit.log("PASSWORD_CHANGE", "AppUser", user.getId(), null);
        return Map.of("status", "updated");
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) {
            return "";
        }
        String[] parts = email.split("@", 2);
        String userPart = parts[0];
        String visible = userPart.length() <= 1 ? "*" : userPart.charAt(0) + "***";
        return visible + "@" + parts[1];
    }

    private boolean passwordOk(AppUser user, String password, String ip, String email) {
        if (user != null && user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.LOCKED, "Account temporarily locked");
        }
        if (user == null || !user.isActive() || !encoder.matches(password, user.getPasswordHash())) {
            ipRateLimiter.recordFailure(ip);
            if (user != null) {
                user.setFailedLogins(user.getFailedLogins() + 1);
                if (user.getFailedLogins() >= MAX_FAILURES) {
                    user.setLockedUntil(Instant.now().plusSeconds(900));
                }
                store.save(user);
            }
            audit.log("LOGIN_FAILED", "AppUser", user == null ? null : user.getId(), email);
            return false;
        }
        return true;
    }

    private void clearLock(AppUser user, String ip) {
        user.setFailedLogins(0);
        user.setLockedUntil(null);
        store.save(user);
        ipRateLimiter.clear(ip);
    }

    private AppUser requirePhoneUser(String raw) {
        String phone = requireMobile(raw);
        AppUser user = store.findUserByPhone(phone);
        if (user == null || Roles.isPlatform(user.getRole())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No account found for this mobile number");
        }
        return user;
    }

    private static void ensureActive(AppUser user) {
        if (!user.isActive()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Account is disabled");
        }
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.LOCKED, "Account temporarily locked");
        }
    }

    private void requireOrgAccess(AppUser user) {
        if (user == null || user.getOrganizationId() == null || Roles.isPlatform(user.getRole())) {
            return;
        }
        Organization org = store.get(Organization.class, user.getOrganizationId());
        com.niyamstack.propel.security.OrgAccess.requireNotSuspended(org);
    }

    private void requireEmailVerified(AppUser user) {
        if (user == null || Roles.isPlatform(user.getRole())) {
            return;
        }
        if (user.isEmailVerified()) {
            return;
        }
        // Local reveal mode keeps seed/demo logins usable without SMTP.
        if (otp.reveal()) {
            return;
        }
        throw new ApiException(HttpStatus.FORBIDDEN,
                "Your email is not verified yet. Enter the OTP we send to your inbox, then you can use password login.");
    }

    private static String requireMobile(String raw) {
        String phone = Phones.normalize(raw);
        if (!Phones.isMobile(phone)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid mobile number with country code");
        }
        return phone;
    }

    private String uniqueSlug(String name) {
        String base = name.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (base.length() < 3) {
            base = "institute";
        }
        if (base.length() > 36) {
            base = base.substring(0, 36);
        }
        String slug = base;
        int i = 2;
        while (store.slugTaken(slug)) {
            slug = base + "-" + i;
            i++;
        }
        return slug;
    }

    private boolean allowDemoAliases() {
        if (demoAliases) {
            return true;
        }
        return Arrays.stream(environment.getActiveProfiles())
                .anyMatch(p -> "seed".equalsIgnoreCase(p) || "demo".equalsIgnoreCase(p) || "local".equalsIgnoreCase(p));
    }

}
