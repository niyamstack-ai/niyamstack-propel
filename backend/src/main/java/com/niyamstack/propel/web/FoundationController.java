package com.niyamstack.propel.web;

import com.niyamstack.propel.foundation.FoundationService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/foundation")
public class FoundationController {
    private final FoundationService foundation;

    public FoundationController(FoundationService foundation) {
        this.foundation = foundation;
    }

    @GetMapping("/onboarding")
    public Map<String, Object> onboarding() {
        return foundation.onboardingStatus();
    }

    @PutMapping("/onboarding")
    public Map<String, Object> updateOnboarding(@RequestBody Map<String, Object> body) {
        return foundation.updateOnboarding(body);
    }

    @GetMapping("/institute-roles")
    public List<Map<String, Object>> instituteRoles() {
        return foundation.instituteRoles();
    }

    @PostMapping("/institute-roles")
    public Map<String, Object> createRole(@RequestBody Map<String, Object> body) {
        return foundation.createInstituteRole(body);
    }

    @PutMapping("/institute-roles/{id}")
    public Map<String, Object> updateRole(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return foundation.updateInstituteRole(id, body);
    }

    @DeleteMapping("/institute-roles/{id}")
    public void deleteRole(@PathVariable UUID id) {
        foundation.deleteInstituteRole(id);
    }

    @PostMapping("/staff/{id}/link-employee")
    public Map<String, Object> linkEmployee(@PathVariable UUID id) {
        return foundation.linkStaffEmployee(id);
    }

    @GetMapping("/audit")
    public List<Map<String, Object>> audit(@RequestParam(defaultValue = "100") int limit) {
        return foundation.auditFeed(limit);
    }
}
