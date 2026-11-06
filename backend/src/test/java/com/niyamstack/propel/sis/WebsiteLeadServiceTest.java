package com.niyamstack.propel.sis;

import com.niyamstack.propel.domain.Model.WebsiteLead;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WebsiteLeadServiceTest {

    @Test
    void otpSentLeadIsNotEmailProven() {
        WebsiteLead lead = new WebsiteLead();
        lead.setStatus("OTP_SENT");
        lead.setEmailVerified(false);
        assertFalse(WebsiteLeadService.emailAlreadyProven(lead),
                "OTP_SENT is created when the code is emailed — must still require OTP on purchase");
    }

    @Test
    void otpVerifiedLeadIsEmailProven() {
        WebsiteLead lead = new WebsiteLead();
        lead.setStatus("OTP_VERIFIED");
        lead.setEmailVerified(false);
        assertTrue(WebsiteLeadService.emailAlreadyProven(lead));
    }

    @Test
    void paymentStartedLeadIsEmailProven() {
        WebsiteLead lead = new WebsiteLead();
        lead.setStatus("PAYMENT_STARTED");
        assertTrue(WebsiteLeadService.emailAlreadyProven(lead));
    }

    @Test
    void emailVerifiedFlagIsEmailProven() {
        WebsiteLead lead = new WebsiteLead();
        lead.setStatus("OTP_SENT");
        lead.setEmailVerified(true);
        assertTrue(WebsiteLeadService.emailAlreadyProven(lead));
    }
}
