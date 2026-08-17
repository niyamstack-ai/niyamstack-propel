package com.niyamstack.propel.audit;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.AuditEvent;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AuditService {
    private final Store store;

    public AuditService(Store store) {
        this.store = store;
    }

    @Transactional
    public void log(String action, String entityType, UUID entityId, String detail) {
        AuditEvent event = new AuditEvent();
        try {
            PropelUser user = Auth.current();
            event.setOrganizationId(user.organizationId());
            event.setActorUserId(user.userId());
        } catch (Exception ignored) {
            // login / public paths
        }
        event.setAction(action);
        event.setEntityType(entityType);
        event.setEntityId(entityId);
        event.setDetail(detail);
        if (event.getOrganizationId() == null && entityId != null && "Organization".equals(entityType)) {
            event.setOrganizationId(entityId);
        }
        store.save(event);
    }
}
