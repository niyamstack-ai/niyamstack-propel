CREATE TABLE IF NOT EXISTS institute_holidays (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    holiday_date DATE NOT NULL,
    center_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom_json TEXT;
