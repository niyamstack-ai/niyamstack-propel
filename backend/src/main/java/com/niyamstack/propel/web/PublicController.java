package com.niyamstack.propel.web;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AdmissionForm;
import com.niyamstack.propel.domain.Model.Organization;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/public")
public class PublicController {
    private final Store store;

    public PublicController(Store store) {
        this.store = store;
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
