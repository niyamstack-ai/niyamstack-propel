package com.niyamstack.propel.platform;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class SettlementJob {
    private static final Logger log = LoggerFactory.getLogger(SettlementJob.class);
    private final SettlementService settlements;

    public SettlementJob(SettlementService settlements) {
        this.settlements = settlements;
    }

    /** Every Monday 06:15 IST — settle the previous Sun–Sat week. */
    @Scheduled(cron = "0 15 6 * * MON", zone = "Asia/Kolkata")
    public void weekly() {
        try {
            List<Map<String, Object>> created = settlements.runWeeklyPayoutsInternal();
            if (!created.isEmpty()) {
                log.info("Weekly settlement created {} batch(es)", created.size());
            }
        } catch (Exception e) {
            log.warn("Weekly settlement pass failed: {}", e.toString());
        }
    }
}
