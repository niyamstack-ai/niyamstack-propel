package com.niyamstack.propel.storefront;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.Announcement;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Assessment;
import com.niyamstack.propel.domain.Model.Assignment;
import com.niyamstack.propel.domain.Model.Batch;
import com.niyamstack.propel.domain.Model.Classroom;
import com.niyamstack.propel.domain.Model.ContentItem;
import com.niyamstack.propel.domain.Model.ContentProgress;
import com.niyamstack.propel.domain.Model.ExamAttempt;
import com.niyamstack.propel.domain.Model.LiveSession;
import com.niyamstack.propel.domain.Model.Submission;
import com.niyamstack.propel.domain.Model.Coupon;
import com.niyamstack.propel.domain.Model.Course;
import com.niyamstack.propel.domain.Model.CourseEnrollment;
import com.niyamstack.propel.domain.Model.Invoice;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.domain.Model.Payment;
import com.niyamstack.propel.domain.Model.Receipt;
import com.niyamstack.propel.domain.Model.SiteHit;
import com.niyamstack.propel.domain.Model.Student;
import com.niyamstack.propel.domain.Model.TimetableSlot;
import com.niyamstack.propel.grow.GrowService;
import com.niyamstack.propel.fees.FeeService;
import com.niyamstack.propel.integration.EventHook;
import com.niyamstack.propel.integration.MailService;
import com.niyamstack.propel.integration.PaymentGateway;
import com.niyamstack.propel.domain.Model.Inquiry;
import com.niyamstack.propel.platform.SettlementService;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.IpRateLimiter;
import com.niyamstack.propel.security.LicenseService;
import com.niyamstack.propel.security.OrgAccess;
import com.niyamstack.propel.security.OtpService;
import com.niyamstack.propel.security.PendingFlowService;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import com.niyamstack.propel.security.SessionService;
import com.niyamstack.propel.sis.StudentAccountService;
import com.niyamstack.propel.sis.WebsiteLeadService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class StorefrontService {
    private final Store store;
    private final PaymentGateway payments;
    private final PasswordEncoder encoder;
    private final SessionService sessions;
    private final EventHook hooks;
    private final FeeService fees;
    private final OtpService otp;
    private final StudentAccountService studentAccounts;
    private final LicenseService licenses;
    private final GrowService grow;
    private final SettlementService settlements;
    private final MailService mailService;
    private final PendingFlowService pendingFlows;
    private final WebsiteLeadService websiteLeads;
    private final ObjectMapper json;
    private final IpRateLimiter ipRateLimiter;

    public StorefrontService(Store store, PaymentGateway payments, PasswordEncoder encoder, SessionService sessions,
                             EventHook hooks, FeeService fees, OtpService otp, StudentAccountService studentAccounts,
                             LicenseService licenses, GrowService grow, SettlementService settlements, MailService mailService,
                             PendingFlowService pendingFlows, WebsiteLeadService websiteLeads, ObjectMapper json,
                             IpRateLimiter ipRateLimiter) {
        this.store = store;
        this.payments = payments;
        this.encoder = encoder;
        this.sessions = sessions;
        this.hooks = hooks;
        this.fees = fees;
        this.otp = otp;
        this.studentAccounts = studentAccounts;
        this.licenses = licenses;
        this.grow = grow;
        this.settlements = settlements;
        this.mailService = mailService;
        this.pendingFlows = pendingFlows;
        this.websiteLeads = websiteLeads;
        this.json = json;
        this.ipRateLimiter = ipRateLimiter;
    }

    public void guardPublicOtp(HttpServletRequest request) {
        ipRateLimiter.guard(request);
    }

    public Organization orgBySlug(String slug) {
        return store.findOrgBySlug(slug);
    }

    public boolean isLive(Organization org) {
        return org.isWebsitePublished();
    }

    public Organization liveOrg(String slug) {
        Organization org = orgBySlug(slug);
        OrgAccess.requireNotSuspended(org);
        if (isLive(org)) {
            return org;
        }
        throw new ApiException(HttpStatus.NOT_FOUND, "This institute website is not live yet");
    }

    public Map<String, Object> publicOrg(Organization org) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", org.getId());
        out.put("name", org.getName());
        out.put("slug", org.getSlug());
        out.put("logoUrl", org.getLogoUrl());
        out.put("logoHref", logoHrefFromSettings(org));
        out.put("brandPrimary", org.getBrandPrimary() == null ? "#0078f0" : org.getBrandPrimary());
        out.put("brandSecondary", org.getBrandSecondary() == null ? "#071a33" : org.getBrandSecondary());
        out.put("customDomain", org.getCustomDomain());
        out.put("websiteUrl", org.getWebsiteUrl());
        out.put("websitePublished", org.isWebsitePublished());
        out.put("live", isLive(org));
        out.put("phone", org.getPhone());
        out.put("email", org.getEmail());
        out.put("appShareUrl", org.getAppShareUrl() == null ? "" : org.getAppShareUrl());
        out.put("hasApp", true);
        out.put("hasOneToOne", !store.list(com.niyamstack.propel.domain.Model.OneToOneSession.class, org.getId()).isEmpty());
        out.put("hasJobs", !store.list(com.niyamstack.propel.domain.Model.Drive.class, org.getId()).isEmpty()
                || !store.list(com.niyamstack.propel.domain.Model.AlumniJob.class, org.getId()).isEmpty());
        out.putAll(hooks.tracking(org.getId()));
        try {
            out.put("pages", publicPages(org));
        } catch (Exception ignored) {
            out.put("pages", List.of());
        }
        return out;
    }

    /** Safe logo click target from org settingsJson.logoHref (http/https or site-relative path). */
    private String logoHrefFromSettings(Organization org) {
        if (org == null || org.getSettingsJson() == null || org.getSettingsJson().isBlank()) {
            return "";
        }
        try {
            JsonNode root = json.readTree(org.getSettingsJson());
            String raw = root.path("logoHref").asText("").trim();
            if (raw.isEmpty()) {
                return "";
            }
            String lower = raw.toLowerCase();
            if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
                return "";
            }
            if (raw.startsWith("/") || lower.startsWith("https://") || lower.startsWith("http://")) {
                return raw;
            }
            return "";
        } catch (Exception ignored) {
            return "";
        }
    }

    public List<Map<String, Object>> publicPages(Organization org) {
        return store.list(com.niyamstack.propel.domain.Model.WebsitePage.class, org.getId()).stream()
                .filter(p -> !p.isHidden())
                .sorted(Comparator.comparing(p -> p.getSortOrder() == null ? 0 : p.getSortOrder()))
                .map(p -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("title", p.getTitle());
                    row.put("slug", p.getSlug());
                    row.put("pageType", p.getPageType());
                    row.put("body", p.getBody());
                    return row;
                })
                .toList();
    }

    public Map<String, Object> publicPage(Organization org, String pageSlug) {
        return publicPages(org).stream()
                .filter(p -> pageSlug.equalsIgnoreCase(String.valueOf(p.get("slug"))))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Page not found"));
    }

    public List<Map<String, Object>> catalog(Organization org) {
        return store.list(Course.class, org.getId()).stream()
                .filter(c -> c.isActive() && c.isPublished() && c.getTrashedAt() == null)
                .map(this::publicCourse)
                .toList();
    }

    public Map<String, Object> course(Organization org, UUID courseId) {
        return course(org, courseId.toString());
    }

    public Map<String, Object> course(Organization org, String courseKey) {
        return publicCourse(resolvePublishedCourse(org, courseKey));
    }

    public Course resolvePublishedCourse(Organization org, String courseKey) {
        Course course = resolveCourse(org, courseKey);
        if (!course.isActive() || !course.isPublished() || course.getTrashedAt() != null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Course not found");
        }
        return course;
    }

    public Course resolveCourse(Organization org, String courseKey) {
        String key = courseKey == null ? "" : courseKey.trim();
        if (key.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Course not found");
        }
        try {
            return store.getOwned(Course.class, UUID.fromString(key), org.getId());
        } catch (IllegalArgumentException ignored) {
            return store.list(Course.class, org.getId()).stream()
                    .filter(c -> c.getShareSlug() != null && key.equalsIgnoreCase(c.getShareSlug()))
                    .findFirst()
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Course not found"));
        }
    }

    @Transactional
    public Map<String, Object> purchaseOtp(
            String slug,
            String fullName,
            String email,
            String phoneRaw,
            UUID courseId,
            String couponCode,
            String validityOption
    ) {
        PurchaseContext ctx = preparePurchase(slug, fullName, email, phoneRaw, courseId);
        String mail = ctx.email();
        String phone = ctx.phone();
        AppUser buyer = ctx.user() != null ? ctx.user() : resolveExistingStudentUser(ctx.org().getId(), mail, phone);
        // Existing student (login or SIS email/mobile match) — never send a fresh OTP.
        if (buyer != null) {
            boolean phoneOk = phoneMatchesAccount(buyer, phone);
            if (!phoneOk && !buyer.isEmailVerified()) {
                // Unverified email + wrong mobile: show the registered number so they can correct it.
                websiteLeads.touch(ctx.org().getId(), ctx.fullName(), mail, phone, courseId, "PURCHASE", "OTP_SENT");
                Map<String, Object> mismatch = new LinkedHashMap<>();
                mismatch.put("status", "phone_mismatch");
                mismatch.put("emailMasked", maskEmail(mail));
                mismatch.put("phoneMasked", maskPhone(buyer.getPhone()));
                mismatch.put("channel", "email");
                mismatch.put("existingAccount", true);
                return mismatch;
            }
            // Phone matches, email already verified, or SIS row linked this login → continue to pay.
            websiteLeads.touch(ctx.org().getId(), ctx.fullName(), mail, phone, courseId, "PURCHASE", "OTP_VERIFIED");
            Map<String, Object> skip = new LinkedHashMap<>();
            skip.put("status", "already_verified");
            skip.put("emailMasked", maskEmail(mail));
            skip.put("channel", "email");
            return skip;
        }
        // Student row exists for this email/mobile but has no login yet — still skip OTP; purchase creates/links login.
        Student sis = findStudentForBuyer(ctx.org().getId(), null, mail, phone);
        if (sis != null) {
            websiteLeads.touch(ctx.org().getId(), ctx.fullName(), mail, phone, courseId, "PURCHASE", "OTP_VERIFIED");
            Map<String, Object> skip = new LinkedHashMap<>();
            skip.put("status", "already_verified");
            skip.put("emailMasked", maskEmail(mail));
            skip.put("channel", "email");
            return skip;
        }
        // Incomplete tab (website_leads): skip OTP only after email was already proved.
        // OTP_SENT alone must NOT skip — that row is created as soon as we send the code, so a
        // phone match would otherwise treat a brand-new signup as already verified and break checkout.
        var incomplete = websiteLeads.findOpenLead(ctx.org().getId(), mail, phone);
        if (incomplete != null && WebsiteLeadService.emailAlreadyProven(incomplete)) {
            websiteLeads.touch(ctx.org().getId(), ctx.fullName(), mail, phone, courseId, "PURCHASE", "OTP_VERIFIED");
            Map<String, Object> skip = new LinkedHashMap<>();
            skip.put("status", "already_verified");
            skip.put("emailMasked", maskEmail(mail));
            skip.put("channel", "email");
            return skip;
        }
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("orgId", ctx.org().getId().toString());
        payload.put("fullName", ctx.fullName());
        payload.put("email", mail);
        payload.put("phone", phone);
        payload.put("courseId", courseId.toString());
        if (couponCode != null) {
            payload.put("couponCode", couponCode);
        }
        if (validityOption != null) {
            payload.put("validityOption", validityOption);
        }
        if (ctx.user() != null) {
            payload.put("userId", ctx.user().getId().toString());
        }
        try {
            pendingFlows.put("PURCHASE:" + phone, "PURCHASE", json.writeValueAsString(payload), Instant.now().plusSeconds(600));
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not start purchase verification");
        }
        var issued = otp.issue(phone, OtpService.VERIFY_EMAIL);
        Map<String, Object> out = new LinkedHashMap<>(otp.publicIssue(issued));
        if (mailService.live() && mailService.canDeliver(mail)) {
            mailService.sendOtp(mail, OtpService.VERIFY_EMAIL, issued.code());
        } else if (otp.reveal()) {
            out.put("devOtp", issued.code());
        } else if (!mailService.live() || !mailService.canDeliver(mail)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Email delivery is not configured. Configure SMTP or enable OTP reveal for local testing.");
        }
        websiteLeads.touch(ctx.org().getId(), ctx.fullName(), mail, phone, courseId, "PURCHASE", "OTP_SENT");
        out.put("emailMasked", maskEmail(mail));
        out.put("channel", "email");
        out.put("status", "otp_sent");
        if (ctx.user() != null) {
            out.put("existingAccount", true);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> purchase(
            String slug,
            String fullName,
            String email,
            String phoneRaw,
            UUID courseId,
            String couponCode,
            String validityOption,
            String otpCode
    ) {
        PurchaseContext ctx = preparePurchase(slug, fullName, email, phoneRaw, courseId);
        Organization org = ctx.org();
        Course course = ctx.course();
        String phone = ctx.phone();
        String mail = ctx.email();

        AppUser user = ctx.user();
        if (user == null) {
            user = resolveExistingStudentUser(org.getId(), mail, phone);
        }
        Student knownStudent = findStudentForBuyer(org.getId(), user, mail, phone);
        var incomplete = websiteLeads.findOpenLead(org.getId(), mail, phone);
        // Only skip OTP when Incomplete lead already proved inbox (OTP_VERIFIED / PAYMENT_STARTED).
        // Matching phone on an OTP_SENT lead is expected right after "Send email code" — still require OTP.
        boolean incompleteSkip = incomplete != null && WebsiteLeadService.emailAlreadyProven(incomplete);
        PropelUser principal = Auth.optional();
        boolean loggedStudentBuyer = principal != null && user != null && principal.userId().equals(user.getId());
        // New buyers must prove email via OTP. Known SIS/login/proven incomplete lead skips OTP.
        boolean needsVerify = (user == null && knownStudent == null && !incompleteSkip)
                || (user != null && !phoneMatchesAccount(user, phone) && !user.isEmailVerified());
        if (needsVerify) {
            String raw = pendingFlows.getPayload("PURCHASE:" + phone);
            if (raw == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Verify your email first. Request a code, then continue.");
            }
            Map<String, String> pending;
            try {
                pending = json.readValue(raw, new TypeReference<>() {});
            } catch (Exception e) {
                pendingFlows.remove("PURCHASE:" + phone);
                throw new ApiException(HttpStatus.BAD_REQUEST, "Verify your email first. Request a code, then continue.");
            }
            if (!org.getId().toString().equals(pending.get("orgId"))
                    || !mail.equalsIgnoreCase(pending.getOrDefault("email", ""))
                    || !courseId.toString().equals(pending.getOrDefault("courseId", ""))) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Details changed. Request a new email code.");
            }
            otp.verify(phone, OtpService.VERIFY_EMAIL, otpCode);
            pendingFlows.remove("PURCHASE:" + phone);
            fullName = pending.getOrDefault("fullName", fullName);
            mail = pending.getOrDefault("email", mail);
            couponCode = pending.get("couponCode");
            validityOption = pending.getOrDefault("validityOption", "a");
            String pendingUserId = pending.get("userId");
            if (user == null && pendingUserId != null && !pendingUserId.isBlank()) {
                try {
                    AppUser pendingUser = store.get(AppUser.class, UUID.fromString(pendingUserId));
                    if (pendingUser != null
                            && org.getId().equals(pendingUser.getOrganizationId())
                            && Roles.STUDENT.equals(pendingUser.getRole())
                            && mail.equalsIgnoreCase(pendingUser.getEmail())) {
                        user = pendingUser;
                    }
                } catch (Exception ignored) {
                    /* fall through — create path handles missing user */
                }
            }
            // Email OTP proves inbox ownership — always re-attach to that login (never insert a duplicate).
            AppUser proven = resolveExistingStudentUser(org.getId(), mail, phone);
            if (proven != null) {
                user = proven;
            }
            websiteLeads.touch(org.getId(), fullName, mail, phone, courseId, "PURCHASE", "OTP_VERIFIED");
        }

        // Always re-resolve before any insert (covers phone-match skip path too).
        AppUser existingLogin = resolveExistingStudentUser(org.getId(), mail, phone);
        if (existingLogin != null) {
            user = existingLogin;
        }

        Student student = findStudentForBuyer(org.getId(), user, mail, phone);
        if (user != null && student != null) {
            CourseEnrollment prior = store.listBy(CourseEnrollment.class, org.getId(), "studentId", student.getId()).stream()
                    .filter(e -> course.getId().equals(e.getCourseId()) && enrollmentActive(e))
                    .findFirst()
                    .orElse(null);
            if (prior != null) {
                return purchaseSession(user, course, null, null, true, false);
            }
        }

        BigDecimal listPrice = payable(course, validityOption);
        Coupon applied = couponFor(org.getId(), course.getId(), couponCode);
        if (applied != null) {
            listPrice = discounted(listPrice, applied);
        }
        OrgAccess.requireCanSell(org);
        BigDecimal price = settlements.checkoutAmount(org, listPrice);

        // Only defer account creation for brand-new buyers on live paid checkout.
        boolean deferAccount = price.signum() > 0 && payments.live(org.getId()) && user == null;

        if (!deferAccount) {
            if (user == null) {
                licenses.requireStudentCapacity(org);
                // Reuse same-org student login when email/mobile already exist (OTP already proved ownership above).
                AppUser byEmail = store.findUserByEmail(mail);
                AppUser byPhone = store.findUserByPhone(phone);
                AppUser reuse = null;
                if (byPhone != null && org.getId().equals(byPhone.getOrganizationId()) && Roles.STUDENT.equals(byPhone.getRole())) {
                    reuse = byPhone;
                } else if (byEmail != null && org.getId().equals(byEmail.getOrganizationId()) && Roles.STUDENT.equals(byEmail.getRole())) {
                    reuse = byEmail;
                } else if (byEmail != null) {
                    throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists. Log in to purchase.");
                } else if (byPhone != null) {
                    throw new ApiException(HttpStatus.CONFLICT, "An account with this mobile already exists. Log in to purchase.");
                }
                if (reuse != null) {
                    user = reuse;
                } else {
                    user = new AppUser();
                    user.setOrganizationId(org.getId());
                    user.setFullName(fullName.trim());
                    user.setEmail(mail);
                    user.setPhone(phone);
                    user.setPasswordHash(encoder.encode(UUID.randomUUID().toString()));
                    user.setRole(Roles.STUDENT);
                    user.setActive(true);
                    user.setPasswordChangedAt(Instant.now());
                    user.setEmailVerified(true);
                    user = store.save(user);
                }
            }
            // Sync existing / reused login (email verified, optional phone/name).
            {
                boolean dirty = false;
                if (!user.isEmailVerified()) {
                    user.setEmailVerified(true);
                    dirty = true;
                }
                if (!mail.equalsIgnoreCase(nullToEmpty(user.getEmail()))) {
                    AppUser emailOwner = store.findUserByEmail(mail);
                    if (emailOwner != null && !emailOwner.getId().equals(user.getId())) {
                        throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists. Log in to purchase.");
                    }
                    user.setEmail(mail);
                    dirty = true;
                }
                if (fullName != null && !fullName.isBlank() && !fullName.trim().equals(nullToEmpty(user.getFullName()))) {
                    user.setFullName(fullName.trim());
                    dirty = true;
                }
                if (!phoneMatchesAccount(user, phone)) {
                    // Proven via email OTP (or phone-match skip) — update mobile only when free.
                    AppUser phoneOwner = store.findUserByPhone(phone);
                    if (phoneOwner == null) {
                        user.setPhone(phone);
                        dirty = true;
                    } else if (!phoneOwner.getId().equals(user.getId())) {
                        // Keep existing account phone; checkout continues on the matched login.
                    }
                }
                if (dirty) {
                    user = store.save(user);
                }
            }

            if (student == null) {
                student = findStudentForBuyer(org.getId(), user, mail, phone);
            }
            if (student == null) {
                licenses.requireStudentCapacity(org);
                student = new Student();
                student.setOrganizationId(org.getId());
                student.setUserId(user.getId());
                student.setFullName(user.getFullName());
                student.setEmail(user.getEmail());
                student.setPhone(phone);
                student.setStudentCode(newStudentCode());
                // Not ENROLLED until Razorpay payment is captured — avoids dual Incomplete + Registered.
                student.setStatus(price.signum() > 0 && payments.live(org.getId()) ? "PAYMENT_PENDING" : "ENROLLED");
                student.setEnrollmentDate(LocalDate.now());
                student.setCourseId(course.getId());
                student = store.save(student);
            } else if (student.getUserId() == null || !student.getUserId().equals(user.getId())) {
                student.setUserId(user.getId());
                if (student.getEmail() == null || student.getEmail().isBlank()) {
                    student.setEmail(user.getEmail());
                }
                if (student.getPhone() == null || student.getPhone().isBlank()) {
                    student.setPhone(phone);
                }
                student = store.save(student);
            }
        } else {
            licenses.requireStudentCapacity(org);
        }

        Invoice invoice = new Invoice();
        invoice.setOrganizationId(org.getId());
        invoice.setStudentId(student == null ? null : student.getId());
        invoice.setCourseId(course.getId());
        invoice.setInvoiceNo("WEB-" + System.currentTimeMillis() % 1_000_000);
        invoice.setAmount(price);
        invoice.setPaidAmount(BigDecimal.ZERO);
        invoice.setStatus(price.signum() == 0 ? "PAID" : "DUE");
        invoice.setDueDate(LocalDate.now());
        invoice.setGstRate(new BigDecimal("18"));
        invoice.setSacCode("999293");
        invoice.setHsn("9992");
        invoice.setBuyerName(student == null ? fullName.trim() : student.getFullName());
        if (deferAccount) {
            invoice.setNotes(checkoutPendingNotes(fullName, mail, phone, validityOption, applied));
        } else if (applied != null) {
            invoice.setNotes("coupon:" + applied.getCode());
        }
        invoice = fees.finalizeInvoice(invoice);

        if (price.signum() == 0) {
            enroll(org, student, course, invoice, applied);
            redeemCoupon(applied);
            hooks.fire(org.getId(), "course.enrolled", Map.of("courseId", course.getId(), "price", 0));
            Receipt complimentary = complimentaryReceipt(org, invoice);
            emailPurchaseReceipt(user, course, invoice, complimentary);
            return purchaseSession(user, course, invoice, complimentary, false, !loggedStudentBuyer);
        }

        if (payments.live(org.getId())) {
            PaymentGateway.ChargeResult order = payments.createOrder(org.getId(), price, invoice.getInvoiceNo(),
                    Map.of("invoiceId", invoice.getId().toString(), "orgId", org.getId().toString(), "courseId", course.getId().toString()));
            Payment pending = new Payment();
            pending.setOrganizationId(org.getId());
            pending.setInvoiceId(invoice.getId());
            pending.setAmount(price);
            pending.setMethod("UPI");
            pending.setGatewayRef(order.gatewayRef());
            pending.setReceivedAt(Instant.now());
            pending.setStatus("PENDING");
            store.save(pending);
            websiteLeads.touch(org.getId(), fullName, mail, phone, course.getId(), "PURCHASE", "PAYMENT_STARTED");
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("checkout", true);
            out.put("keyId", payments.publicKey(org.getId()));
            out.put("orderId", order.gatewayRef());
            out.put("amountPaise", price.multiply(BigDecimal.valueOf(100)).longValue());
            out.put("currency", "INR");
            out.put("name", org.getName());
            out.put("invoiceId", invoice.getId());
            out.put("courseId", course.getId());
            out.put("phone", phone);
            out.put("loginHint", loginHint(phone));
            return out;
        }

        if (!payments.allowsDemoCheckout()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Online payments are not configured. Add Razorpay keys in Platform settings.");
        }

        PaymentGateway.ChargeResult charge = payments.charge(org.getId(), price, "UPI", invoice.getInvoiceNo());
        if (!charge.success()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, charge.message());
        }
        Payment payment = new Payment();
        payment.setOrganizationId(org.getId());
        payment.setInvoiceId(invoice.getId());
        payment.setAmount(price);
        payment.setMethod("UPI");
        payment.setGatewayRef(charge.gatewayRef());
        payment.setReceivedAt(Instant.now());
        payment.setStatus("CAPTURED");
        payment.setReceiptNo("RCPT-" + Instant.now().toEpochMilli());
        payment = store.save(payment);
        invoice.setPaidAmount(price);
        invoice.setStatus("PAID");
        store.save(invoice);
        redeemCoupon(applied);
        enroll(org, student, course, invoice, applied);
        fees.completeCapturedPayment(org, invoice, payment);
        hooks.fire(org.getId(), "course.purchased", Map.of("courseId", course.getId(), "amount", price));
        Receipt receipt = latestReceipt(org.getId(), invoice.getId());
        return purchaseSession(user, course, invoice, receipt, false, !loggedStudentBuyer);
    }

    @Transactional
    public Map<String, Object> confirmPurchase(String slug, UUID invoiceId, String orderId, String paymentId, String signature) {
        Organization org = liveOrg(slug);
        Invoice invoice = store.getOwned(Invoice.class, invoiceId, org.getId());
        if (invoice.getCourseId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This invoice is not a course purchase");
        }
        if (!payments.verifyCheckout(org.getId(), orderId, paymentId, signature)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Payment signature did not match. The fee was not marked paid.");
        }
        Course course = store.getOwned(Course.class, invoice.getCourseId(), org.getId());
        Student student = fulfillPaidCheckout(org, course, invoice, orderId, paymentId);
        AppUser user = store.get(AppUser.class, student.getUserId());
        Receipt receipt = latestReceipt(org.getId(), invoice.getId());
        return purchaseSession(user, course, invoice, receipt, false, false);
    }

    /**
     * Server-side recovery when browser confirm fails or webhook is not configured.
     * Asks Razorpay whether the order was paid, then captures + enrolls + converts the lead.
     */
    @Transactional
    public Map<String, Object> reconcilePurchase(String slug, UUID invoiceId, String orderId) {
        Organization org = liveOrg(slug);
        if (invoiceId == null || orderId == null || orderId.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invoice and order id are required");
        }
        Invoice invoice = store.getOwned(Invoice.class, invoiceId, org.getId());
        if (invoice.getCourseId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This invoice is not a course purchase");
        }
        if (!"PAID".equals(invoice.getStatus())) {
            String paymentId = payments.findCapturedPayment(org.getId(), orderId);
            if (paymentId == null || paymentId.isBlank()) {
                throw new ApiException(HttpStatus.CONFLICT, "Razorpay has not captured this payment yet. Wait a moment and try again.");
            }
            Course course = store.getOwned(Course.class, invoice.getCourseId(), org.getId());
            Student student = fulfillPaidCheckout(org, course, invoice, orderId, paymentId);
            AppUser user = store.get(AppUser.class, student.getUserId());
            Receipt receipt = latestReceipt(org.getId(), invoice.getId());
            return purchaseSession(user, course, invoice, receipt, false, false);
        }
        Course course = store.getOwned(Course.class, invoice.getCourseId(), org.getId());
        Student student = ensureStudentForWebPurchase(org, course, invoice);
        enroll(org, student, course, invoice, null);
        websiteLeads.markConverted(org.getId(), student.getEmail(), student.getPhone(), student.getId());
        AppUser user = store.get(AppUser.class, student.getUserId());
        Receipt receipt = latestReceipt(org.getId(), invoice.getId());
        return purchaseSession(user, course, invoice, receipt, false, false);
    }

    @Transactional
    public void webhookPaid(UUID orgId, UUID invoiceId, String orderId, String paymentId) {
        Invoice invoice = store.getOwned(Invoice.class, invoiceId, orgId);
        if (invoice.getCourseId() == null) {
            fees.captureFromWebhook(orgId, invoiceId, orderId, paymentId);
            return;
        }
        Course course = store.getOwned(Course.class, invoice.getCourseId(), orgId);
        Organization org = store.get(Organization.class, orgId);
        fulfillPaidCheckout(org, course, invoice, orderId, paymentId);
    }

    /**
     * Resolve a pending web checkout from Razorpay order id when webhook notes are missing.
     */
    @Transactional
    public boolean webhookPaidByOrder(UUID orgId, String orderId, String paymentId) {
        if (orgId == null || orderId == null || orderId.isBlank()) {
            return false;
        }
        Payment pending = store.listBy(Payment.class, orgId, "gatewayRef", orderId).stream()
                .filter(p -> "PENDING".equalsIgnoreCase(nullToEmpty(p.getStatus())))
                .findFirst()
                .orElse(null);
        if (pending == null) {
            return false;
        }
        webhookPaid(pending.getOrganizationId(), pending.getInvoiceId(), orderId, paymentId);
        return true;
    }

    /**
     * For Incomplete "Payment started" rows: ask Razorpay if paid and finish allotment.
     * Returns how many checkouts were fulfilled.
     */
    @Transactional
    public int reconcilePaymentStartedLeads(UUID orgId) {
        if (orgId == null || !payments.live(orgId)) {
            return 0;
        }
        int fulfilled = 0;
        List<Payment> pending = store.listBy(Payment.class, orgId, "status", "PENDING");
        for (Payment payment : pending) {
            if (payment.getGatewayRef() == null || !payment.getGatewayRef().startsWith("order_")) {
                continue;
            }
            Invoice invoice = store.getOwned(Invoice.class, payment.getInvoiceId(), orgId);
            if (invoice.getCourseId() == null || "PAID".equals(invoice.getStatus())) {
                continue;
            }
            String paymentId = payments.findCapturedPayment(orgId, payment.getGatewayRef());
            if (paymentId == null || paymentId.isBlank()) {
                continue;
            }
            try {
                Course course = store.getOwned(Course.class, invoice.getCourseId(), orgId);
                Organization org = store.get(Organization.class, orgId);
                fulfillPaidCheckout(org, course, invoice, payment.getGatewayRef(), paymentId);
                fulfilled++;
            } catch (Exception ignored) {
                /* leave pending for next sync */
            }
        }
        return fulfilled;
    }

    private Student fulfillPaidCheckout(
            Organization org, Course course, Invoice invoice, String orderId, String paymentId
    ) {
        Student student = ensureStudentForWebPurchase(org, course, invoice);
        // Signature was already verified by confirmPurchase; webhook/reconcile trust Razorpay server signals.
        fees.captureFromWebhook(org.getId(), invoice.getId(), orderId, paymentId);
        invoice = store.getOwned(Invoice.class, invoice.getId(), org.getId());
        student = store.getOwned(Student.class, invoice.getStudentId() != null ? invoice.getStudentId() : student.getId(), org.getId());
        enroll(org, student, course, invoice, null);
        redeemCouponFromInvoice(org, invoice);
        websiteLeads.markConverted(org.getId(), student.getEmail(), student.getPhone(), student.getId());
        hooks.fire(org.getId(), "course.purchased", Map.of("courseId", course.getId(), "amount", invoice.getAmount()));
        return student;
    }

    private void emailPurchaseReceipt(AppUser user, Course course, Invoice invoice, Receipt receipt) {
        if (user == null || course == null || invoice == null || receipt == null) {
            return;
        }
        try {
            String email = user.getEmail();
            if (email != null && !email.isBlank()) {
                mailService.sendPurchaseReceipt(
                        email,
                        receipt.getReceiptNo(),
                        invoice.getInvoiceNo(),
                        "₹" + receipt.getAmount(),
                        course.getName());
            }
        } catch (Exception ignored) {
            /* best-effort */
        }
    }

    private Map<String, Object> purchaseSession(AppUser user, Course course, Invoice invoice, Receipt receipt, boolean already, boolean includeLoginHint) {
        UUID studentId = null;
        if (user != null && user.getOrganizationId() != null) {
            studentId = store.listBy(Student.class, user.getOrganizationId(), "userId", user.getId()).stream()
                    .map(Student::getId)
                    .findFirst()
                    .orElse(null);
            websiteLeads.markConverted(user.getOrganizationId(), user.getEmail(), user.getPhone(), studentId);
        }
        Map<String, Object> session = new LinkedHashMap<>(sessions.issue(user));
        session.put("alreadyEnrolled", already);
        session.put("checkout", false);
        session.put("course", publicCourse(course));
        session.put("phone", user.getPhone());
        if (includeLoginHint) {
            session.put("loginHint", loginHint(user.getPhone()));
        }
        if (invoice != null) {
            session.put("invoiceId", invoice.getId());
            session.put("invoiceNo", invoice.getInvoiceNo());
        }
        if (receipt != null) {
            session.put("receiptId", receipt.getId());
            session.put("receiptNo", receipt.getReceiptNo());
        }
        return session;
    }

    private static String loginHint(String phone) {
        String mobile = phone == null || phone.isBlank() ? "this mobile number" : phone;
        return "Log in later with " + mobile + " on the institute website. We send an OTP — no password needed.";
    }

    private Receipt complimentaryReceipt(Organization org, Invoice invoice) {
        Receipt existing = latestReceipt(org.getId(), invoice.getId());
        if (existing != null) {
            return existing;
        }
        Receipt receipt = new Receipt();
        receipt.setOrganizationId(org.getId());
        receipt.setInvoiceId(invoice.getId());
        receipt.setReceiptNo("FREE-" + Instant.now().toEpochMilli());
        receipt.setAmount(BigDecimal.ZERO);
        receipt.setGstin(org.getGstin());
        receipt.setIssuedAt(Instant.now());
        return store.save(receipt);
    }

    private Receipt latestReceipt(UUID orgId, UUID invoiceId) {
        return store.listBy(Receipt.class, orgId, "invoiceId", invoiceId).stream().findFirst().orElse(null);
    }

    private void enroll(Organization org, Student student, Course course, Invoice invoice, Coupon applied) {
        String validityOption = validityOptionFromInvoice(invoice);
        Instant expiresAt = expiryFor(course, validityOption);
        CourseEnrollment cancelled = store.listBy(CourseEnrollment.class, org.getId(), "studentId", student.getId()).stream()
                .filter(e -> course.getId().equals(e.getCourseId()) && "CANCELLED".equals(e.getStatus()))
                .findFirst()
                .orElse(null);
        if (cancelled != null) {
            cancelled.setStatus("ACTIVE");
            cancelled.setInvoiceId(invoice.getId());
            cancelled.setPurchasedAt(Instant.now());
            cancelled.setExpiresAt(expiresAt);
            cancelled.setSource("WEBSITE");
            store.save(cancelled);
            markStudentEnrolled(student, course.getId());
            return;
        }
        CourseEnrollment existing = store.listBy(CourseEnrollment.class, org.getId(), "studentId", student.getId()).stream()
                .filter(e -> course.getId().equals(e.getCourseId()) && !"CANCELLED".equals(e.getStatus()))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            if (enrollmentActive(existing)) {
                markStudentEnrolled(student, course.getId());
                return;
            }
            existing.setInvoiceId(invoice.getId());
            existing.setPurchasedAt(Instant.now());
            existing.setExpiresAt(expiresAt);
            existing.setStatus("ACTIVE");
            existing.setSource("WEBSITE");
            store.save(existing);
            markStudentEnrolled(student, course.getId());
            return;
        }
        CourseEnrollment enrollment = new CourseEnrollment();
        enrollment.setOrganizationId(org.getId());
        enrollment.setStudentId(student.getId());
        enrollment.setCourseId(course.getId());
        enrollment.setInvoiceId(invoice.getId());
        enrollment.setStatus("ACTIVE");
        enrollment.setSource("WEBSITE");
        enrollment.setPurchasedAt(Instant.now());
        enrollment.setExpiresAt(expiresAt);
        store.save(enrollment);
        markStudentEnrolled(student, course.getId());
    }

    private void markStudentEnrolled(Student student, UUID courseId) {
        boolean dirty = false;
        if (student.getCourseId() == null && courseId != null) {
            student.setCourseId(courseId);
            dirty = true;
        }
        if (!"ENROLLED".equalsIgnoreCase(nullToEmpty(student.getStatus()))) {
            student.setStatus("ENROLLED");
            dirty = true;
        }
        if (student.getEnrollmentDate() == null) {
            student.setEnrollmentDate(LocalDate.now());
            dirty = true;
        }
        if (dirty) {
            store.save(student);
        }
    }

    public List<Map<String, Object>> myCourses(UUID orgId, UUID userId) {
        Student student = store.listBy(Student.class, orgId, "userId", userId).stream().findFirst().orElse(null);
        if (student == null) {
            return List.of();
        }
        Set<UUID> submittedExams = store.listBy(ExamAttempt.class, orgId, "studentId", student.getId()).stream()
                .filter(a -> "SUBMITTED".equals(a.getStatus()))
                .map(ExamAttempt::getAssessmentId)
                .collect(Collectors.toSet());
        Set<UUID> submittedAsg = store.listBy(Submission.class, orgId, "studentId", student.getId()).stream()
                .map(Submission::getAssignmentId)
                .collect(Collectors.toSet());
        Set<UUID> viewedContent = store.listBy(ContentProgress.class, orgId, "studentId", student.getId()).stream()
                .map(ContentProgress::getContentItemId)
                .collect(Collectors.toSet());
        List<CourseEnrollment> rows = store.listBy(CourseEnrollment.class, orgId, "studentId", student.getId());
        if (rows.isEmpty() && student.getCourseId() != null) {
            Course course = store.getOwned(Course.class, student.getCourseId(), orgId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("course", publicCourse(course));
            row.put("status", "ACTIVE");
            row.put("source", "BATCH");
            Map<String, Object> stats = courseProgressPct(orgId, course.getId(), submittedExams, submittedAsg, viewedContent);
            row.put("progressPct", stats.get("pct"));
            row.put("progress", stats);
            return List.of(row);
        }
        return rows.stream()
                .filter(e -> !"CANCELLED".equals(e.getStatus()))
                .map(e -> {
                    Course course = store.getOwned(Course.class, e.getCourseId(), orgId);
                    Map<String, Object> stats = courseProgressPct(orgId, course.getId(), submittedExams, submittedAsg, viewedContent);
                    boolean active = enrollmentActive(e);
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", e.getId());
                    row.put("status", active ? e.getStatus() : "EXPIRED");
                    row.put("expired", !active);
                    row.put("source", e.getSource());
                    row.put("expiresAt", e.getExpiresAt());
                    row.put("course", publicCourse(course));
                    row.put("progressPct", stats.get("pct"));
                    row.put("progress", stats);
                    return row;
                })
                .toList();
    }

    public Map<String, Object> studentHome(UUID orgId, UUID userId) {
        Student student = store.listBy(Student.class, orgId, "userId", userId).stream().findFirst().orElse(null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("courses", myCourses(orgId, userId));
        if (student == null) {
            out.put("today", Map.of());
            return out;
        }
        Set<UUID> courseIds = myCourses(orgId, userId).stream()
                .filter(row -> !Boolean.TRUE.equals(row.get("expired")))
                .map(row -> {
                    Object course = row.get("course");
                    if (course instanceof Map<?, ?> map) {
                        Object id = map.get("id");
                        return id instanceof UUID u ? u : UUID.fromString(String.valueOf(id));
                    }
                    return null;
                })
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Set<UUID> batchIds = store.list(Batch.class, orgId).stream()
                .filter(b -> b.getCourseId() != null && courseIds.contains(b.getCourseId()))
                .map(Batch::getId)
                .collect(Collectors.toSet());
        if (student.getBatchId() != null) {
            batchIds.add(student.getBatchId());
        }

        List<Map<String, Object>> live = new ArrayList<>();
        for (LiveSession session : store.list(LiveSession.class, orgId)) {
            if (session.getBatchId() == null || !batchIds.contains(session.getBatchId())) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("title", session.getTitle());
            row.put("startsAt", session.getStartsAt());
            row.put("meetingUrl", session.getMeetingUrl());
            row.put("courseName", courseNameForBatch(orgId, session.getBatchId()));
            live.add(row);
        }
        live.sort(Comparator.comparing(r -> r.get("startsAt") instanceof Instant i ? i : Instant.EPOCH, Comparator.reverseOrder()));

        int weekday = LocalDate.now(ZoneId.systemDefault()).getDayOfWeek().getValue();
        List<Map<String, Object>> classes = new ArrayList<>();
        for (TimetableSlot slot : store.list(TimetableSlot.class, orgId)) {
            if (slot.getBatchId() == null || !batchIds.contains(slot.getBatchId())) {
                continue;
            }
            if (slot.getDayOfWeek() == null || slot.getDayOfWeek() != weekday) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("subject", slot.getSubject());
            row.put("startTime", slot.getStartTime());
            row.put("endTime", slot.getEndTime());
            row.put("room", classroomName(orgId, slot.getClassroomId()));
            row.put("faculty", facultyName(slot.getFacultyUserId()));
            row.put("courseName", courseNameForBatch(orgId, slot.getBatchId()));
            classes.add(row);
        }

        List<Map<String, Object>> due = new ArrayList<>();
        for (Assignment asg : store.list(Assignment.class, orgId)) {
            if (!asg.isPublished()) {
                continue;
            }
            UUID cid = asg.getCourseId();
            if (cid == null && asg.getBatchId() != null) {
                try {
                    cid = store.get(Batch.class, asg.getBatchId()).getCourseId();
                } catch (Exception ignored) {
                    continue;
                }
            }
            if (cid == null || !courseIds.contains(cid)) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", asg.getId());
            row.put("title", asg.getTitle());
            row.put("dueAt", asg.getDueAt());
            row.put("courseId", cid);
            row.put("courseName", courseName(orgId, cid));
            due.add(row);
        }
        due.sort(Comparator.comparing(r -> r.get("dueAt") instanceof Instant i ? i : Instant.MAX));

        List<Map<String, Object>> tests = new ArrayList<>();
        Set<UUID> submittedExams = store.listBy(ExamAttempt.class, orgId, "studentId", student.getId()).stream()
                .filter(a -> "SUBMITTED".equals(a.getStatus()))
                .map(ExamAttempt::getAssessmentId)
                .collect(Collectors.toSet());
        Map<UUID, Integer> lastScore = store.listBy(ExamAttempt.class, orgId, "studentId", student.getId()).stream()
                .filter(a -> "SUBMITTED".equals(a.getStatus()) && a.getScore() != null)
                .collect(Collectors.toMap(ExamAttempt::getAssessmentId, ExamAttempt::getScore, (a, b) -> b));
        Map<UUID, Long> used = store.listBy(ExamAttempt.class, orgId, "studentId", student.getId()).stream()
                .filter(a -> "SUBMITTED".equals(a.getStatus()))
                .collect(Collectors.groupingBy(ExamAttempt::getAssessmentId, Collectors.counting()));
        for (Assessment exam : store.list(Assessment.class, orgId)) {
            if (!exam.isPublished() || "PRACTICE_LAB".equalsIgnoreCase(exam.getKind())) {
                continue;
            }
            if (exam.getScheduledAt() != null && exam.getScheduledAt().isAfter(Instant.now())) {
                continue;
            }
            if (exam.getCourseId() == null || !courseIds.contains(exam.getCourseId())) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", exam.getId());
            row.put("title", exam.getTitle());
            row.put("courseId", exam.getCourseId());
            row.put("courseName", courseName(orgId, exam.getCourseId()));
            row.put("lastScore", exam.isScoresPublished() ? lastScore.get(exam.getId()) : null);
            long taken = used.getOrDefault(exam.getId(), 0L);
            Integer max = exam.getMaxAttempts();
            row.put("attemptsLeft", max == null || max <= 0 ? null : Math.max(0, max - taken));
            row.put("done", submittedExams.contains(exam.getId()));
            tests.add(row);
        }

        List<Invoice> unpaid = store.listBy(Invoice.class, orgId, "studentId", student.getId()).stream()
                .filter(i -> i.getStatus() != null && !"PAID".equalsIgnoreCase(i.getStatus()) && !"CANCELLED".equalsIgnoreCase(i.getStatus()))
                .toList();
        BigDecimal dueTotal = unpaid.stream().map(Invoice::getAmount).filter(a -> a != null).reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String, Object> fees = new LinkedHashMap<>();
        fees.put("count", unpaid.size());
        fees.put("total", dueTotal);
        fees.put("invoiceNo", unpaid.isEmpty() ? null : unpaid.getFirst().getInvoiceNo());

        Announcement notice = store.list(Announcement.class, orgId).stream().findFirst().orElse(null);
        Map<String, Object> todayView = new LinkedHashMap<>();
        todayView.put("live", live.stream().limit(3).toList());
        todayView.put("classes", classes);
        todayView.put("due", due.stream().limit(5).toList());
        todayView.put("tests", tests);
        todayView.put("fees", fees);
        List<Map<String, Object>> certs = store.listBy(com.niyamstack.propel.domain.Model.Certificate.class, orgId, "studentId", student.getId()).stream()
                .map(c -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", c.getId());
                    row.put("title", c.getTitle());
                    row.put("certificateNo", c.getCertificateNo());
                    row.put("issuedOn", c.getIssuedOn());
                    return row;
                })
                .toList();
        todayView.put("certificates", certs);
        if (notice != null) {
            todayView.put("notice", Map.of("title", notice.getTitle() == null ? "" : notice.getTitle(), "body", notice.getBody() == null ? "" : notice.getBody()));
        }
        out.put("today", todayView);
        return out;
    }

    private String courseName(UUID orgId, UUID courseId) {
        try {
            return store.getOwned(Course.class, courseId, orgId).getName();
        } catch (Exception e) {
            return "Course";
        }
    }

    private String courseNameForBatch(UUID orgId, UUID batchId) {
        try {
            Batch batch = store.getOwned(Batch.class, batchId, orgId);
            return batch.getCourseId() == null ? "" : courseName(orgId, batch.getCourseId());
        } catch (Exception e) {
            return "";
        }
    }

    private String classroomName(UUID orgId, UUID classroomId) {
        if (classroomId == null) {
            return "";
        }
        try {
            return store.getOwned(Classroom.class, classroomId, orgId).getName();
        } catch (Exception e) {
            return "";
        }
    }

    private String facultyName(UUID userId) {
        if (userId == null) {
            return "";
        }
        try {
            return store.get(AppUser.class, userId).getFullName();
        } catch (Exception e) {
            return "";
        }
    }

    private Map<String, Object> courseProgressPct(UUID orgId, UUID courseId, Set<UUID> submittedExams, Set<UUID> submittedAsg, Set<UUID> viewedContent) {
        Set<UUID> batchIds = store.listBy(Batch.class, orgId, "courseId", courseId).stream().map(Batch::getId).collect(Collectors.toSet());
        List<Assessment> exams = store.list(Assessment.class, orgId).stream()
                .filter(Assessment::isPublished)
                .filter(a -> !"PRACTICE_LAB".equalsIgnoreCase(a.getKind()))
                .filter(a -> courseId.equals(a.getCourseId()) || (a.getBatchId() != null && batchIds.contains(a.getBatchId())))
                .toList();
        List<Assignment> homework = store.list(Assignment.class, orgId).stream()
                .filter(Assignment::isPublished)
                .filter(a -> courseId.equals(a.getCourseId()) || (a.getBatchId() != null && batchIds.contains(a.getBatchId())))
                .toList();
        List<ContentItem> materials = store.listBy(ContentItem.class, orgId, "courseId", courseId).stream()
                .filter(c -> c.isPublished() && !"FOLDER".equalsIgnoreCase(c.getContentType()))
                .toList();
        int filesTotal = materials.size();
        int filesDone = (int) materials.stream().filter(c -> viewedContent.contains(c.getId())).count();
        int hwTotal = homework.size();
        int hwDone = (int) homework.stream().filter(a -> submittedAsg.contains(a.getId())).count();
        int testTotal = exams.size();
        int testDone = (int) exams.stream().filter(a -> submittedExams.contains(a.getId())).count();
        int total = filesTotal + hwTotal + testTotal;
        int done = filesDone + hwDone + testDone;
        int pct = total == 0 ? 0 : (int) Math.min(100, done * 100L / total);
        String resume = materials.stream().filter(c -> !viewedContent.contains(c.getId())).map(ContentItem::getTitle).findFirst()
                .or(() -> homework.stream().filter(a -> !submittedAsg.contains(a.getId())).map(Assignment::getTitle).findFirst())
                .or(() -> exams.stream().filter(a -> !submittedExams.contains(a.getId())).map(Assessment::getTitle).findFirst())
                .orElse(pct >= 100 ? "Completed" : "Open to study");
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("pct", pct);
        stats.put("filesDone", filesDone);
        stats.put("filesTotal", filesTotal);
        stats.put("homeworkDone", hwDone);
        stats.put("homeworkTotal", hwTotal);
        stats.put("testsDone", testDone);
        stats.put("testsTotal", testTotal);
        stats.put("resume", resume);
        return stats;
    }

    public Map<String, Object> publicCourse(Course course) {
        BigDecimal fees = course.getFees() == null ? BigDecimal.ZERO : course.getFees();
        BigDecimal discount = course.getDiscount() == null ? BigDecimal.ZERO : course.getDiscount();
        Organization org = store.get(Organization.class, course.getOrganizationId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", course.getId());
        out.put("code", course.getCode());
        out.put("name", course.getName());
        out.put("description", course.getDescription());
        out.put("thumbnailUrl", course.getThumbnailUrl());
        out.put("category", course.getCategory());
        out.put("subCategory", course.getSubCategory());
        out.put("durationMonths", course.getDurationMonths());
        out.put("validityType", course.getValidityType());
        out.put("validityValue", course.getValidityValue());
        out.put("validityUnit", course.getValidityUnit());
        out.put("allowOffline", course.isAllowOffline());
        out.put("allowPreview", course.isAllowPreview());
        out.put("allowLive", course.isAllowLive());
        out.put("enableContents", course.isEnableContents());
        out.put("enableTests", course.isEnableTests());
        out.put("enableCoding", course.isEnableCoding());
        out.put("enableTimetable", course.isEnableTimetable());
        out.put("enableAssignments", course.isEnableAssignments());
        out.put("enableDoubts", course.isEnableDoubts());
        out.put("instituteName", org.getName());
        out.put("fees", fees);
        out.put("discount", discount);
        BigDecimal list = payable(course);
        out.put("listPrice", list);
        out.put("price", settlements.checkoutAmount(org, list));
        out.put("platformFeeMode", settlements.feeMode(org));
        out.put("platformFeePercent", settlements.feePercent(org));
        out.put("courseType", course.getCourseType() == null ? "PAID" : course.getCourseType());
        out.put("featured", course.isFeatured());
        out.put("shareSlug", course.getShareSlug() == null ? "" : course.getShareSlug());
        out.put("validityOptions", validityOptions(org, course));
        out.put("canSell", OrgAccess.active(org) && !OrgAccess.paymentFailed(org)
                && "PAID".equals(OrgAccess.payment(org)) && OrgAccess.hasBankDetails(org));
        return out;
    }

    private List<Map<String, Object>> validityOptions(Organization org, Course course) {
        List<Map<String, Object>> options = new ArrayList<>();
        Map<String, Object> primary = new LinkedHashMap<>();
        primary.put("id", "a");
        primary.put("label", validityLabel(course.getValidityType(), course.getValidityValue(), course.getValidityUnit(), course.getDurationMonths()));
        BigDecimal listA = payable(course, "a");
        primary.put("listPrice", listA);
        primary.put("price", settlements.checkoutAmount(org, listA));
        options.add(primary);
        if ("MULTIPLE".equalsIgnoreCase(course.getValidityType()) && course.getFeesAlt() != null && course.getFeesAlt().signum() > 0) {
            Map<String, Object> alt = new LinkedHashMap<>();
            alt.put("id", "b");
            alt.put("label", validityLabel("SINGLE", course.getValidityAltValue(), course.getValidityAltUnit(), course.getDurationMonths()));
            BigDecimal listB = payable(course, "b");
            alt.put("listPrice", listB);
            alt.put("price", settlements.checkoutAmount(org, listB));
            options.add(alt);
        }
        return options;
    }

    private static String validityLabel(String type, Integer value, String unit, Integer months) {
        if ("LIFETIME".equalsIgnoreCase(type)) {
            return "Lifetime access";
        }
        if (value != null && unit != null) {
            String u = unit.toLowerCase();
            if (!u.endsWith("s") && value != 1) {
                u = u + "s";
            }
            return value + " " + u;
        }
        if (months != null) {
            return months + " months";
        }
        return "Standard access";
    }

    public List<Map<String, Object>> courseOutline(Organization org, String courseKey) {
        Course published = resolvePublishedCourse(org, courseKey);
        UUID courseId = published.getId();
        boolean previewsOpen = published.isAllowPreview();
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        for (ContentItem item : store.listBy(ContentItem.class, org.getId(), "courseId", courseId)) {
            if (!item.isPublished()) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", item.getId());
            row.put("title", item.getTitle());
            row.put("type", item.getContentType());
            row.put("parentFolderId", item.getParentFolderId());
            row.put("sortOrder", item.getSortOrder() == null ? 0 : item.getSortOrder());
            String visibility = item.getVisibility() == null ? "COURSE" : item.getVisibility();
            row.put("visibility", visibility);
            boolean previewable = previewsOpen && "PREVIEW".equalsIgnoreCase(visibility);
            row.put("preview", previewable);
            if (previewable) {
                row.put("contentType", item.getContentType());
                row.put("url", publicContentUrl(item.getUrl()));
                if (item.getBody() != null && !item.getBody().isBlank()) {
                    row.put("body", item.getBody());
                }
            }
            rows.add(row);
        }
        for (Assessment exam : store.listBy(Assessment.class, org.getId(), "courseId", courseId)) {
            if (!exam.isPublished()) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", exam.getId());
            row.put("title", exam.getTitle());
            row.put("type", "TEST");
            row.put("parentFolderId", exam.getParentFolderId());
            row.put("sortOrder", exam.getSortOrder() == null ? 0 : exam.getSortOrder());
            row.put("visibility", "COURSE");
            row.put("preview", false);
            rows.add(row);
        }
        rows.sort((a, b) -> Integer.compare((Integer) a.get("sortOrder"), (Integer) b.get("sortOrder")));
        return rows;
    }

    private static String publicContentUrl(String url) {
        if (url == null || url.isBlank()) {
            return "";
        }
        if (url.contains("/api/files/")) {
            return url.replace("/api/files/", "/api/public/media/");
        }
        return url;
    }

    public Map<String, Object> applyCoupon(String slug, UUID courseId, String code, String validityOption) {
        Organization org = liveOrg(slug);
        Course course = store.getOwned(Course.class, courseId, org.getId());
        if (!course.isActive() || !course.isPublished()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Course not found");
        }
        Coupon coupon = couponFor(org.getId(), courseId, code);
        if (coupon == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This coupon is not valid for this course.");
        }
        String option = validityOption == null || validityOption.isBlank() ? "a" : validityOption.trim();
        BigDecimal original = payable(course, option);
        BigDecimal list = discounted(original, coupon);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("valid", true);
        out.put("code", coupon.getCode());
        out.put("originalPrice", original);
        out.put("listPrice", list);
        out.put("price", settlements.checkoutAmount(org, list));
        return out;
    }

    public String thumbnailKey(Course course) {
        String url = course.getThumbnailUrl();
        if (url == null || url.isBlank()) {
            return null;
        }
        String marker = url.contains("/api/public/media/") ? "/api/public/media/" : "/api/files/";
        int at = url.indexOf(marker);
        if (at < 0) {
            return null;
        }
        return url.substring(at + marker.length());
    }

    private Coupon couponFor(UUID orgId, UUID courseId, String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        String wanted = code.trim();
        return store.list(Coupon.class, orgId).stream()
                .filter(Coupon::isLive)
                .filter(c -> c.getCode() != null && c.getCode().equalsIgnoreCase(wanted))
                .filter(c -> c.getCourseId() == null || courseId.equals(c.getCourseId()))
                .filter(c -> c.getStartsAt() == null || !c.getStartsAt().isAfter(Instant.now()))
                .filter(c -> c.getEndsAt() == null || !c.getEndsAt().isBefore(Instant.now()))
                .filter(c -> c.getMaxRedemptions() == null || c.getMaxRedemptions() <= 0
                        || (c.getRedeemedCount() == null ? 0 : c.getRedeemedCount()) < c.getMaxRedemptions())
                .findFirst()
                .orElse(null);
    }

    private static BigDecimal discounted(BigDecimal price, Coupon coupon) {
        if (coupon.getDiscountValue() == null) {
            return price;
        }
        BigDecimal next = price;
        if ("PERCENT".equalsIgnoreCase(coupon.getDiscountType())) {
            next = price.subtract(price.multiply(coupon.getDiscountValue()).divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP));
        } else {
            next = price.subtract(coupon.getDiscountValue());
        }
        return next.signum() < 0 ? BigDecimal.ZERO : next;
    }

    public static boolean enrollmentActive(CourseEnrollment e) {
        if (e == null || "CANCELLED".equals(e.getStatus())) {
            return false;
        }
        return e.getExpiresAt() == null || e.getExpiresAt().isAfter(Instant.now());
    }

    static Instant expiryFor(Course course, String validityOption) {
        if (course == null) {
            return null;
        }
        String validityType = course.getValidityType();
        if (validityType != null && "LIFETIME".equalsIgnoreCase(validityType.trim())) {
            return null;
        }
        Integer value;
        String unit;
        if ("b".equalsIgnoreCase(validityOption)
                && course.getValidityAltValue() != null
                && course.getValidityAltValue() > 0) {
            value = course.getValidityAltValue();
            unit = course.getValidityAltUnit();
        } else {
            value = course.getValidityValue();
            unit = course.getValidityUnit();
        }
        if (validityType != null && "EXPIRY_DATE".equalsIgnoreCase(validityType.trim())) {
            return expiryEndOfCalendarDayIst(value);
        }
        if (value == null || value <= 0) {
            return null;
        }
        String u = unit == null ? "MONTH" : unit.trim().toUpperCase();
        if ("DATE".equals(u)) {
            return expiryEndOfCalendarDayIst(value);
        }
        Instant from = Instant.now();
        return switch (u) {
            case "DAY", "DAYS" -> from.plus(value, ChronoUnit.DAYS);
            case "YEAR", "YEARS" -> from.plus(value * 365L, ChronoUnit.DAYS);
            default -> from.plus(value, ChronoUnit.MONTHS);
        };
    }

    /** Calendar date YYYYMMDD — access through end of that day IST (exclusive start of next day). */
    private static Instant expiryEndOfCalendarDayIst(Integer yyyymmdd) {
        if (yyyymmdd == null || yyyymmdd <= 0) {
            return null;
        }
        int raw = yyyymmdd;
        int y = raw / 10000;
        int m = (raw / 100) % 100;
        int d = raw % 100;
        if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) {
            return null;
        }
        ZoneId ist = ZoneId.of("Asia/Kolkata");
        return LocalDate.of(y, m, d).plusDays(1).atStartOfDay(ist).toInstant();
    }

    private String validityOptionFromInvoice(Invoice invoice) {
        if (invoice == null || invoice.getNotes() == null) {
            return "a";
        }
        String notes = invoice.getNotes();
        if (notes.startsWith("pending:")) {
            String vo = parseCheckoutPending(notes).get("vo");
            if (vo != null && !vo.isBlank()) {
                return vo.trim();
            }
        }
        return "a";
    }

    private static BigDecimal payable(Course course) {
        return payable(course, "a");
    }

    private static BigDecimal payable(Course course, String option) {
        if ("FREE".equalsIgnoreCase(course.getCourseType())) {
            return BigDecimal.ZERO;
        }
        BigDecimal fees;
        if ("b".equalsIgnoreCase(option) && course.getFeesAlt() != null && course.getFeesAlt().signum() > 0) {
            fees = course.getFeesAlt();
        } else {
            fees = course.getFees() == null ? BigDecimal.ZERO : course.getFees();
        }
        BigDecimal discount = course.getDiscount() == null ? BigDecimal.ZERO : course.getDiscount();
        BigDecimal price = fees.subtract(discount);
        return price.signum() < 0 ? BigDecimal.ZERO : price;
    }

    @Transactional
    public void recordHit(Organization org, String kind, String path) {
        SiteHit hit = new SiteHit();
        hit.setOrganizationId(org.getId());
        hit.setKind(kind == null || kind.isBlank() ? "SESSION" : kind.trim().toUpperCase());
        hit.setPath(path);
        store.save(hit);
    }

    public Map<String, Object> registerOtp(String slug, String fullName, String email, String phoneRaw, UUID courseId) {
        Organization org = liveOrg(slug);
        OrgAccess.requireStorefrontOpen(org);
        licenses.requireStudentCapacity(org);
        if (fullName == null || fullName.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        String phone = StudentAccountService.requireMobile(phoneRaw);
        AppUser existing = store.findUserByPhone(phone);
        if (existing != null && !org.getId().equals(existing.getOrganizationId())) {
            throw new ApiException(HttpStatus.CONFLICT, "This mobile is already used on another institute");
        }
        if (existing != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account already exists for this mobile. Log in instead.");
        }
        if (email == null || email.isBlank() || !email.contains("@") || !mailService.canDeliver(email)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a real email. OTP is sent to email.");
        }
        String mail = email.trim().toLowerCase();
        if (store.findUserByEmail(mail) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        if (courseId != null) {
            Course course = store.getOwned(Course.class, courseId, org.getId());
            if (!course.isActive() || !course.isPublished()) {
                throw new ApiException(HttpStatus.NOT_FOUND, "Course not found");
            }
        }
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("orgId", org.getId().toString());
        payload.put("fullName", fullName.trim());
        payload.put("email", mail);
        if (courseId != null) {
            payload.put("courseId", courseId.toString());
        }
        try {
            pendingFlows.put("REGISTER:" + phone, "STUDENT_REGISTER", json.writeValueAsString(payload), Instant.now().plusSeconds(600));
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not start registration");
        }
        var issued = otp.issue(phone, OtpService.STUDENT_REGISTER);
        Map<String, Object> out = new LinkedHashMap<>(otp.publicIssue(issued));
        if (mailService.live() && mailService.canDeliver(mail)) {
            mailService.sendOtp(mail, OtpService.STUDENT_REGISTER, issued.code());
        } else if (otp.reveal()) {
            out.put("devOtp", issued.code());
        } else if (!mailService.live() || !mailService.canDeliver(mail)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Email delivery is not configured. Configure SMTP or enable OTP reveal for local testing.");
        }
        websiteLeads.touch(org.getId(), fullName.trim(), mail, phone, courseId, "REGISTER", "OTP_SENT");
        out.put("emailMasked", maskEmail(mail));
        out.put("channel", "email");
        return out;
    }

    @Transactional
    public Map<String, Object> registerVerify(String slug, String phoneRaw, String code) {
        Organization org = liveOrg(slug);
        OrgAccess.requireStorefrontOpen(org);
        licenses.requireStudentCapacity(org);
        String phone = StudentAccountService.requireMobile(phoneRaw);
        String raw = pendingFlows.getPayload("REGISTER:" + phone);
        if (raw == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Request a new OTP, then try again");
        }
        Map<String, String> pending;
        try {
            pending = json.readValue(raw, new TypeReference<>() {});
        } catch (Exception e) {
            pendingFlows.remove("REGISTER:" + phone);
            throw new ApiException(HttpStatus.BAD_REQUEST, "Request a new OTP, then try again");
        }
        if (!org.getId().toString().equals(pending.get("orgId"))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Request a new OTP, then try again");
        }
        otp.verify(phone, OtpService.STUDENT_REGISTER, code);
        pendingFlows.remove("REGISTER:" + phone);
        if (store.findUserByPhone(phone) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account already exists for this mobile. Log in instead.");
        }
        String email = pending.getOrDefault("email", "");
        if (store.findUserByEmail(email) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        AppUser user = new AppUser();
        user.setOrganizationId(org.getId());
        user.setFullName(pending.getOrDefault("fullName", ""));
        user.setEmail(email);
        user.setPhone(phone);
        user.setPasswordHash(encoder.encode(UUID.randomUUID().toString()));
        user.setRole(Roles.STUDENT);
        user.setActive(true);
        user.setEmailVerified(true);
        user.setPasswordChangedAt(Instant.now());
        user = store.save(user);

        Student student = new Student();
        student.setOrganizationId(org.getId());
        student.setUserId(user.getId());
        student.setFullName(user.getFullName());
        student.setEmail(user.getEmail());
        student.setPhone(phone);
        student.setStudentCode("STU-" + System.currentTimeMillis() % 1_000_000);
        student.setStatus("ENROLLED");
        student.setEnrollmentDate(LocalDate.now());
        UUID courseId = null;
        if (pending.get("courseId") != null && !pending.get("courseId").isBlank()) {
            try {
                courseId = UUID.fromString(pending.get("courseId"));
            } catch (Exception ignored) {
                courseId = null;
            }
        }
        student.setCourseId(courseId);
        student = store.save(student);
        if (courseId != null) {
            Course course = store.getOwned(Course.class, courseId, org.getId());
            if ("FREE".equalsIgnoreCase(course.getCourseType())) {
                OrgAccess.requireCanSell(org);
                studentAccounts.enrollIfCourse(org.getId(), student, course.getId(), "WEBSITE");
            }
        }
        websiteLeads.markConverted(org.getId(), email, phone, student.getId());
        hooks.fire(org.getId(), "student.registered", Map.of("studentId", student.getId()));
        return sessions.issue(user);
    }

    @Transactional
    public Map<String, Object> enquire(String slug, String fullName, String email, String phoneRaw, String message, UUID courseId, String landingSlug, String referralCode, Map<String, String> answers) {
        Organization org = orgBySlug(slug);
        if (fullName == null || fullName.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        String phone = StudentAccountService.requireMobile(phoneRaw);
        Inquiry inquiry = new Inquiry();
        inquiry.setOrganizationId(org.getId());
        inquiry.setFullName(fullName.trim());
        inquiry.setEmail(email == null || email.isBlank() ? null : email.trim().toLowerCase());
        inquiry.setPhone(phone);
        inquiry.setSource("WEB");
        inquiry.setStage("NEW");
        inquiry.setCourseId(courseId);
        String notes = message == null ? "" : message.trim();
        String extra = answersJson(answers);
        if (extra != null) {
            inquiry.setCustomJson(extra);
            String labelled = answersNote(answers);
            notes = notes.isBlank() ? labelled : notes + "\n" + labelled;
        }
        inquiry.setNotes(notes.isBlank() ? null : notes);
        inquiry = store.save(inquiry);
        grow.attributeLead(inquiry, landingSlug, referralCode);
        hooks.fire(org.getId(), "inquiry.created", Map.of("inquiryId", inquiry.getId(), "source", inquiry.getSource() == null ? "WEB" : inquiry.getSource()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", inquiry.getId());
        return out;
    }

    private static String answersJson(Map<String, String> answers) {
        if (answers == null || answers.isEmpty()) {
            return null;
        }
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> row : answers.entrySet()) {
            if (row.getKey() == null || row.getKey().isBlank()) {
                continue;
            }
            if (!first) {
                sb.append(',');
            }
            first = false;
            sb.append('"').append(jsonEscape(row.getKey())).append("\":\"");
            sb.append(jsonEscape(row.getValue() == null ? "" : row.getValue())).append('"');
        }
        sb.append('}');
        return first ? null : sb.toString();
    }

    private static String answersNote(Map<String, String> answers) {
        if (answers == null || answers.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> row : answers.entrySet()) {
            if (row.getKey() == null || row.getKey().isBlank() || row.getValue() == null || row.getValue().isBlank()) {
                continue;
            }
            if (!sb.isEmpty()) {
                sb.append('\n');
            }
            sb.append(row.getKey().trim()).append(": ").append(row.getValue().trim());
        }
        return sb.toString();
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) {
            return "";
        }
        String[] parts = email.split("@", 2);
        String user = parts[0];
        String domain = parts[1];
        String visible = user.length() <= 1 ? "*" : user.charAt(0) + "***";
        return visible + "@" + domain;
    }

    /** e.g. 9876543210 → ******3210 ; +91 98765 43210 → ******3210 */
    private static String maskPhone(String phone) {
        if (phone == null || phone.isBlank()) {
            return "";
        }
        String digits = phone.replaceAll("\\D", "");
        if (digits.length() <= 4) {
            return "****";
        }
        return "*".repeat(Math.min(6, digits.length() - 4)) + digits.substring(digits.length() - 4);
    }

    private PurchaseContext preparePurchase(String slug, String fullName, String email, String phoneRaw, UUID courseId) {
        Organization org = liveOrg(slug);
        if (courseId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Course is required");
        }
        Course course = store.getOwned(Course.class, courseId, org.getId());
        if (!course.isActive() || !course.isPublished() || course.getTrashedAt() != null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "This course is not published yet");
        }

        PropelUser principal = Auth.optional();
        AppUser sessionUser = null;
        if (principal != null && Roles.STUDENT.equals(principal.role()) && org.getId().equals(principal.organizationId())) {
            sessionUser = store.get(AppUser.class, principal.userId());
        }

        String phone = Phones.normalize(phoneRaw);
        if (!Phones.isMobile(phone) && sessionUser != null && Phones.isMobile(sessionUser.getPhone())) {
            phone = sessionUser.getPhone();
        }
        if (!Phones.isMobile(phone)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid mobile number with country code");
        }

        String name = fullName == null || fullName.isBlank()
                ? (sessionUser == null ? "" : sessionUser.getFullName())
                : fullName.trim();
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required");
        }

        String mail = email == null || email.isBlank()
                ? (sessionUser == null ? "" : sessionUser.getEmail())
                : email.trim().toLowerCase();
        if (mail == null || mail.isBlank() || !mail.contains("@") || !mailService.canDeliver(mail)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a real email address. We send a verification code there.");
        }

        AppUser user = store.findUserByPhone(phone);
        if (user == null && sessionUser != null && phoneMatchesAccount(sessionUser, phone)) {
            user = sessionUser;
        }
        AppUser byEmail = store.findUserByEmail(mail);
        if (user != null && byEmail != null && !user.getId().equals(byEmail.getId())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "This mobile and email belong to different accounts. Log in, or use matching details.");
        }
        if (user == null && byEmail != null) {
            if (!org.getId().equals(byEmail.getOrganizationId())) {
                throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists. Log in to purchase.");
            }
            if (!Roles.STUDENT.equals(byEmail.getRole())) {
                throw new ApiException(HttpStatus.CONFLICT, "This email belongs to a staff account. Use a student email.");
            }
            // Same institute student — continue as that account; email OTP proves ownership when mobile differs.
            user = byEmail;
        }
        // Student.email often differs from users.email (e.g. *@student.local login) — resolve via SIS row.
        if (user == null) {
            user = resolveExistingStudentUser(org.getId(), mail, phone);
        }
        if (user != null && !org.getId().equals(user.getOrganizationId())) {
            throw new ApiException(HttpStatus.CONFLICT, "This mobile is already used on another institute");
        }
        if (user != null && !Roles.STUDENT.equals(user.getRole())) {
            throw new ApiException(HttpStatus.CONFLICT, "This mobile belongs to a staff account. Use a student number.");
        }
        return new PurchaseContext(org, course, name, mail, phone, user);
    }

    private static boolean phoneMatchesAccount(AppUser user, String phone) {
        if (user == null || phone == null || phone.isBlank()) {
            return false;
        }
        String account = Phones.normalize(user.getPhone());
        if (account.isBlank()) {
            return false;
        }
        if (account.equals(phone)) {
            return true;
        }
        return Phones.lookupKeys(account).contains(phone) || Phones.lookupKeys(phone).contains(account);
    }

    private AppUser resolveExistingStudentUser(UUID orgId, String mail, String phone) {
        AppUser byPhone = store.findUserByPhone(phone);
        if (byPhone != null && orgId.equals(byPhone.getOrganizationId()) && Roles.STUDENT.equals(byPhone.getRole())) {
            return byPhone;
        }
        AppUser byEmail = store.findUserByEmail(mail);
        if (byEmail != null && orgId.equals(byEmail.getOrganizationId()) && Roles.STUDENT.equals(byEmail.getRole())) {
            return byEmail;
        }
        Student linked = findStudentForBuyer(orgId, null, mail, phone);
        if (linked != null && linked.getUserId() != null) {
            AppUser viaStudent = store.get(AppUser.class, linked.getUserId());
            if (viaStudent != null && orgId.equals(viaStudent.getOrganizationId()) && Roles.STUDENT.equals(viaStudent.getRole())) {
                return viaStudent;
            }
        }
        return null;
    }

    private Student findStudentForBuyer(UUID orgId, AppUser user, String mail, String phone) {
        if (user != null) {
            Student byUser = store.listBy(Student.class, orgId, "userId", user.getId()).stream().findFirst().orElse(null);
            if (byUser != null) {
                return byUser;
            }
        }
        String wantMail = mail == null ? "" : mail.trim().toLowerCase();
        List<Student> rows = store.list(Student.class, orgId);
        for (Student s : rows) {
            if (s.getTrashedAt() != null) {
                continue;
            }
            if (!wantMail.isBlank() && wantMail.equalsIgnoreCase(nullToEmpty(s.getEmail()))) {
                return s;
            }
        }
        for (Student s : rows) {
            if (s.getTrashedAt() != null) {
                continue;
            }
            if (phoneMatchesAccountPhone(s.getPhone(), phone)) {
                return s;
            }
        }
        return null;
    }

    private static boolean phoneMatchesAccountPhone(String accountPhone, String phone) {
        if (accountPhone == null || accountPhone.isBlank() || phone == null || phone.isBlank()) {
            return false;
        }
        String account = Phones.normalize(accountPhone);
        String want = Phones.normalize(phone);
        if (account.isBlank() || want.isBlank()) {
            return false;
        }
        if (account.equals(want)) {
            return true;
        }
        return Phones.lookupKeys(account).contains(want) || Phones.lookupKeys(want).contains(account);
    }

    private static String newStudentCode() {
        return "STU-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private record PurchaseContext(
            Organization org,
            Course course,
            String fullName,
            String email,
            String phone,
            AppUser user
    ) {}

    private void redeemCoupon(Coupon applied) {
        if (applied == null) {
            return;
        }
        applied.setRedeemedCount((applied.getRedeemedCount() == null ? 0 : applied.getRedeemedCount()) + 1);
        store.save(applied);
    }

    private void redeemCouponFromInvoice(Organization org, Invoice invoice) {
        if (invoice == null || invoice.getNotes() == null) {
            return;
        }
        String notes = invoice.getNotes();
        String code = null;
        if (notes.startsWith("coupon:")) {
            code = notes.substring("coupon:".length()).trim();
        } else if (notes.startsWith("pending:")) {
            Map<String, String> meta = parseCheckoutPending(notes);
            code = meta.get("cp");
        }
        if (code == null || code.isBlank()) {
            return;
        }
        Coupon applied = couponFor(org.getId(), invoice.getCourseId(), code);
        redeemCoupon(applied);
        invoice.setNotes(null);
        store.save(invoice);
    }

    private String checkoutPendingNotes(String fullName, String email, String phone, String validityOption, Coupon applied) {
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("fn", fullName == null ? "" : fullName.trim());
        payload.put("em", email == null ? "" : email.trim().toLowerCase());
        payload.put("ph", phone == null ? "" : phone);
        if (validityOption != null && !validityOption.isBlank()) {
            payload.put("vo", validityOption.trim());
        }
        if (applied != null && applied.getCode() != null) {
            payload.put("cp", applied.getCode());
        }
        try {
            return "pending:" + json.writeValueAsString(payload);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not start checkout");
        }
    }

    private Map<String, String> parseCheckoutPending(String notes) {
        if (notes == null || !notes.startsWith("pending:")) {
            return Map.of();
        }
        try {
            return json.readValue(notes.substring("pending:".length()), new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private Student ensureStudentForWebPurchase(Organization org, Course course, Invoice invoice) {
        if (invoice.getStudentId() != null) {
            return store.getOwned(Student.class, invoice.getStudentId(), org.getId());
        }
        Map<String, String> meta = parseCheckoutPending(invoice.getNotes());
        String mail = meta.getOrDefault("em", invoice.getBuyerName() == null ? "" : invoice.getBuyerName());
        String phone = meta.getOrDefault("ph", "");
        String fullName = meta.getOrDefault("fn", invoice.getBuyerName() == null ? "Student" : invoice.getBuyerName());
        if (mail.isBlank() || !mail.contains("@") || !Phones.isMobile(phone)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Checkout is missing buyer details");
        }
        AppUser existing = resolveExistingStudentUser(org.getId(), mail, phone);
        if (existing != null) {
            Student linked = findStudentForBuyer(org.getId(), existing, mail, phone);
            if (linked != null) {
                if (linked.getUserId() == null || !linked.getUserId().equals(existing.getId())) {
                    linked.setUserId(existing.getId());
                    linked = store.save(linked);
                }
                invoice.setStudentId(linked.getId());
                store.save(invoice);
                return linked;
            }
        }
        licenses.requireStudentCapacity(org);
        if (existing == null && store.findUserByEmail(mail) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists. Log in to purchase.");
        }
        if (existing == null && store.findUserByPhone(phone) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this mobile already exists. Log in to purchase.");
        }
        AppUser user = existing;
        if (user == null) {
            user = new AppUser();
            user.setOrganizationId(org.getId());
            user.setFullName(fullName.trim());
            user.setEmail(mail);
            user.setPhone(phone);
            user.setPasswordHash(encoder.encode(UUID.randomUUID().toString()));
            user.setRole(Roles.STUDENT);
            user.setActive(true);
            user.setEmailVerified(true);
            user.setPasswordChangedAt(Instant.now());
            user = store.save(user);
        }
        Student student = findStudentForBuyer(org.getId(), user, mail, phone);
        if (student == null) {
            student = new Student();
            student.setOrganizationId(org.getId());
            student.setUserId(user.getId());
            student.setFullName(user.getFullName());
            student.setEmail(user.getEmail());
            student.setPhone(phone);
            student.setStudentCode(newStudentCode());
            student.setStatus("ENROLLED");
            student.setEnrollmentDate(LocalDate.now());
            student.setCourseId(course.getId());
            student = store.save(student);
        } else if (student.getUserId() == null || !student.getUserId().equals(user.getId())) {
            student.setUserId(user.getId());
            student = store.save(student);
        }
        invoice.setStudentId(student.getId());
        store.save(invoice);
        return student;
    }
}
