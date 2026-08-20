package com.niyamstack.propel.web;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AdmissionForm;
import com.niyamstack.propel.domain.Model.Course;
import com.niyamstack.propel.domain.Model.Organization;
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
    private final Path filesRoot;

    public PublicController(
            Store store,
            StorefrontService storefront,
            @Value("${app.storage.local-dir:./data/files}") String dir
    ) {
        this.store = store;
        this.storefront = storefront;
        this.filesRoot = Path.of(dir).toAbsolutePath().normalize();
    }

    public record PurchaseRequest(String fullName, String email, String phone, UUID courseId, String couponCode) {}
    public record CouponRequest(UUID courseId, String code) {}

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
        return storefront.purchase(slug, body.fullName(), body.email(), body.phone(), body.courseId(), body.couponCode());
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
}
