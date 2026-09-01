CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    module VARCHAR(40) NOT NULL,
    action VARCHAR(80) NOT NULL,
    actor_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    subject_type VARCHAR(40) NOT NULL,
    subject_id UUID NOT NULL,
    status VARCHAR(40) DEFAULT 'PENDING',
    reason VARCHAR(1000),
    requested_by UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_release_notes (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    version VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_events_org_created ON usage_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_org_status ON data_deletion_requests(organization_id, status);
