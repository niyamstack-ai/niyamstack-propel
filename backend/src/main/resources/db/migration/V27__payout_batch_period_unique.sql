CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_batches_org_period
    ON payout_batches (organization_id, period_start, period_end);
