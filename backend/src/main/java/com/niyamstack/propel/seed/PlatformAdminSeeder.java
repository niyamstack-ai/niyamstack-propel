package com.niyamstack.propel.seed;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.PlatformRole;
import com.niyamstack.propel.platform.PlatformCaps;
import com.niyamstack.propel.security.Roles;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Component
@Order(200)
public class PlatformAdminSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(PlatformAdminSeeder.class);
    private final Store store;
    private final PasswordEncoder encoder;

    public PlatformAdminSeeder(Store store, PasswordEncoder encoder) {
        this.store = store;
        this.encoder = encoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        ensureAdmin();
        ensureRoles();
    }

    private void ensureAdmin() {
        AppUser existing = store.findUserByEmail("admin");
        if (existing != null) {
            if (!Roles.isPlatform(existing.getRole())) {
                log.warn("User 'admin' exists but is not a platform owner; not overwriting");
            }
            return;
        }
        AppUser user = new AppUser();
        user.setFullName("Niyamstack Owner");
        user.setEmail("admin");
        user.setPasswordHash(encoder.encode("admin"));
        user.setRole(Roles.PLATFORM_OWNER);
        user.setActive(true);
        store.save(user);
        log.info("Platform owner created. Sign in at /platform/login with id admin");
    }

    private void ensureRoles() {
        if (!store.listPlatformRoles().isEmpty()) {
            return;
        }
        Map<String, List<String>> seed = Map.of(
                "Sales", List.of(PlatformCaps.VIEW_DASHBOARD, PlatformCaps.VIEW_INSTITUTES, PlatformCaps.EDIT_DEAL),
                "Support", List.of(PlatformCaps.VIEW_DASHBOARD, PlatformCaps.VIEW_INSTITUTES),
                "Finance", List.of(PlatformCaps.VIEW_DASHBOARD, PlatformCaps.VIEW_INSTITUTES, PlatformCaps.EDIT_DEAL, PlatformCaps.MARK_PAID),
                "HR", List.of(PlatformCaps.VIEW_DASHBOARD, PlatformCaps.MANAGE_EMPLOYEES),
                "Operations", List.of(
                        PlatformCaps.VIEW_DASHBOARD,
                        PlatformCaps.VIEW_INSTITUTES,
                        PlatformCaps.EDIT_DEAL,
                        PlatformCaps.MARK_PAID,
                        PlatformCaps.APPROVE,
                        PlatformCaps.SUSPEND)
        );
        for (var entry : seed.entrySet()) {
            PlatformRole role = new PlatformRole();
            role.setName(entry.getKey());
            role.setCapabilitiesCsv(String.join(",", entry.getValue()));
            store.save(role);
        }
        log.info("Default platform roles created. Rename or add more under Settings.");
    }
}
