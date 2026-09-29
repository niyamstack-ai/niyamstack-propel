package com.niyamstack.propel.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.domain.Model.Student;
import com.niyamstack.propel.platform.PlatformService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OauthLoginService {
    public static final String PURPOSE_STATE = "OAUTH_STATE";
    public static final String PURPOSE_TICKET = "OAUTH_TICKET";

    private final OauthProviders providers;
    private final PendingFlowService pendingFlows;
    private final Store store;
    private final SessionService sessions;
    private final AuditService audit;
    private final PasswordEncoder encoder;
    private final PlatformService platform;
    private final ObjectMapper json;

    public OauthLoginService(
            OauthProviders providers,
            PendingFlowService pendingFlows,
            Store store,
            SessionService sessions,
            AuditService audit,
            PasswordEncoder encoder,
            PlatformService platform,
            ObjectMapper json
    ) {
        this.providers = providers;
        this.pendingFlows = pendingFlows;
        this.store = store;
        this.sessions = sessions;
        this.audit = audit;
        this.encoder = encoder;
        this.platform = platform;
        this.json = json;
    }

    public Map<String, Object> providerStatus() {
        return providers.status();
    }

    @Transactional
    public String begin(String provider, String surface, String returnTo, String slug) {
        String p = providers.normalizeProvider(provider);
        String surf = normalizeSurface(surface);
        String state = UUID.randomUUID().toString().replace("-", "");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("provider", p);
        payload.put("surface", surf);
        payload.put("returnTo", safeReturnTo(returnTo, surf, slug));
        if (slug != null && !slug.isBlank()) {
            payload.put("slug", slug.trim().toLowerCase());
        }
        try {
            pendingFlows.put(state, PURPOSE_STATE, json.writeValueAsString(payload), Instant.now().plusSeconds(600));
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not start sign-in");
        }
        return providers.authorizeUrl(p, state);
    }

    @Transactional
    public String finish(String provider, String code, String state) {
        String p = providers.normalizeProvider(provider);
        String raw = pendingFlows.getPayload(state);
        if (raw == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Sign-in expired. Start again.");
        }
        Map<String, Object> statePayload;
        try {
            statePayload = json.readValue(raw, new TypeReference<>() {});
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid sign-in state");
        }
        if (!p.equals(String.valueOf(statePayload.get("provider")))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Provider mismatch");
        }
        String surface = String.valueOf(statePayload.getOrDefault("surface", "institute"));
        String returnTo = String.valueOf(statePayload.getOrDefault("returnTo", "/"));
        String slug = statePayload.get("slug") == null ? null : String.valueOf(statePayload.get("slug"));
        OauthProviders.Identity identity = providers.exchange(p, code);
        AppUser user = resolveUser(surface, slug, identity);
        user.setEmailVerified(true);
        if ((user.getFullName() == null || user.getFullName().isBlank()) && identity.name() != null && !identity.name().isBlank()) {
            user.setFullName(identity.name().trim());
        }
        store.save(user);
        audit.log("OAUTH_LOGIN", "AppUser", user.getId(), p + ":" + identity.email());

        pendingFlows.consume(state);
        String ticket = UUID.randomUUID().toString().replace("-", "");
        Map<String, Object> ticketPayload = new LinkedHashMap<>();
        ticketPayload.put("userId", user.getId().toString());
        ticketPayload.put("surface", surface);
        ticketPayload.put("returnTo", returnTo);
        try {
            pendingFlows.put(ticket, PURPOSE_TICKET, json.writeValueAsString(ticketPayload), Instant.now().plusSeconds(120));
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not finish sign-in");
        }
        String sep = returnTo.contains("?") ? "&" : "?";
        return returnTo + sep + "oauth=" + ticket;
    }

    public String failureReturnPath(String state) {
        String raw = pendingFlows.getPayload(state);
        if (raw == null) {
            return "/login";
        }
        try {
            Map<String, Object> statePayload = json.readValue(raw, new TypeReference<>() {});
            String surface = String.valueOf(statePayload.getOrDefault("surface", "institute"));
            String slug = statePayload.get("slug") == null ? null : String.valueOf(statePayload.get("slug"));
            String returnTo = String.valueOf(statePayload.getOrDefault("returnTo", "/"));
            if ("platform".equals(surface)) {
                return "/platform/login";
            }
            if ("storefront".equals(surface) && slug != null && !slug.isBlank()) {
                return "/s/" + slug + "/login";
            }
            if (returnTo.startsWith("/s/") && returnTo.contains("/login")) {
                return returnTo.split("\\?")[0];
            }
        } catch (Exception ignored) {
            /* fall through */
        }
        return "/login";
    }

    @Transactional
    public Map<String, Object> complete(String ticket) {
        String raw = pendingFlows.consume(ticket);
        if (raw == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Sign-in ticket expired. Try again.");
        }
        Map<String, Object> payload;
        try {
            payload = json.readValue(raw, new TypeReference<>() {});
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid sign-in ticket");
        }
        UUID userId = UUID.fromString(String.valueOf(payload.get("userId")));
        AppUser user = store.get(AppUser.class, userId);
        if (!user.isActive()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Account is disabled");
        }
        String surface = String.valueOf(payload.getOrDefault("surface", "institute"));
        if ("platform".equals(surface)) {
            if (!Roles.isPlatform(user.getRole())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Not a platform staff account");
            }
            Map<String, Object> session = new LinkedHashMap<>(platform.sessionFor(user));
            session.put("returnTo", payload.get("returnTo"));
            return session;
        }
        if (Roles.isPlatform(user.getRole())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Use the platform login for Niyamstack staff");
        }
        if (user.getOrganizationId() != null) {
            Organization org = store.get(Organization.class, user.getOrganizationId());
            OrgAccess.requireNotSuspended(org);
        }
        Map<String, Object> session = new LinkedHashMap<>(sessions.issue(user));
        session.put("returnTo", payload.get("returnTo"));
        return session;
    }

    private AppUser resolveUser(String surface, String slug, OauthProviders.Identity identity) {
        AppUser byEmail = store.findUserByEmail(identity.email());
        if ("platform".equals(surface)) {
            if (byEmail == null || !Roles.isPlatform(byEmail.getRole()) || !byEmail.isActive()) {
                throw new ApiException(HttpStatus.FORBIDDEN,
                        "No platform staff account for this email. Ask a platform owner to invite you first.");
            }
            return byEmail;
        }
        if ("storefront".equals(surface)) {
            return resolveStudent(slug, identity, byEmail);
        }
        if (byEmail == null || Roles.isPlatform(byEmail.getRole()) || !byEmail.isActive()) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "No institute account for this email. Owners and staff must be invited first; new institutes still use Create your institute.");
        }
        if (byEmail.getOrganizationId() == null) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Account is not linked to an institute");
        }
        return byEmail;
    }

    private AppUser resolveStudent(String slug, OauthProviders.Identity identity, AppUser byEmail) {
        if (slug == null || slug.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Institute site is required");
        }
        Organization org = store.findOrgBySlug(slug);
        if (org == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Institute not found");
        }
        OrgAccess.requireNotSuspended(org);

        if (byEmail != null && Roles.STUDENT.equals(byEmail.getRole())
                && org.getId().equals(byEmail.getOrganizationId()) && byEmail.isActive()) {
            return byEmail;
        }
        if (byEmail != null && !Roles.STUDENT.equals(byEmail.getRole()) && !Roles.isPlatform(byEmail.getRole())
                && org.getId().equals(byEmail.getOrganizationId())) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "This email belongs to a staff account. Use the institute staff login, not the student site.");
        }

        Student match = null;
        for (Student s : store.list(Student.class, org.getId())) {
            if (s.getEmail() != null && identity.email().equalsIgnoreCase(s.getEmail().trim())) {
                match = s;
                break;
            }
        }
        if (match == null) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "No student enrollment uses this email. Use the email on your enrollment, or ask the institute to update it.");
        }
        if (match.getUserId() != null) {
            AppUser linked = store.get(AppUser.class, match.getUserId());
            if (!linked.isActive()) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Student account is disabled");
            }
            if (linked.getEmail() == null || linked.getEmail().isBlank()
                    || linked.getEmail().equalsIgnoreCase(identity.email())) {
                linked.setEmail(identity.email());
                return linked;
            }
            AppUser conflict = store.findUserByEmail(identity.email());
            if (conflict != null && !conflict.getId().equals(linked.getId())) {
                throw new ApiException(HttpStatus.CONFLICT,
                        "This Google/Microsoft email is already used by another login. Contact the institute.");
            }
            linked.setEmail(identity.email());
            return linked;
        }
        if (byEmail != null) {
            throw new ApiException(HttpStatus.CONFLICT, "This email already has a login. Contact the institute.");
        }
        AppUser user = new AppUser();
        user.setOrganizationId(org.getId());
        user.setFullName(match.getFullName() != null ? match.getFullName() : identity.name());
        user.setEmail(identity.email());
        user.setEmailVerified(true);
        user.setPhone(match.getPhone());
        user.setRole(Roles.STUDENT);
        user.setActive(true);
        user.setPasswordHash(encoder.encode(UUID.randomUUID() + "Aa1!"));
        user.setPasswordChangedAt(Instant.now());
        user = store.save(user);
        match.setUserId(user.getId());
        match.setEmail(identity.email());
        store.save(match);
        return user;
    }

    private static String normalizeSurface(String surface) {
        String s = surface == null ? "institute" : surface.trim().toLowerCase();
        if (!List.of("institute", "storefront", "platform").contains(s)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid login surface");
        }
        return s;
    }

    private String safeReturnTo(String returnTo, String surface, String slug) {
        if (returnTo != null && !returnTo.isBlank()) {
            String r = returnTo.trim();
            if (r.startsWith("/") && !r.startsWith("//")) {
                return r;
            }
        }
        return switch (surface) {
            case "platform" -> "/platform";
            case "storefront" -> slug == null || slug.isBlank() ? "/" : "/s/" + slug + "/learn";
            default -> "/";
        };
    }
}
