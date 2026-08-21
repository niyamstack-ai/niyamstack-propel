package com.niyamstack.propel.web;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Organization;
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
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
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
    private final ConcurrentHashMap<String, Integer> ipFailures = new ConcurrentHashMap<>();

    public AuthController(
            Store store,
            PasswordEncoder encoder,
            AuditService audit,
            OtpService otp,
            ResetTokenService resets,
            SessionService sessions
    ) {
        this.store = store;
        this.encoder = encoder;
        this.audit = audit;
        this.otp = otp;
        this.resets = resets;
        this.sessions = sessions;
    }

    public record LoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password
    ) {}

    public record PhoneRequest(@NotBlank String phone) {}

    public record OtpVerifyRequest(@NotBlank String phone, @NotBlank String otp) {}

    public record SignupRequest(
            @NotBlank String instituteName,
            @NotBlank String fullName,
            @NotBlank @Email String email,
            @NotBlank String phone,
            @NotBlank String password
    ) {}

    public record ForgotEmailRequest(@NotBlank @Email String email) {}

    public record ResetOtpRequest(@NotBlank String phone, @NotBlank String otp, @NotBlank String newPassword) {}

    public record ResetEmailRequest(@NotBlank String token, @NotBlank String newPassword) {}

    public record PasswordChangeRequest(@NotBlank String currentPassword, @NotBlank String newPassword) {}

    public record ProfileUpdateRequest(String name, String email, String phone) {}

    @PostMapping("/login")
    @Transactional
    public Map<String, Object> login(@Valid @RequestBody LoginRequest body, jakarta.servlet.http.HttpServletRequest request) {
        String ip = clientIp(request);
        guardIp(ip);
        AppUser user = store.findUserByEmail(body.email() == null ? "" : body.email().trim());
        if (user != null && Roles.isPlatform(user.getRole())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        if (!passwordOk(user, body.password(), ip, body.email())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        clearLock(user, ip);
        audit.log("LOGIN", "AppUser", user.getId(), user.getEmail());
        return sessions.issue(user);
    }

    @PostMapping("/otp/request")
    @Transactional
    public Map<String, Object> requestLoginOtp(@Valid @RequestBody PhoneRequest body) {
        AppUser user = requirePhoneUser(body.phone());
        ensureActive(user);
        return otp.publicIssue(otp.issue(user.getPhone(), OtpService.LOGIN));
    }

    @PostMapping("/otp/verify")
    @Transactional
    public Map<String, Object> verifyLoginOtp(@Valid @RequestBody OtpVerifyRequest body) {
        AppUser user = requirePhoneUser(body.phone());
        ensureActive(user);
        otp.verify(user.getPhone(), OtpService.LOGIN, body.otp());
        clearLock(user, "otp");
        audit.log("LOGIN_OTP", "AppUser", user.getId(), user.getPhone());
        return sessions.issue(user);
    }

    @PostMapping("/signup")
    @Transactional
    public Map<String, Object> signup(@Valid @RequestBody SignupRequest body) {
        String email = body.email().trim().toLowerCase();
        String phone = requireMobile(body.phone());
        if (store.findUserByEmail(email) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        if (store.findUserByPhone(phone) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this mobile already exists");
        }
        PasswordPolicy.validate(body.password());

        Organization org = new Organization();
        org.setName(body.instituteName().trim());
        org.setLegalName(body.instituteName().trim());
        org.setEmail(email);
        org.setPhone(phone);
        org.setPackageTier("STARTER");
        org.setAccessStatus("DEMO");
        org.setPaymentStatus("UNPAID");
        org.setModulesCsv(com.niyamstack.propel.platform.PlatformService.DEFAULT_MODULES);
        org.setSlug(uniqueSlug(body.instituteName()));
        org.setBrandPrimary("#0078f0");
        org.setBrandSecondary("#071a33");
        org = store.save(org);

        AppUser user = new AppUser();
        user.setOrganizationId(org.getId());
        user.setFullName(body.fullName().trim());
        user.setEmail(email);
        user.setPhone(phone);
        user.setPasswordHash(encoder.encode(body.password()));
        user.setRole(Roles.OWNER);
        user.setActive(true);
        user.setPasswordChangedAt(Instant.now());
        store.save(user);
        audit.log("SIGNUP", "Organization", org.getId(), email);
        return otp.publicIssue(otp.issue(phone, OtpService.LOGIN));
    }

    @PostMapping("/forgot/otp")
    @Transactional
    public Map<String, Object> forgotOtp(@Valid @RequestBody PhoneRequest body) {
        AppUser user = requirePhoneUser(body.phone());
        ensureActive(user);
        return otp.publicIssue(otp.issue(user.getPhone(), OtpService.RESET));
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
        if (otp.reveal()) {
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
            if (!email.contains("@")) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid email");
            }
            AppUser other = store.findUserByEmail(email);
            if (other != null && !other.getId().equals(user.getId())) {
                throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
            }
            user.setEmail(email);
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
        if (!encoder.matches(body.currentPassword(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Current password is incorrect");
        }
        PasswordPolicy.validate(body.newPassword());
        user.setPasswordHash(encoder.encode(body.newPassword()));
        user.setPasswordChangedAt(Instant.now());
        store.save(user);
        audit.log("PASSWORD_CHANGE", "AppUser", user.getId(), null);
        return Map.of("status", "updated");
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

    private static String clientIp(jakarta.servlet.http.HttpServletRequest request) {
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }
}
