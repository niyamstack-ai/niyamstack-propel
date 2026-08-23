package com.niyamstack.propel.security;

import java.util.UUID;

public record PropelUser(
        UUID userId,
        UUID organizationId,
        UUID centerId,
        String email,
        String name,
        String role,
        String packageTier,
        String modulesCsv,
        String capabilitiesCsv,
        String productPack
) {
    public PropelUser(
            UUID userId,
            UUID organizationId,
            UUID centerId,
            String email,
            String name,
            String role,
            String packageTier
    ) {
        this(userId, organizationId, centerId, email, name, role, packageTier, "", "", "");
    }

    public PropelUser withLicense(String modulesCsv, String capabilitiesCsv, String productPack) {
        return new PropelUser(
                userId,
                organizationId,
                centerId,
                email,
                name,
                role,
                packageTier,
                modulesCsv == null ? "" : modulesCsv,
                capabilitiesCsv == null ? "" : capabilitiesCsv,
                productPack == null ? "" : productPack
        );
    }
}
