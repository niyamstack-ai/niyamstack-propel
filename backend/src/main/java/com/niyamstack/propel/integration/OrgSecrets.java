package com.niyamstack.propel.integration;

import com.niyamstack.propel.domain.Model.Organization;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

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

    public static int liveInt(Organization org, String key, int fallback) {
        String raw = live(org, key);
        if (raw.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    public static void putLive(Organization org, String key, String value) {
        if (org == null || key == null || key.isBlank()) {
            return;
        }
        try {
            JsonNode parsed = org.getSettingsJson() == null || org.getSettingsJson().isBlank()
                    ? MAPPER.createObjectNode()
                    : MAPPER.readTree(org.getSettingsJson());
            ObjectNode root = parsed.isObject() ? (ObjectNode) parsed : MAPPER.createObjectNode();
            ObjectNode live = root.has("live") && root.get("live").isObject()
                    ? (ObjectNode) root.get("live")
                    : root.putObject("live");
            if (value == null || value.isBlank()) {
                live.remove(key);
            } else {
                live.put(key, value);
            }
            org.setSettingsJson(MAPPER.writeValueAsString(root));
        } catch (Exception ignored) {
            /* keep previous settingsJson */
        }
    }

    public static boolean has(Organization org, String key) {
        return !live(org, key).isBlank();
    }
}
