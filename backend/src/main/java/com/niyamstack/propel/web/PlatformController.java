package com.niyamstack.propel.web;

import com.niyamstack.propel.catalog.Features;
import com.niyamstack.propel.platform.PlatformService;
import com.niyamstack.propel.platform.PlatformService.DealRequest;
import com.niyamstack.propel.platform.PlatformService.EmployeeRequest;
import com.niyamstack.propel.platform.PlatformService.EmployeeUpdate;
import com.niyamstack.propel.platform.SettlementService;
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
    private final SettlementService settlements;

    public PlatformController(PlatformService platform, SettlementService settlements) {
        this.platform = platform;
        this.settlements = settlements;
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

    @PostMapping("/institutes/{id}/trash")
    public Map<String, Object> trash(@PathVariable UUID id) {
        return platform.trash(id);
    }

    @PutMapping("/institutes/{id}/owner-contact")
    public Map<String, Object> ownerContact(@PathVariable UUID id, @RequestBody PlatformService.OwnerContactRequest body) {
        return platform.updateOwnerContact(id, body);
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

    @GetMapping("/payment-gateway")
    public Map<String, Object> paymentGateway() {
        return platform.paymentGateway();
    }

    @PutMapping("/payment-gateway")
    public Map<String, Object> savePaymentGateway(@RequestBody Map<String, String> body) {
        return platform.savePaymentGateway(body);
    }

    @GetMapping("/oauth-login")
    public Map<String, Object> oauthLogin() {
        return platform.oauthLogin();
    }

    @PutMapping("/oauth-login")
    public Map<String, Object> saveOauthLogin(@RequestBody Map<String, String> body) {
        return platform.saveOauthLogin(body);
    }

    @GetMapping("/settlement/report")
    public List<Map<String, Object>> settlementReport(@RequestParam(required = false) UUID organizationId) {
        return settlements.report(organizationId);
    }

    @GetMapping("/settlement/batches")
    public List<Map<String, Object>> settlementBatches(@RequestParam(required = false) UUID organizationId) {
        return settlements.batches(organizationId);
    }

    @PostMapping("/settlement/weekly")
    public List<Map<String, Object>> runWeeklySettlement() {
        return settlements.runWeeklyPayouts();
    }

    @PostMapping("/settlement/batches/{id}/mark-paid")
    public Map<String, Object> markBatchPaid(@PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
        String ref = body == null ? null : body.get("gatewayRef");
        return settlements.markBatchPaid(id, ref);
    }

    @PostMapping("/settlement/batches/{id}/retry-auto")
    public Map<String, Object> retryAutoBatch(@PathVariable UUID id) {
        return settlements.retryAutomatic(id);
    }

    @GetMapping("/settlement/payout-mode")
    public Map<String, Object> payoutMode() {
        return settlements.payoutSettings();
    }

    @PutMapping("/settlement/payout-mode")
    public Map<String, Object> savePayoutMode(@RequestBody Map<String, String> body) {
        return settlements.setGlobalPayoutMode(body == null ? null : body.get("payoutMode"));
    }
}
