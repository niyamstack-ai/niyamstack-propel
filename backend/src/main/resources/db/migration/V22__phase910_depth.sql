CREATE TABLE IF NOT EXISTS api_tokens (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    token_prefix VARCHAR(20) NOT NULL,
    scopes_csv VARCHAR(500),
    last_used_at TIMESTAMPTZ,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_goals (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    employee_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    cycle_label VARCHAR(40),
    target_value NUMERIC(12,2) DEFAULT 100,
    progress_value NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(40) DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS succession_plans (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    role_title VARCHAR(120) NOT NULL,
    incumbent_employee_id UUID,
    successor_employee_id UUID,
    readiness VARCHAR(40) DEFAULT 'DEVELOPING',
    notes VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS posh_cases (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    case_code VARCHAR(40) NOT NULL,
    severity VARCHAR(40) DEFAULT 'MEDIUM',
    status VARCHAR(40) DEFAULT 'OPEN',
    summary VARCHAR(1000),
    opened_by UUID,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS study_plans (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    plan_json TEXT,
    status VARCHAR(40) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS help_articles (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    locale VARCHAR(10) DEFAULT 'en',
    page_key VARCHAR(80) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS india_data_residency BOOLEAN DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS data_mode VARCHAR(40) DEFAULT 'SHARED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_royalty_pct NUMERIC(6,4) DEFAULT 0;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS royalty_pct NUMERIC(6,4) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_locale VARCHAR(10) DEFAULT 'en';
ALTER TABLE industry_events ADD COLUMN IF NOT EXISTS account_id UUID;
ALTER TABLE industry_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(40) DEFAULT 'CAMPUS_VISIT';
ALTER TABLE alumni_jobs ADD COLUMN IF NOT EXISTS routed_drive_id UUID;
