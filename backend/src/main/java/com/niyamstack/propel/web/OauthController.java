package com.niyamstack.propel.web;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.security.OauthLoginService;
import com.niyamstack.propel.security.SessionCookies;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriUtils;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth/oauth")
public class OauthController {
    private final OauthLoginService oauth;

    public OauthController(OauthLoginService oauth) {
        this.oauth = oauth;
    }

    @GetMapping("/providers")
    public Map<String, Object> providers() {
        return oauth.providerStatus();
    }

    @GetMapping("/{provider}/start")
    public ResponseEntity<Void> start(
            @PathVariable String provider,
            @RequestParam(defaultValue = "institute") String surface,
            @RequestParam(required = false) String returnTo,
            @RequestParam(required = false) String slug
    ) {
        String url = oauth.begin(provider, surface, returnTo, slug);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(url)).build();
    }

    @GetMapping("/{provider}/callback")
    public ResponseEntity<Void> callback(
            @PathVariable String provider,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            @RequestParam(required = false) String error_description
    ) {
        String failBase = oauth.failureReturnPath(state);
        try {
            if (error != null && !error.isBlank()) {
                String msg = error_description == null || error_description.isBlank() ? "Sign-in was cancelled" : error_description;
                return redirect(failBase, msg);
            }
            String redirect = oauth.finish(provider, code, state);
            return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(redirect)).build();
        } catch (ApiException e) {
            return redirect(failBase, e.getMessage());
        } catch (Exception e) {
            return redirect(failBase, "Could not complete sign-in");
        }
    }

    public record CompleteRequest(String ticket) {}

    @PostMapping("/complete")
    public Map<String, Object> complete(@RequestBody CompleteRequest body, HttpServletResponse response) {
        if (body == null || body.ticket() == null || body.ticket().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Missing sign-in ticket");
        }
        Map<String, Object> session = new LinkedHashMap<>(oauth.complete(body.ticket().trim()));
        Object surfaceHint = session.get("returnTo");
        boolean platform = surfaceHint != null && String.valueOf(surfaceHint).startsWith("/platform");
        // Platform complete also returns platform user; detect via user.role if present
        Object user = session.get("user");
        if (user instanceof Map<?, ?> umap) {
            Object role = umap.get("role");
            if (role != null && String.valueOf(role).startsWith("PLATFORM_")) {
                platform = true;
            }
        }
        if (!platform) {
            SessionCookies.attachInstitute(response, session);
        }
        return session;
    }

    private static ResponseEntity<Void> redirect(String path, String message) {
        String base = path == null || path.isBlank() ? "/login" : path;
        String sep = base.contains("?") ? "&" : "?";
        String loc = base + sep + "oauth_error=" + UriUtils.encodeQueryParam(message == null ? "Sign-in failed" : message, StandardCharsets.UTF_8);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(loc)).build();
    }
}
