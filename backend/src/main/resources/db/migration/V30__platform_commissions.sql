-- Offline platform commission notes (institute → Niyamstack) on course allotment

CREATE TABLE IF NOT EXISTS platform_commissions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    student_id UUID NOT NULL,
    course_id UUID NOT NULL,
    course_name VARCHAR(200),
    course_fees NUMERIC(12,2) NOT NULL,
    platform_fee_percent NUMERIC(6,4) NOT NULL,
    platform_fee_amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    source VARCHAR(40),
    received_at TIMESTAMP WITH TIME ZONE,
    notes VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_platform_commissions_org_student_course
    ON platform_commissions (organization_id, student_id, course_id);

CREATE INDEX IF NOT EXISTS idx_platform_commissions_org_status
    ON platform_commissions (organization_id, status);
