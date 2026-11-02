CREATE TABLE IF NOT EXISTS website_leads (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    full_name VARCHAR(200),
    email VARCHAR(200),
    phone VARCHAR(40),
    course_id UUID,
    source VARCHAR(40) DEFAULT 'PURCHASE',
    status VARCHAR(40) DEFAULT 'OTP_SENT',
    email_verified BOOLEAN DEFAULT FALSE,
    student_id UUID,
    last_seen_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_website_leads_org_status ON website_leads (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_website_leads_org_email ON website_leads (organization_id, email);
