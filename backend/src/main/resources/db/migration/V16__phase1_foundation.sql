CREATE TABLE IF NOT EXISTS institute_roles (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    base_role VARCHAR(40) NOT NULL DEFAULT 'FACULTY',
    capabilities_csv VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (organization_id, name)
);
