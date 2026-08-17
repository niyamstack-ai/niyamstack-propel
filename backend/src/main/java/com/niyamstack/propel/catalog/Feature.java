package com.niyamstack.propel.catalog;

public record Feature(
        int serial,
        String category,
        String name,
        String description,
        String releaseTier,
        String marketPriority,
        String packageName,
        boolean differentiator
) {}
