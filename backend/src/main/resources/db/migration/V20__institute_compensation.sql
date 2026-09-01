CREATE TABLE IF NOT EXISTS commission_settings (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) UNIQUE,
    conversion_flat NUMERIC(12,2) DEFAULT 500,
    fee_percent NUMERIC(6,4) DEFAULT 0.02,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS compensation_plans (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    employee_id UUID NOT NULL,
    plan_type VARCHAR(40) NOT NULL,
    rate_amount NUMERIC(12,2) DEFAULT 0,
    rate_percent NUMERIC(6,4) DEFAULT 0,
    effective_from DATE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS commission_ledger (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    employee_id UUID NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_id UUID,
    period_year INTEGER,
    period_month INTEGER,
    amount NUMERIC(12,2) DEFAULT 0,
    description VARCHAR(500),
    status VARCHAR(40) DEFAULT 'APPROVED',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS variable_pay NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS commission_pay NUMERIC(12,2) DEFAULT 0;
