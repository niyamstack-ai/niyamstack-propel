package com.niyamstack.propel.integration;

import com.niyamstack.propel.domain.Model.Organization;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public final class OrgSecrets {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private OrgSecrets() {}

    public static String live(Organization org, String key) {
        if (org == null || org.getSettingsJson() == null || org.getSettingsJson().isBlank()) {
            return "";
        }
        try {
            JsonNode root = MAPPER.readTree(org.getSettingsJson());
            JsonNode live = root.path("live");
            String value = live.path(key).asText("");
            return value == null ? "" : value.trim();
        } catch (Exception e) {
            return "";
        }
    }

    public static boolean has(Organization org, String key) {
        return !live(org, key).isBlank();
    }
}
