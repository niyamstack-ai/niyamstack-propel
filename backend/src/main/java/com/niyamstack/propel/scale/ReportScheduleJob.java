package com.niyamstack.propel.scale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ReportScheduleJob {
    private static final Logger log = LoggerFactory.getLogger(ReportScheduleJob.class);
    private final ScaleService scale;

    public ReportScheduleJob(ScaleService scale) {
        this.scale = scale;
    }

    @Scheduled(initialDelay = 90_000, fixedDelay = 3_600_000)
    public void runDue() {
        try {
            int sent = scale.runDueReports();
            if (sent > 0) {
                log.info("Sent {} scheduled report(s)", sent);
            }
        } catch (Exception e) {
            log.warn("Scheduled report pass failed: {}", e.getMessage());
        }
    }
}
