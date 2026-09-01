CREATE TABLE IF NOT EXISTS attendance_regularizations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    employee_id UUID NOT NULL,
    work_date DATE NOT NULL,
    shift VARCHAR(40) DEFAULT 'FULL',
    requested_status VARCHAR(40) DEFAULT 'PRESENT',
    in_time TIME,
    out_time TIME,
    reason VARCHAR(1000),
    status VARCHAR(40) DEFAULT 'PENDING',
    decided_by UUID,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_documents (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    employee_id UUID NOT NULL,
    doc_type VARCHAR(80),
    file_name VARCHAR(255),
    storage_url VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_policies (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    leave_year INTEGER NOT NULL,
    cl_annual NUMERIC(8,1) DEFAULT 12,
    sl_annual NUMERIC(8,1) DEFAULT 6,
    el_annual NUMERIC(8,1) DEFAULT 15,
    exclude_holidays BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (organization_id, leave_year)
);

CREATE TABLE IF NOT EXISTS resignation_requests (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    employee_id UUID NOT NULL,
    last_working_date DATE,
    reason VARCHAR(1000),
    status VARCHAR(40) DEFAULT 'PENDING',
    decided_by UUID,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
