package com.niyamstack.propel.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.niyamstack.propel.domain.Model.Organization;

import java.util.LinkedHashMap;
import java.util.Map;

public final class OrgSettings {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private OrgSettings() {}

    public static Map<String, Object> onboarding(Organization org) {
        Map<String, Object> steps = defaultSteps(org);
        boolean completed = false;
        if (org != null && org.getSettingsJson() != null && !org.getSettingsJson().isBlank()) {
            try {
                JsonNode root = MAPPER.readTree(org.getSettingsJson());
                JsonNode onb = root.path("onboarding");
                completed = onb.path("completed").asBoolean(false);
                if (onb.has("steps") && onb.get("steps").isObject()) {
                    JsonNode saved = onb.get("steps");
                    saved.fields().forEachRemaining(entry -> steps.put(entry.getKey(), entry.getValue().asBoolean(false)));
                }
            } catch (Exception ignored) {
                /* use defaults */
            }
        }
        if (!completed) {
            completed = steps.values().stream().allMatch(v -> Boolean.TRUE.equals(v));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("completed", completed);
        out.put("steps", steps);
        return out;
    }

    public static void saveOnboarding(Organization org, Map<String, Object> patch) {
        if (org == null) {
            return;
        }
        try {
            JsonNode parsed = org.getSettingsJson() == null || org.getSettingsJson().isBlank()
                    ? MAPPER.createObjectNode()
                    : MAPPER.readTree(org.getSettingsJson());
            ObjectNode root = parsed.isObject() ? (ObjectNode) parsed : MAPPER.createObjectNode();
            ObjectNode onb = root.has("onboarding") && root.get("onboarding").isObject()
                    ? (ObjectNode) root.get("onboarding")
                    : root.putObject("onboarding");
            if (patch.containsKey("completed")) {
                onb.put("completed", Boolean.TRUE.equals(patch.get("completed")));
            }
            Object stepsPatch = patch.get("steps");
            if (stepsPatch instanceof Map<?, ?> map) {
                ObjectNode steps = onb.has("steps") && onb.get("steps").isObject()
                        ? (ObjectNode) onb.get("steps")
                        : onb.putObject("steps");
                for (Map.Entry<?, ?> e : map.entrySet()) {
                    if (e.getKey() != null) {
                        steps.put(e.getKey().toString(), Boolean.TRUE.equals(e.getValue()));
                    }
                }
            }
            org.setSettingsJson(MAPPER.writeValueAsString(root));
        } catch (Exception ignored) {
            /* keep previous settingsJson */
        }
    }

    private static Map<String, Object> defaultSteps(Organization org) {
        Map<String, Object> steps = new LinkedHashMap<>();
        steps.put("profile", org != null && org.getName() != null && !org.getName().isBlank());
        steps.put("center", false);
        steps.put("course", false);
        steps.put("staff", false);
        steps.put("website", false);
        return steps;
    }
}
