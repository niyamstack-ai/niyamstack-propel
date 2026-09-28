package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.PendingFlow;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class PendingFlowService {
    private final Store store;

    public PendingFlowService(Store store) {
        this.store = store;
    }

    @Transactional
    public void put(String flowKey, String purpose, String payloadJson, Instant expiresAt) {
        if (flowKey == null || flowKey.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Flow key is required");
        }
        PendingFlow row = store.findPendingFlow(flowKey);
        if (row == null) {
            row = new PendingFlow();
            row.setFlowKey(flowKey.trim());
        }
        row.setPurpose(purpose == null ? "" : purpose);
        row.setPayloadJson(payloadJson == null ? "{}" : payloadJson);
        row.setExpiresAt(expiresAt == null ? Instant.now().plusSeconds(600) : expiresAt);
        store.save(row);
    }

    public String getPayload(String flowKey) {
        PendingFlow row = store.findPendingFlow(flowKey);
        if (row == null || row.getExpiresAt() == null || row.getExpiresAt().isBefore(Instant.now())) {
            if (row != null) {
                store.deletePendingFlow(row);
            }
            return null;
        }
        return row.getPayloadJson();
    }

    @Transactional
    public String consume(String flowKey) {
        PendingFlow row = store.findPendingFlow(flowKey);
        if (row == null || row.getExpiresAt() == null || row.getExpiresAt().isBefore(Instant.now())) {
            if (row != null) {
                store.deletePendingFlow(row);
            }
            return null;
        }
        String payload = row.getPayloadJson();
        store.deletePendingFlow(row);
        return payload;
    }

    @Transactional
    public void remove(String flowKey) {
        PendingFlow row = store.findPendingFlow(flowKey);
        if (row != null) {
            store.deletePendingFlow(row);
        }
    }
}
