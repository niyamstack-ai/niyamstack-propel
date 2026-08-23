package com.niyamstack.propel.security;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.catalog.Packs;
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
        OrgBits bits = bits(user);
        PropelUser principal = new PropelUser(
                user.getId(),
                user.getOrganizationId(),
                user.getCenterId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                bits.tier);
        return Map.of("token", jwt.issue(principal), "user", profile(user, bits));
    }

    public Map<String, Object> profile(AppUser user) {
        return profile(user, bits(user));
    }

    private Map<String, Object> profile(AppUser user, OrgBits bits) {
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", user.getId());
        profile.put("name", user.getFullName());
        profile.put("email", user.getEmail());
        profile.put("phone", user.getPhone() == null ? "" : user.getPhone());
        profile.put("role", user.getRole());
        profile.put("organizationId", user.getOrganizationId());
        profile.put("centerId", user.getCenterId() == null ? "" : user.getCenterId());
        profile.put("packageTier", bits.tier);
        profile.put("accessStatus", bits.access);
        profile.put("paymentStatus", bits.payment);
        profile.put("orgSlug", bits.slug);
        profile.put("orgName", bits.orgName);
        profile.put("productPack", bits.pack);
        profile.put("modules", Packs.parse(bits.modules).stream().toList());
        profile.put("capabilities", Packs.capsFor(user.getRole(), user.getCapabilitiesCsv()).stream().toList());
        return profile;
    }

    private OrgBits bits(AppUser user) {
        String tier = "STARTER";
        String access = "ACTIVE";
        String payment = "";
        String slug = "";
        String orgName = "";
        String pack = Packs.FULL_OPS;
        String modules = Packs.modulesCsvForPack(Packs.FULL_OPS);
        if (user.getOrganizationId() != null) {
            Organization org = store.get(Organization.class, user.getOrganizationId());
            if (org.getPackageTier() != null) {
                tier = org.getPackageTier();
            }
            if (org.getAccessStatus() != null && !org.getAccessStatus().isBlank()) {
                access = org.getAccessStatus();
            }
            payment = org.getPaymentStatus() == null ? "" : org.getPaymentStatus();
            slug = org.getSlug() == null ? "" : org.getSlug();
            orgName = org.getName() == null ? "" : org.getName();
            pack = Packs.normalizePack(org.getProductPack());
            modules = org.getModulesCsv() == null || org.getModulesCsv().isBlank()
                    ? Packs.modulesCsvForPack(pack)
                    : org.getModulesCsv();
        }
        return new OrgBits(tier, access, payment, slug, orgName, pack, modules);
    }

    private record OrgBits(String tier, String access, String payment, String slug, String orgName, String pack, String modules) {}
}
