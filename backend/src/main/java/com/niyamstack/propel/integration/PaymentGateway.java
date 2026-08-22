package com.niyamstack.propel.integration;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

public interface PaymentGateway {
    String provider();
    boolean live();
    ChargeResult charge(UUID orgId, BigDecimal amount, String method, String reference);

    default boolean live(UUID orgId) {
        return live();
    }

    default String provider(UUID orgId) {
        return provider();
    }

    default String publicKey(UUID orgId) {
        return "";
    }

    default ChargeResult createOrder(UUID orgId, BigDecimal amount, String reference, Map<String, String> notes) {
        return charge(orgId, amount, "UPI", reference);
    }

    default boolean verifyCheckout(UUID orgId, String orderId, String paymentId, String signature) {
        return !live(orgId);
    }

    default boolean verifyWebhook(UUID orgId, String payload, String signature) {
        return !live(orgId);
    }

    default String refundPayment(UUID orgId, String razorpayPaymentId, BigDecimal amount) {
        return "";
    }

    record ChargeResult(boolean success, String gatewayRef, String message, Map<String, Object> details) {}
}
