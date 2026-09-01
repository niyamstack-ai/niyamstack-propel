package com.niyamstack.propel.enterprise;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.integration.OrgSecrets;
import com.niyamstack.propel.scale.ScaleService;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class EnterpriseService {
    private static final Set<String> TRIGGERS = Set.of("DISCOUNT", "FEE_WAIVER", "ADMISSION", "OFFER", "ACCREDITATION");

    private final Store store;
    private final ScaleService scale;
    private final ObjectMapper mapper = new ObjectMapper();

    public EnterpriseService(Store store, ScaleService scale) {
        this.store = store;
        this.scale = scale;
    }

    public Map<String, Object> hub() {
        requireEnterprise();
        UUID org = orgId();
        Organization organization = store.get(Organization.class, org);

        long workflows = store.list(Workflow.class, org).stream().filter(Workflow::isActive).count();
        long scormPackages = store.list(LmsPackage.class, org).size();
        long scheduledReports = store.list(ScheduledReport.class, org).size();
        long pendingApprovals = store.list(ApprovalRequest.class, org).stream()
                .filter(a -> "PENDING".equalsIgnoreCase(a.getStatus()))
                .count();

        Map<String, Object> accreditation = accreditationDashboard();
        List<Map<String, Object>> outcomes = scale.learningOutcomes();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("packageTier", organization.getPackageTier());
        out.put("aiEnabled", OrgSecrets.has(organization, "openaiApiKey"));
        out.put("workflowsActive", workflows);
        out.put("scormPackages", scormPackages);
        out.put("scheduledReports", scheduledReports);
        out.put("pendingApprovals", pendingApprovals);
        out.put("accreditation", accreditation);
        out.put("learningOutcomes", outcomes.stream().limit(5).toList());
        out.put("tools", aiSuiteTools());
        return out;
    }

    public List<Map<String, Object>> workflows() {
        requireEnterprise();
        return store.list(Workflow.class, orgId()).stream().map(this::workflowView).toList();
    }

    @Transactional
    public Map<String, Object> saveWorkflow(Map<String, Object> body) {
        requireEnterprise();
        String name = str(body, "name");
        String triggerType = str(body, "triggerType").toUpperCase();
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Workflow name is required");
        }
        if (!TRIGGERS.contains(triggerType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown trigger type");
        }
        String stepsJson = normalizeSteps(body.get("stepsJson"), body.get("steps"));
        UUID id = uuid(body, "id");
        Workflow wf = id == null ? new Workflow() : store.getOwned(Workflow.class, id, orgId());
        wf.setOrganizationId(orgId());
        wf.setName(name);
        wf.setTriggerType(triggerType);
        wf.setStepsJson(stepsJson);
        wf.setActive(body.get("active") == null || Boolean.TRUE.equals(body.get("active"))
                || "true".equalsIgnoreCase(String.valueOf(body.get("active"))));
        wf = store.save(wf);
        return workflowView(wf);
    }

    public Map<String, Object> previewWorkflow(UUID id) {
        requireEnterprise();
        Workflow wf = store.getOwned(Workflow.class, id, orgId());
        Map<String, Object> out = workflowView(wf);
        out.put("simulatedSteps", parseSteps(wf.getStepsJson()));
        return out;
    }

    public Map<String, Object> accreditationDashboard() {
        requireEnterprise();
        UUID org = orgId();
        List<AccreditationFolder> folders = store.list(AccreditationFolder.class, org);
        List<AccreditationEvidence> evidence = store.list(AccreditationEvidence.class, org);
        long submitted = evidence.stream().filter(e -> "SUBMITTED".equalsIgnoreCase(e.getStatus())).count();
        long approved = evidence.stream().filter(e -> "APPROVED".equalsIgnoreCase(e.getStatus())).count();
        long draft = evidence.stream().filter(e -> "DRAFT".equalsIgnoreCase(e.getStatus())).count();

        List<Map<String, Object>> byFramework = new ArrayList<>();
        Map<String, long[]> counts = new LinkedHashMap<>();
        for (AccreditationFolder f : folders) {
            counts.computeIfAbsent(blank(f.getFramework(), "NAAC"), k -> new long[2]);
        }
        for (AccreditationEvidence e : evidence) {
            AccreditationFolder folder = folders.stream()
                    .filter(f -> f.getId().equals(e.getFolderId()))
                    .findFirst()
                    .orElse(null);
            String fw = folder == null ? "Other" : blank(folder.getFramework(), "NAAC");
            long[] c = counts.computeIfAbsent(fw, k -> new long[2]);
            c[0]++;
            if ("SUBMITTED".equalsIgnoreCase(e.getStatus()) || "APPROVED".equalsIgnoreCase(e.getStatus())) {
                c[1]++;
            }
        }
        counts.forEach((fw, c) -> byFramework.add(Map.of(
                "framework", fw,
                "evidence", c[0],
                "submitted", c[1]
        )));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("folders", folders.size());
        out.put("evidenceTotal", evidence.size());
        out.put("draft", draft);
        out.put("submitted", submitted);
        out.put("approved", approved);
        out.put("byFramework", byFramework);
        return out;
    }

    public Map<String, Object> aiSuite() {
        requireEnterprise();
        Map<String, Object> out = new LinkedHashMap<>(scale.aiStatus());
        out.put("tools", aiSuiteTools());
        return out;
    }

    public void enrichApproval(ApprovalRequest req) {
        if (req == null || req.getOrganizationId() == null) {
            return;
        }
        Workflow wf = findActiveWorkflow(req.getOrganizationId(), req.getKind());
        if (wf == null) {
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            if (req.getPayloadJson() != null && !req.getPayloadJson().isBlank()) {
                payload.putAll(mapper.readValue(req.getPayloadJson(), Map.class));
            }
            payload.put("workflowId", wf.getId().toString());
            payload.put("workflowName", wf.getName());
            payload.put("steps", parseSteps(wf.getStepsJson()));
            req.setPayloadJson(mapper.writeValueAsString(payload));
        } catch (Exception ignored) {
            /* keep original payload */
        }
    }

    public Workflow findActiveWorkflow(UUID orgId, String kind) {
        if (kind == null) {
            return null;
        }
        String trigger = kind.toUpperCase();
        return store.list(Workflow.class, orgId).stream()
                .filter(Workflow::isActive)
                .filter(w -> trigger.equalsIgnoreCase(w.getTriggerType()))
                .findFirst()
                .orElse(null);
    }

    private Map<String, Object> workflowView(Workflow wf) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", wf.getId());
        row.put("name", wf.getName());
        row.put("triggerType", wf.getTriggerType());
        row.put("active", wf.isActive());
        row.put("steps", parseSteps(wf.getStepsJson()));
        row.put("stepsJson", wf.getStepsJson());
        return row;
    }

    private List<Map<String, Object>> parseSteps(String stepsJson) {
        if (stepsJson == null || stepsJson.isBlank()) {
            return defaultSteps();
        }
        try {
            JsonNode node = mapper.readTree(stepsJson);
            if (!node.isArray()) {
                return defaultSteps();
            }
            List<Map<String, Object>> steps = new ArrayList<>();
            int i = 1;
            for (JsonNode step : node) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("step", step.has("step") ? step.get("step").asInt(i) : i);
                row.put("role", step.path("role").asText("OWNER"));
                row.put("action", step.path("action").asText("APPROVE"));
                row.put("label", step.path("label").asText(""));
                steps.add(row);
                i++;
            }
            return steps.isEmpty() ? defaultSteps() : steps;
        } catch (Exception e) {
            return defaultSteps();
        }
    }

    private String normalizeSteps(Object stepsJson, Object steps) {
        if (stepsJson != null && !String.valueOf(stepsJson).isBlank()) {
            return String.valueOf(stepsJson);
        }
        if (steps instanceof List<?> list && !list.isEmpty()) {
            try {
                return mapper.writeValueAsString(list);
            } catch (Exception e) {
                return defaultStepsJson();
            }
        }
        return defaultStepsJson();
    }

    private List<Map<String, Object>> defaultSteps() {
        return List.of(Map.of("step", 1, "role", "OWNER", "action", "APPROVE", "label", "Owner approval"));
    }

    private String defaultStepsJson() {
        return "[{\"step\":1,\"role\":\"OWNER\",\"action\":\"APPROVE\",\"label\":\"Owner approval\"}]";
    }

    private List<Map<String, Object>> aiSuiteTools() {
        return List.of(
                Map.of("id", "coach", "label", "AI academic coach", "endpoint", "/api/actions/ai/coach"),
                Map.of("id", "resume", "label", "AI resume suggestions", "endpoint", "/api/actions/ai/resume"),
                Map.of("id", "career", "label", "AI career path", "endpoint", "/api/actions/ai/career"),
                Map.of("id", "outcomes", "label", "Learning outcomes", "endpoint", "/api/actions/learning-outcomes"),
                Map.of("id", "scorm", "label", "SCORM / LTI packages", "endpoint", "/api/lms-packages")
        );
    }

    private void requireEnterprise() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT, Roles.FACULTY);
        Access.requirePackage(user, "ENTERPRISE");
    }

    private UUID orgId() {
        return Auth.current().organizationId();
    }

    private static String str(Map<String, Object> body, String key) {
        if (body == null || body.get(key) == null) {
            return "";
        }
        return String.valueOf(body.get(key)).trim();
    }

    private static UUID uuid(Map<String, Object> body, String key) {
        if (body == null || body.get(key) == null || String.valueOf(body.get(key)).isBlank()) {
            return null;
        }
        return UUID.fromString(String.valueOf(body.get(key)));
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }
}
