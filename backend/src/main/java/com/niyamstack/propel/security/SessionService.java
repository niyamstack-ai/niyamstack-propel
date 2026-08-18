package com.niyamstack.propel.security;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Organization;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class SessionService {
    private final Store store;
    private final JwtService jwt;

    public SessionService(Store store, JwtService jwt) {
        this.store = store;
        this.jwt = jwt;
    }

    public Map<String, Object> issue(AppUser user) {
        String tier = "STARTER";
        String access = "ACTIVE";
        String slug = "";
        String orgName = "";
        if (user.getOrganizationId() != null) {
            Organization org = store.get(Organization.class, user.getOrganizationId());
            if (org.getPackageTier() != null) {
                tier = org.getPackageTier();
            }
            if (org.getAccessStatus() != null && !org.getAccessStatus().isBlank()) {
                access = org.getAccessStatus();
            }
            slug = org.getSlug() == null ? "" : org.getSlug();
            orgName = org.getName() == null ? "" : org.getName();
        }
        PropelUser principal = new PropelUser(
                user.getId(),
                user.getOrganizationId(),
                user.getCenterId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                tier);
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", user.getId());
        profile.put("name", user.getFullName());
        profile.put("email", user.getEmail());
        profile.put("phone", user.getPhone() == null ? "" : user.getPhone());
        profile.put("role", user.getRole());
        profile.put("organizationId", user.getOrganizationId());
        profile.put("centerId", user.getCenterId() == null ? "" : user.getCenterId());
        profile.put("packageTier", tier);
        profile.put("accessStatus", access);
        profile.put("orgSlug", slug);
        profile.put("orgName", orgName);
        return Map.of("token", jwt.issue(principal), "user", profile);
    }
}
