package com.niyamstack.propel.web;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AdmissionForm;
import com.niyamstack.propel.domain.Model.Course;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.integration.PaymentGateway;
import com.niyamstack.propel.storefront.StorefrontService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/public")
public class PublicController {
    private final Store store;
    private final StorefrontService storefront;
    private final PaymentGateway payments;
    private final Path filesRoot;

    public PublicController(
            Store store,
            StorefrontService storefront,
            PaymentGateway payments,
            @Value("${app.storage.local-dir:./data/files}") String dir
    ) {
        this.store = store;
        this.storefront = storefront;
        this.payments = payments;
        this.filesRoot = Path.of(dir).toAbsolutePath().normalize();
    }

    public record PurchaseRequest(String fullName, String email, String phone, UUID courseId, String couponCode, String validityOption) {}
    public record ConfirmRequest(UUID invoiceId, String orderId, String paymentId, String signature) {}
    public record CouponRequest(UUID courseId, String code) {}

    @GetMapping("/sites/by-host")
    public Map<String, Object> byHost(@RequestParam String host) {
        Organization org = store.findOrgByCustomDomain(host);
        if (org == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No institute website for this domain");
        }
        return storefront.publicOrg(storefront.liveOrg(org.getSlug()));
    }

    @GetMapping("/sites/{slug}/pages")
    public List<Map<String, Object>> pages(@PathVariable String slug) {
        return storefront.publicPages(storefront.liveOrg(slug));
    }

    @GetMapping("/cms/{slug}/pages")
    public List<Map<String, Object>> cmsPages(@PathVariable String slug) {
        return storefront.publicPages(storefront.liveOrg(slug));
    }

    @GetMapping("/sites/{slug}/pages/{pageSlug}")
    public Map<String, Object> page(@PathVariable String slug, @PathVariable String pageSlug) {
        return storefront.publicPage(storefront.liveOrg(slug), pageSlug);
    }

    @GetMapping("/cms/{slug}/pages/{pageSlug}")
    public Map<String, Object> cmsPage(@PathVariable String slug, @PathVariable String pageSlug) {
        return storefront.publicPage(storefront.liveOrg(slug), pageSlug);
    }

    @GetMapping("/sites/{slug}")
    public Map<String, Object> site(@PathVariable String slug) {
        return storefront.publicOrg(storefront.liveOrg(slug));
    }

    @GetMapping("/sites/{slug}/courses")
    public List<Map<String, Object>> courses(@PathVariable String slug) {
        return storefront.catalog(storefront.liveOrg(slug));
    }

    @GetMapping("/sites/{slug}/courses/{courseId}")
    public Map<String, Object> course(@PathVariable String slug, @PathVariable UUID courseId) {
        return storefront.course(storefront.liveOrg(slug), courseId);
    }

    @GetMapping("/sites/{slug}/courses/{courseId}/outline")
    public List<Map<String, Object>> outline(@PathVariable String slug, @PathVariable UUID courseId) {
        return storefront.courseOutline(storefront.liveOrg(slug), courseId);
    }

    @GetMapping("/sites/{slug}/courses/{courseId}/cover")
    public ResponseEntity<Resource> cover(@PathVariable String slug, @PathVariable UUID courseId) {
        Organization org = storefront.liveOrg(slug);
        Course course = store.getOwned(Course.class, courseId, org.getId());
        if (!course.isActive() || !course.isPublished()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Course not found");
        }
        String key = storefront.thumbnailKey(course);
        if (key == null || !key.startsWith(org.getId().toString() + "/")) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No cover image");
        }
        String name = key.substring(org.getId().toString().length() + 1);
        Path dest = filesRoot.resolve(org.getId().toString()).resolve(name).normalize();
        if (!dest.startsWith(filesRoot) || !Files.isRegularFile(dest)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No cover image");
        }
        String type = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        try {
            String probed = Files.probeContentType(dest);
            if (probed != null) {
                type = probed;
            }
        } catch (Exception ignored) {
            /* keep default */
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + name.replace("\"", "") + "\"")
                .contentType(MediaType.parseMediaType(type))
                .body(new FileSystemResource(dest));
    }

    @PostMapping("/sites/{slug}/coupons/apply")
    public Map<String, Object> applyCoupon(@PathVariable String slug, @RequestBody CouponRequest body) {
        if (body.courseId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Course is required");
        }
        return storefront.applyCoupon(slug, body.courseId(), body.code());
    }

    @PostMapping("/sites/{slug}/purchase")
    public Map<String, Object> purchase(@PathVariable String slug, @RequestBody PurchaseRequest body) {
        if (body.courseId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Course is required");
        }
        return storefront.purchase(slug, body.fullName(), body.email(), body.phone(), body.courseId(), body.couponCode(), body.validityOption());
    }

    @PostMapping("/sites/{slug}/purchase/confirm")
    public Map<String, Object> confirmPurchase(@PathVariable String slug, @RequestBody ConfirmRequest body) {
        if (body.invoiceId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invoice is required");
        }
        return storefront.confirmPurchase(slug, body.invoiceId(), body.orderId(), body.paymentId(), body.signature());
    }

    @PostMapping("/payments/razorpay")
    public Map<String, Boolean> razorpayWebhook(
            @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature,
            @RequestBody String body
    ) {
        String orgRaw = extractJson(body, "orgId");
        String invoiceRaw = extractJson(body, "invoiceId");
        if (orgRaw.isBlank() || invoiceRaw.isBlank()) {
            return Map.of("ok", true);
        }
        try {
            UUID orgId = UUID.fromString(orgRaw);
            UUID invoiceId = UUID.fromString(invoiceRaw);
            if (payments.live(orgId) && !payments.verifyWebhook(orgId, body, signature)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid Razorpay webhook signature");
            }
            String orderId = extractJson(body, "order_id");
            String paymentId = extractPrefixed(body, "pay_");
            storefront.webhookPaid(orgId, invoiceId, orderId, paymentId);
        } catch (ApiException e) {
            throw e;
        } catch (Exception ignored) {
            /* ignore malformed webhook */
        }
        return Map.of("ok", true);
    }

    private static String extractJson(String json, String key) {
        if (json == null) {
            return "";
        }
        String needle = "\"" + key + "\":\"";
        int i = json.indexOf(needle);
        if (i < 0) {
            return "";
        }
        int start = i + needle.length();
        int end = json.indexOf('"', start);
        return end < 0 ? "" : json.substring(start, end);
    }

    private static String extractPrefixed(String json, String prefix) {
        if (json == null) {
            return "";
        }
        int i = json.indexOf(prefix);
        if (i < 0) {
            return "";
        }
        int end = i;
        while (end < json.length() && (Character.isLetterOrDigit(json.charAt(end)) || json.charAt(end) == '_')) {
            end++;
        }
        return json.substring(i, end);
    }

    @PostMapping("/orgs/{orgId}/admission-forms")
    public AdmissionForm apply(@PathVariable UUID orgId, @RequestBody AdmissionForm form) {
        store.get(Organization.class, orgId);
        if (form.getApplicantName() == null || form.getApplicantName().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Applicant name is required");
        }
        form.setId(null);
        form.setOrganizationId(orgId);
        if (form.getStatus() == null) {
            form.setStatus("SUBMITTED");
        }
        return store.save(form);
    }

    @PostMapping("/sites/{slug}/hit")
    public Map<String, Boolean> hit(@PathVariable String slug, @RequestBody(required = false) Map<String, String> body) {
        Organization org = storefront.liveOrg(slug);
        String kind = body == null ? "SESSION" : body.getOrDefault("kind", "SESSION");
        String path = body == null ? null : body.get("path");
        storefront.recordHit(org, kind, path);
        return Map.of("ok", true);
    }

    @GetMapping("/sites/{slug}/manifest")
    public Map<String, Object> manifest(@PathVariable String slug) {
        Organization org = storefront.liveOrg(slug);
        String start = org.getCustomDomain() == null || org.getCustomDomain().isBlank() ? "/s/" + org.getSlug() : "/";
        return Map.of(
                "name", org.getName() == null ? "Student app" : org.getName(),
                "short_name", org.getName() == null ? "Learn" : org.getName().substring(0, Math.min(12, org.getName().length())),
                "start_url", start,
                "display", "standalone",
                "background_color", "#f4f7fb",
                "theme_color", "#0078f0",
                "icons", List.of(Map.of("src", "/brand/logo-icon.png", "sizes", "192x192", "type", "image/png"))
        );
    }

    @GetMapping("/media/{orgId}/{name:.+}")
    public ResponseEntity<Resource> media(@PathVariable String orgId, @PathVariable String name) {
        Path dest = filesRoot.resolve(orgId).resolve(name).normalize();
        if (!dest.startsWith(filesRoot) || !Files.isRegularFile(dest)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "File not found");
        }
        String type = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        try {
            String probed = Files.probeContentType(dest);
            if (probed != null) {
                type = probed;
            }
        } catch (Exception ignored) {
            /* keep default */
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + name.replace("\"", "") + "\"")
                .contentType(MediaType.parseMediaType(type))
                .body(new FileSystemResource(dest));
    }
}
