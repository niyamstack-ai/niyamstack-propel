package com.niyamstack.propel.integration;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

public interface PaymentGateway {
    String provider();
    boolean live();
    ChargeResult charge(UUID orgId, BigDecimal amount, String method, String reference);
    record ChargeResult(boolean success, String gatewayRef, String message, Map<String, Object> details) {}
}
