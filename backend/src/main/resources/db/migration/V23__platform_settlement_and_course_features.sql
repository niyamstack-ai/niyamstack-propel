-- Platform settlement, institute bank, fee mode, and per-course student feature flags

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC(6,4) DEFAULT 0.0500;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS platform_fee_mode VARCHAR(20) DEFAULT 'ABSORB';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payout_mode VARCHAR(20) DEFAULT 'INHERIT';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(120);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(40);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_upi VARCHAR(80);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS enable_contents BOOLEAN DEFAULT TRUE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS enable_tests BOOLEAN DEFAULT TRUE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS enable_coding BOOLEAN DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS settlement_entries (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    payment_id UUID,
    invoice_id UUID,
    student_id UUID,
    course_id UUID,
    gross_amount NUMERIC(12,2) NOT NULL,
    platform_fee_percent NUMERIC(6,4) NOT NULL,
    platform_fee_amount NUMERIC(12,2) NOT NULL,
    fee_mode VARCHAR(20) NOT NULL,
    net_to_institute NUMERIC(12,2) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    payout_batch_id UUID,
    notes VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_settlement_org_status ON settlement_entries (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_settlement_batch ON settlement_entries (payout_batch_id);

CREATE TABLE IF NOT EXISTS payout_batches (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    platform_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'READY',
    mode VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    bank_account_name VARCHAR(120),
    bank_account_number VARCHAR(40),
    bank_ifsc VARCHAR(20),
    gateway_ref VARCHAR(120),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_org ON payout_batches (organization_id, status);
