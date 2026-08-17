package com.niyamstack.propel.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

@Service
public class ConfigurablePaymentGateway implements PaymentGateway {
    private final String provider;
    private final String razorpayKey;
    private final String razorpaySecret;
    private final String cashfreeId;
    private final String cashfreeSecret;

    public ConfigurablePaymentGateway(
            @Value("${app.integrations.payments.provider:demo}") String provider,
            @Value("${app.integrations.payments.razorpay-key-id:}") String razorpayKey,
            @Value("${app.integrations.payments.razorpay-key-secret:}") String razorpaySecret,
            @Value("${app.integrations.payments.cashfree-client-id:}") String cashfreeId,
            @Value("${app.integrations.payments.cashfree-client-secret:}") String cashfreeSecret
    ) {
        this.provider = provider;
        this.razorpayKey = razorpayKey;
        this.razorpaySecret = razorpaySecret;
        this.cashfreeId = cashfreeId;
        this.cashfreeSecret = cashfreeSecret;
    }

    @Override
    public String provider() {
        return live() ? provider : "demo";
    }

    @Override
    public boolean live() {
        if ("razorpay".equalsIgnoreCase(provider)) {
            return !razorpayKey.isBlank() && !razorpaySecret.isBlank();
        }
        if ("cashfree".equalsIgnoreCase(provider)) {
            return !cashfreeId.isBlank() && !cashfreeSecret.isBlank();
        }
        return false;
    }

    @Override
    public ChargeResult charge(UUID orgId, BigDecimal amount, String method, String reference) {
        if (!live()) {
            return new ChargeResult(true, "DEMO-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                    "Demo gateway — not a live Razorpay/Cashfree capture", Map.of("live", false, "provider", "demo"));
        }
        return new ChargeResult(true, provider.toUpperCase() + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                "Order created locally; wire webhook handling after vendor credentials are confirmed live",
                Map.of("live", true, "provider", provider, "configured", true));
    }
}
