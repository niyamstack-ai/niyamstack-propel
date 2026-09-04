package com.niyamstack.propel.web;

import com.niyamstack.propel.catalog.Features;
import com.niyamstack.propel.platform.PlatformService;
import com.niyamstack.propel.platform.PlatformService.DealRequest;
import com.niyamstack.propel.platform.PlatformService.EmployeeRequest;
import com.niyamstack.propel.platform.PlatformService.EmployeeUpdate;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/platform")
public class PlatformController {
    private final PlatformService platform;

    public PlatformController(PlatformService platform) {
        this.platform = platform;
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}

    public record PasswordChangeRequest(@NotBlank String currentPassword, @NotBlank String newPassword) {}

    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest body) {
        return platform.login(body.username(), body.password());
    }

    @PostMapping("/password")
    public Map<String, String> password(@Valid @RequestBody PasswordChangeRequest body) {
        return platform.changePassword(body.currentPassword(), body.newPassword());
    }

    @GetMapping("/me")
    public Map<String, Object> me() {
        return platform.me();
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        return platform.dashboard();
    }

    @GetMapping("/features")
    public Object features() {
        Access.requirePlatform(Auth.current());
        return Features.ALL;
    }

    @GetMapping("/institutes")
    public List<Map<String, Object>> institutes() {
        return platform.institutes();
    }

    @GetMapping("/institutes/{id}")
    public Map<String, Object> institute(@PathVariable UUID id) {
        return platform.institute(id);
    }

    @PutMapping("/institutes/{id}/deal")
    public Map<String, Object> deal(@PathVariable UUID id, @RequestBody DealRequest body) {
        return platform.saveDeal(id, body);
    }

    @PostMapping("/institutes/{id}/mark-paid")
    public Map<String, Object> markPaid(@PathVariable UUID id) {
        return platform.markPaid(id);
    }

    @PostMapping("/institutes/{id}/mark-failed")
    public Map<String, Object> markFailed(@PathVariable UUID id) {
        return platform.markFailed(id);
    }

    @PostMapping("/institutes/{id}/approve")
    public Map<String, Object> approve(@PathVariable UUID id) {
        return platform.approve(id);
    }

    @PostMapping("/institutes/{id}/suspend")
    public Map<String, Object> suspend(@PathVariable UUID id) {
        return platform.suspend(id);
    }

    @PostMapping("/institutes/{id}/restore")
    public Map<String, Object> restore(@PathVariable UUID id) {
        return platform.restore(id);
    }

    @GetMapping("/employees")
    public List<Map<String, Object>> employees() {
        return platform.employees();
    }

    @PostMapping("/employees")
    public Map<String, Object> createEmployee(@RequestBody EmployeeRequest body) {
        return platform.createEmployee(body);
    }

    @PutMapping("/employees/{id}")
    public Map<String, Object> updateEmployee(@PathVariable UUID id, @RequestBody EmployeeUpdate body) {
        return platform.updateEmployee(id, body);
    }

    @GetMapping("/roles")
    public Map<String, Object> roles() {
        return platform.roleCatalog();
    }

    @PostMapping("/roles")
    public Map<String, Object> createRole(@RequestBody PlatformService.RoleRequest body) {
        return platform.createRole(body);
    }

    @PutMapping("/roles/{id}")
    public Map<String, Object> updateRole(@PathVariable UUID id, @RequestBody PlatformService.RoleRequest body) {
        return platform.updateRole(id, body);
    }

    @DeleteMapping("/roles/{id}")
    public void deleteRole(@PathVariable UUID id) {
        platform.deleteRole(id);
    }

    @GetMapping("/rights")
    public Map<String, Object> rights() {
        return platform.rights();
    }
}
