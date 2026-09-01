package com.niyamstack.propel.fees;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class FeeReminderJob {
    private static final Logger log = LoggerFactory.getLogger(FeeReminderJob.class);
    private final FeeService fees;

    public FeeReminderJob(FeeService fees) {
        this.fees = fees;
    }

    @Scheduled(initialDelay = 60_000, fixedDelay = 3_600_000)
    public void remindOverdue() {
        try {
            int sent = fees.remindOverdue();
            if (sent > 0) {
                log.info("Queued {} overdue fee reminder(s)", sent);
            }
        } catch (Exception e) {
            log.warn("Fee reminder pass failed: {}", e.toString());
        }
    }
}
