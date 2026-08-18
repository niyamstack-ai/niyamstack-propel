package com.niyamstack.propel.web;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AdmissionForm;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.storefront.StorefrontService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/public")
public class PublicController {
    private final Store store;
    private final StorefrontService storefront;

    public PublicController(Store store, StorefrontService storefront) {
        this.store = store;
        this.storefront = storefront;
    }

    public record PurchaseRequest(String fullName, String email, String phone, UUID courseId) {}

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

    @PostMapping("/sites/{slug}/purchase")
    public Map<String, Object> purchase(@PathVariable String slug, @RequestBody PurchaseRequest body) {
        if (body.courseId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Course is required");
        }
        return storefront.purchase(slug, body.fullName(), body.email(), body.phone(), body.courseId());
    }

    @PostMapping("/orgs/{orgId}/admission-forms")
    public AdmissionForm apply(@PathVariable UUID orgId, @RequestBody AdmissionForm form) {
        store.get(Organization.class, orgId);
        if (form.getApplicantName() == null || form.getApplicantName().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Applicant name is required");
        }
        form.setId(null);
        form.setOrganizationId(orgId);
        if (form.getStatus() == null) form.setStatus("SUBMITTED");
        return store.save(form);
    }
}
