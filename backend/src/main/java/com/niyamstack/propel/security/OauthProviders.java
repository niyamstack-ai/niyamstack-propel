package com.niyamstack.propel.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class OauthProviders {
    public static final String GOOGLE = "google";
    public static final String MICROSOFT = "microsoft";

    public static final String KEY_GOOGLE_ID = "oauthGoogleClientId";
    public static final String KEY_GOOGLE_SECRET = "oauthGoogleClientSecret";
    public static final String KEY_MICROSOFT_ID = "oauthMicrosoftClientId";
    public static final String KEY_MICROSOFT_SECRET = "oauthMicrosoftClientSecret";
    public static final String KEY_MICROSOFT_TENANT = "oauthMicrosoftTenant";

    private final Store store;
    private final String publicUrl;
    private final String googleClientIdEnv;
    private final String googleClientSecretEnv;
    private final String microsoftClientIdEnv;
    private final String microsoftClientSecretEnv;
    private final String microsoftTenantEnv;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public OauthProviders(
            Store store,
            @Value("${app.integrations.mail.public-url:http://localhost:5173}") String publicUrl,
            @Value("${app.oauth.google.client-id:}") String googleClientId,
            @Value("${app.oauth.google.client-secret:}") String googleClientSecret,
            @Value("${app.oauth.microsoft.client-id:}") String microsoftClientId,
            @Value("${app.oauth.microsoft.client-secret:}") String microsoftClientSecret,
            @Value("${app.oauth.microsoft.tenant:common}") String microsoftTenant,
            ObjectMapper json
    ) {
        this.store = store;
        this.publicUrl = publicUrl == null || publicUrl.isBlank() ? "http://localhost:5173" : publicUrl.trim().replaceAll("/$", "");
        this.googleClientIdEnv = nz(googleClientId);
        this.googleClientSecretEnv = nz(googleClientSecret);
        this.microsoftClientIdEnv = nz(microsoftClientId);
        this.microsoftClientSecretEnv = nz(microsoftClientSecret);
        this.microsoftTenantEnv = microsoftTenant == null || microsoftTenant.isBlank() ? "common" : microsoftTenant.trim();
        this.json = json;
    }

    public record Identity(String provider, String subject, String email, String name, boolean emailVerified) {}

    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("google", googleEnabled());
        out.put("microsoft", microsoftEnabled());
        out.put("publicUrl", publicUrl);
        return out;
    }

    /** Full status for platform Settings (never returns secrets). */
    public Map<String, Object> adminStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("google", googleEnabled());
        out.put("microsoft", microsoftEnabled());
        out.put("googleSource", source(KEY_GOOGLE_ID, KEY_GOOGLE_SECRET, googleClientIdEnv, googleClientSecretEnv));
        out.put("microsoftSource", source(KEY_MICROSOFT_ID, KEY_MICROSOFT_SECRET, microsoftClientIdEnv, microsoftClientSecretEnv));
        out.put("googleClientIdMasked", mask(googleClientId()));
        out.put("microsoftClientIdMasked", mask(microsoftClientId()));
        out.put("microsoftTenant", microsoftTenant());
        out.put("publicUrl", publicUrl);
        out.put("googleCallback", callbackUrl(GOOGLE));
        out.put("microsoftCallback", callbackUrl(MICROSOFT));
        return out;
    }

    public boolean googleEnabled() {
        return !googleClientId().isBlank() && !googleClientSecret().isBlank();
    }

    public boolean microsoftEnabled() {
        return !microsoftClientId().isBlank() && !microsoftClientSecret().isBlank();
    }

    public boolean enabled(String provider) {
        return GOOGLE.equals(provider) ? googleEnabled() : MICROSOFT.equals(provider) && microsoftEnabled();
    }

    public String normalizeProvider(String raw) {
        String p = raw == null ? "" : raw.trim().toLowerCase();
        if (!GOOGLE.equals(p) && !MICROSOFT.equals(p)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Provider must be google or microsoft");
        }
        if (!enabled(p)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    p.substring(0, 1).toUpperCase() + p.substring(1) + " login is not configured on this portal yet.");
        }
        return p;
    }

    public String callbackUrl(String provider) {
        return publicUrl + "/api/auth/oauth/" + provider + "/callback";
    }

    public String authorizeUrl(String provider, String state) {
        String p = normalizeProvider(provider);
        String redirect = URLEncoder.encode(callbackUrl(p), StandardCharsets.UTF_8);
        String st = URLEncoder.encode(state, StandardCharsets.UTF_8);
        if (GOOGLE.equals(p)) {
            return "https://accounts.google.com/o/oauth2/v2/auth"
                    + "?client_id=" + URLEncoder.encode(googleClientId(), StandardCharsets.UTF_8)
                    + "&redirect_uri=" + redirect
                    + "&response_type=code"
                    + "&scope=" + URLEncoder.encode("openid email profile", StandardCharsets.UTF_8)
                    + "&state=" + st
                    + "&access_type=online"
                    + "&prompt=select_account";
        }
        return "https://login.microsoftonline.com/" + URLEncoder.encode(microsoftTenant(), StandardCharsets.UTF_8) + "/oauth2/v2.0/authorize"
                + "?client_id=" + URLEncoder.encode(microsoftClientId(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + redirect
                + "&response_type=code"
                + "&scope=" + URLEncoder.encode("openid email profile User.Read", StandardCharsets.UTF_8)
                + "&state=" + st
                + "&prompt=select_account";
    }

    public Identity exchange(String provider, String code) {
        String p = normalizeProvider(provider);
        if (code == null || code.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Missing authorization code");
        }
        try {
            if (GOOGLE.equals(p)) {
                return exchangeGoogle(code);
            }
            return exchangeMicrosoft(code);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Could not complete " + p + " sign-in. Try again.");
        }
    }

    private Identity exchangeGoogle(String code) throws Exception {
        String body = "code=" + URLEncoder.encode(code, StandardCharsets.UTF_8)
                + "&client_id=" + URLEncoder.encode(googleClientId(), StandardCharsets.UTF_8)
                + "&client_secret=" + URLEncoder.encode(googleClientSecret(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(callbackUrl(GOOGLE), StandardCharsets.UTF_8)
                + "&grant_type=authorization_code";
        Map<String, Object> token = postForm("https://oauth2.googleapis.com/token", body);
        String idToken = str(token.get("id_token"));
        if (idToken.isBlank()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Google did not return an identity token");
        }
        Map<String, Object> claims = decodeJwtPayload(idToken);
        String email = str(claims.get("email")).toLowerCase();
        boolean verified = Boolean.TRUE.equals(claims.get("email_verified")) || "true".equalsIgnoreCase(str(claims.get("email_verified")));
        if (email.isBlank() || !email.contains("@")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Google account has no email we can use");
        }
        if (!verified) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Google email is not verified");
        }
        return new Identity(GOOGLE, str(claims.get("sub")), email, str(claims.get("name")), true);
    }

    private Identity exchangeMicrosoft(String code) throws Exception {
        String tenant = microsoftTenant();
        String body = "code=" + URLEncoder.encode(code, StandardCharsets.UTF_8)
                + "&client_id=" + URLEncoder.encode(microsoftClientId(), StandardCharsets.UTF_8)
                + "&client_secret=" + URLEncoder.encode(microsoftClientSecret(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(callbackUrl(MICROSOFT), StandardCharsets.UTF_8)
                + "&grant_type=authorization_code";
        String tokenUrl = "https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/token";
        Map<String, Object> token = postForm(tokenUrl, body);
        String access = str(token.get("access_token"));
        if (access.isBlank()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Microsoft did not return an access token");
        }
        HttpRequest req = HttpRequest.newBuilder(URI.create("https://graph.microsoft.com/v1.0/me"))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + access)
                .GET()
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 300) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Microsoft profile lookup failed");
        }
        Map<String, Object> me = json.readValue(res.body(), new TypeReference<>() {});
        String email = str(me.get("mail"));
        if (email.isBlank()) {
            email = str(me.get("userPrincipalName"));
        }
        email = email.trim().toLowerCase();
        if (email.isBlank() || !email.contains("@")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Microsoft account has no email we can use");
        }
        String name = str(me.get("displayName"));
        return new Identity(MICROSOFT, str(me.get("id")), email, name, true);
    }

    private String googleClientId() {
        return first(store.settingValue(KEY_GOOGLE_ID), googleClientIdEnv);
    }

    private String googleClientSecret() {
        return first(store.settingValue(KEY_GOOGLE_SECRET), googleClientSecretEnv);
    }

    private String microsoftClientId() {
        return first(store.settingValue(KEY_MICROSOFT_ID), microsoftClientIdEnv);
    }

    private String microsoftClientSecret() {
        return first(store.settingValue(KEY_MICROSOFT_SECRET), microsoftClientSecretEnv);
    }

    private String microsoftTenant() {
        String db = store.settingValue(KEY_MICROSOFT_TENANT);
        if (!db.isBlank()) {
            return db;
        }
        return microsoftTenantEnv;
    }

    private String source(String idKey, String secretKey, String idEnv, String secretEnv) {
        boolean db = !store.settingValue(idKey).isBlank() && !store.settingValue(secretKey).isBlank();
        if (db) {
            return "settings";
        }
        if (!idEnv.isBlank() && !secretEnv.isBlank()) {
            return "env";
        }
        return "none";
    }

    private Map<String, Object> postForm(String url, String body) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 300) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Token exchange failed");
        }
        return json.readValue(res.body(), new TypeReference<>() {});
    }

    private Map<String, Object> decodeJwtPayload(String jwt) throws Exception {
        String[] parts = jwt.split("\\.");
        if (parts.length < 2) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Invalid identity token");
        }
        byte[] decoded = java.util.Base64.getUrlDecoder().decode(parts[1]);
        return json.readValue(decoded, new TypeReference<>() {});
    }

    private static String first(String preferred, String fallback) {
        return preferred != null && !preferred.isBlank() ? preferred.trim() : (fallback == null ? "" : fallback);
    }

    private static String mask(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        if (value.length() <= 12) {
            return value.charAt(0) + "…";
        }
        return value.substring(0, 8) + "…" + value.substring(value.length() - 4);
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static String nz(String v) {
        return v == null ? "" : v.trim();
    }
}
