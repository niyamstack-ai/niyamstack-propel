package com.niyamstack.propel.security;

import java.util.UUID;

public record PropelUser(
        UUID userId,
        UUID organizationId,
        UUID centerId,
        String email,
        String name,
        String role,
        String packageTier
) {}
