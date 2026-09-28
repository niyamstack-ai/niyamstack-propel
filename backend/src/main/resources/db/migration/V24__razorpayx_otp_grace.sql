-- RazorpayX payout fields, grace period, durable OTP

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS razorpay_contact_id VARCHAR(80);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS razorpay_fund_account_id VARCHAR(80);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE payout_batches ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(500);

CREATE TABLE IF NOT EXISTS otp_challenges (
    id UUID PRIMARY KEY,
    challenge_key VARCHAR(160) NOT NULL,
    purpose VARCHAR(40) NOT NULL,
    code_hash VARCHAR(120) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    tries INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_challenges_key ON otp_challenges (challenge_key);
