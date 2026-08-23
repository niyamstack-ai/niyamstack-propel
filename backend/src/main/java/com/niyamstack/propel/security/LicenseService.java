package com.niyamstack.propel.security;

import com.niyamstack.propel.catalog.Packs;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Center;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.domain.Model.Student;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class LicenseService {
    private final Store store;

    public LicenseService(Store store) {
        this.store = store;
    }

    public PropelUser enrich(PropelUser user) {
        if (user == null || user.organizationId() == null || Roles.isPlatform(user.role())) {
            return user;
        }
        Organization org = store.get(Organization.class, user.organizationId());
        AppUser db = store.get(AppUser.class, user.userId());
        String pack = Packs.normalizePack(org.getProductPack());
        String modules = org.getModulesCsv();
        if (modules == null || modules.isBlank()) {
            modules = Packs.modulesCsvForPack(pack);
        }
        String caps = db.getCapabilitiesCsv() == null ? "" : db.getCapabilitiesCsv();
        return user.withLicense(modules, caps, pack);
    }

    public void requireStudentCapacity(Organization org) {
        if (org.getMaxStudents() == null || org.getMaxStudents() <= 0) {
            return;
        }
        int used = store.list(Student.class, org.getId()).size();
        if (used >= org.getMaxStudents()) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Student limit reached (" + org.getMaxStudents() + "). Ask Niyamstack to raise the cap.");
        }
    }

    public void requireCenterCapacity(Organization org) {
        if (org.getMaxCenters() == null || org.getMaxCenters() <= 0) {
            return;
        }
        int used = store.list(Center.class, org.getId()).size();
        if (used >= org.getMaxCenters()) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Center limit reached (" + org.getMaxCenters() + "). Ask Niyamstack to raise the cap.");
        }
    }

    public void requireStudentCapacity() {
        Organization org = store.get(Organization.class, Auth.current().organizationId());
        requireStudentCapacity(org);
    }

    public void requireCenterCapacity() {
        Organization org = store.get(Organization.class, Auth.current().organizationId());
        requireCenterCapacity(org);
    }
}
