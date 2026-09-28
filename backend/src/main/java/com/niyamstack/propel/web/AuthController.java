package com.niyamstack.propel.web;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.foundation.FoundationService;
import com.niyamstack.propel.integration.MailService;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.OtpService;
import com.niyamstack.propel.security.PasswordPolicy;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.ResetTokenService;
import com.niyamstack.propel.security.Roles;
import com.niyamstack.propel.security.SessionService;
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
import java.util.concurrent.ConcurrentHashMap;

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
    private final ConcurrentHashMap<String, Integer> ipFailures = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, PendingSignup> pendingSignups = new ConcurrentHashMap<>();

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
    public Map<String, Object> login(@Valid @RequestBody LoginRequest body, jakarta.servlet.http.HttpServletRequest request) {
        String ip = clientIp(request);
        guardIp(ip);
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
        clearLock(user, ip);
        audit.log("LOGIN", "AppUser", user.getId(), user.getEmail());
        return sessions.issue(user);
    }

    @PostMapping("/login/phone")
    @Transactional
    public Map<String, Object> loginPhone(@Valid @RequestBody PhoneLoginRequest body, jakarta.servlet.http.HttpServletRequest request) {
        String ip = clientIp(request);
        guardIp(ip);
        AppUser user = requirePhoneUser(body.phone());
        if (Roles.isPlatform(user.getRole())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid mobile or password");
        }
        if (!passwordOk(user, body.password(), ip, user.getPhone())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid mobile or password");
        }
        ensureActive(user);
        requireOrgAccess(user);
        clearLock(user, ip);
        audit.log("LOGIN_PHONE", "AppUser", user.getId(), user.getPhone());
        return sessions.issue(user);
    }

    @PostMapping("/otp/request")
    @Transactional
    public Map<String, Object> requestLoginOtp(@Valid @RequestBody PhoneRequest body) {
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
        } else if (!otp.reveal()) {
            // Local without SMTP: expose code only when reveal is off so login still works in dev.
            out.put("devOtp", issued.code());
        }
        out.put("emailMasked", maskEmail(user.getEmail()));
        out.put("channel", "email");
        return out;
    }

    @PostMapping("/otp/verify")
    @Transactional
    public Map<String, Object> verifyLoginOtp(@Valid @RequestBody OtpVerifyRequest body) {
        AppUser user = requirePhoneUser(body.phone());
        ensureActive(user);
        requireOrgAccess(user);
        otp.verify(user.getPhone(), OtpService.LOGIN, body.otp());
        if (!user.isEmailVerified()) {
            user.setEmailVerified(true);
            store.save(user);
        }
        clearLock(user, "otp");
        audit.log("LOGIN_OTP", "AppUser", user.getId(), user.getPhone());
        return sessions.issue(user);
    }

    @PostMapping("/signup")
    public Map<String, Object> signup(@Valid @RequestBody SignupRequest body) {
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
        pendingSignups.put(phone, new PendingSignup(
                body.instituteName().trim(),
                body.fullName().trim(),
                email,
                phone,
                encoder.encode(body.password()),
                com.niyamstack.propel.catalog.Packs.normalizePack(body.productPack()),
                Instant.now().plusSeconds(600)
        ));
        var issued = otp.issue(phone, OtpService.SIGNUP);
        Map<String, Object> out = new LinkedHashMap<>(otp.publicIssue(issued));
        if (mail.live() && mail.canDeliver(email)) {
            mail.sendOtp(email, OtpService.SIGNUP, issued.code());
        } else if (!otp.reveal()) {
            out.put("devOtp", issued.code());
        }
        out.put("emailMasked", maskEmail(email));
        out.put("channel", "email");
        out.put("status", "otp_sent");
        return out;
    }

    @PostMapping("/signup/verify")
    @Transactional
    public Map<String, Object> signupVerify(@Valid @RequestBody SignupVerifyRequest body) {
        String phone = requireMobile(body.phone());
        PendingSignup pending = pendingSignups.get(phone);
        if (pending == null || pending.expires().isBefore(Instant.now())) {
            pendingSignups.remove(phone);
            throw new ApiException(HttpStatus.BAD_REQUEST, "Signup expired. Start again and verify your email.");
        }
        otp.verify(phone, OtpService.SIGNUP, body.otp());
        pendingSignups.remove(phone);
        if (store.findUserByEmail(pending.email()) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        if (store.findUserByPhone(phone) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this mobile already exists");
        }

        Organization org = new Organization();
        org.setName(pending.instituteName());
        org.setLegalName(pending.instituteName());
        org.setEmail(pending.email());
        org.setPhone(phone);
        org.setPackageTier("STARTER");
        org.setProductPack(pending.productPack());
        org.setAccessStatus("DEMO");
        org.setPaymentStatus("UNPAID");
        org.setModulesCsv(com.niyamstack.propel.catalog.Packs.modulesCsvForPack(org.getProductPack()));
        org.setSlug(uniqueSlug(pending.instituteName()));
        org.setBrandPrimary("#0078f0");
        org.setBrandSecondary("#071a33");
        org = store.save(org);

        AppUser user = new AppUser();
        user.setOrganizationId(org.getId());
        user.setFullName(pending.fullName());
        user.setEmail(pending.email());
        user.setPhone(phone);
        user.setPasswordHash(pending.passwordHash());
        user.setRole(Roles.OWNER);
        user.setActive(true);
        user.setPasswordChangedAt(Instant.now());
        user.setEmailVerified(true);
        user = store.save(user);
        foundation.seedStarter(org.getId(), user.getId());
        audit.log("SIGNUP", "Organization", org.getId(), pending.email());
        if (mail.live() && mail.canDeliver(pending.email())) {
            mail.sendWelcome(pending.email(), user.getFullName());
        }
        return sessions.issue(user);
    }

    @PostMapping("/forgot/otp")
    @Transactional
    public Map<String, Object> forgotOtp(@Valid @RequestBody PhoneRequest body) {
        AppUser user = requirePhoneUser(body.phone());
        ensureActive(user);
        var issued = otp.issue(user.getPhone(), OtpService.RESET);
        emailOtp(user, OtpService.RESET, issued.code());
        return otp.publicIssue(issued);
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
        String token = resets.issue(user.getId());
        audit.log("PASSWORD_RESET_EMAIL", "AppUser", user.getId(), user.getEmail());
        if (mail.live() && mail.canDeliver(user.getEmail())) {
            mail.sendPasswordReset(user.getEmail(), token);
        }
        if (otp.reveal()) {
            return Map.of("status", "sent", "resetToken", token);
        }
        // Without live SMTP in local/dev, return token so reset can be tested.
        if (!mail.live()) {
            return Map.of("status", "sent", "resetToken", token);
        }
        return Map.of("status", "sent");
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

    @PatchMapping("/profile")
    @Transactional
    public Map<String, Object> updateProfile(@RequestBody ProfileUpdateRequest body) {
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
            user.setPhone(phone);
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
        return sessions.issue(user);
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

    private void emailOtp(AppUser user, String purpose, String code) {
        if (user == null || !mail.live() || !mail.canDeliver(user.getEmail())) {
            return;
        }
        mail.sendOtp(user.getEmail(), purpose, code);
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
            ipFailures.merge(ip, 1, Integer::sum);
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
        ipFailures.remove(ip);
    }

    private void guardIp(String ip) {
        if (ipFailures.getOrDefault(ip, 0) > 30) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again later.");
        }
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

    private static String requireMobile(String raw) {
        String phone = Phones.normalize(raw);
        if (!Phones.isMobile(phone)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid 10-digit Indian mobile number");
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

    private static String clientIp(jakarta.servlet.http.HttpServletRequest request) {
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }

    private record PendingSignup(
            String instituteName,
            String fullName,
            String email,
            String phone,
            String passwordHash,
            String productPack,
            Instant expires
    ) {}
}
