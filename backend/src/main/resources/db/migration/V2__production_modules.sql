-- Production-depth LMS, fees, placement, audit, and security columns.

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS storage_key VARCHAR(400);
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS visibility VARCHAR(40) NOT NULL DEFAULT 'BATCH';
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS max_score NUMERIC(8,2);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS file_url VARCHAR(500);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'SUBMITTED';

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS passing_score INTEGER;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS total_marks INTEGER;

ALTER TABLE fee_plans ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2);
ALTER TABLE fee_plans ADD COLUMN IF NOT EXISTS installment_count INTEGER;
ALTER TABLE fee_plans ADD COLUMN IF NOT EXISTS hsn VARCHAR(20);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS hsn VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS installment_id UUID;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'CAPTURED';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no VARCHAR(40);

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS requested_by UUID;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE drives ADD COLUMN IF NOT EXISTS eligibility_rule_id UUID;
ALTER TABLE drives ADD COLUMN IF NOT EXISTS min_attendance_pct INTEGER;
ALTER TABLE drives ADD COLUMN IF NOT EXISTS min_marks INTEGER;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS eligibility_passed BOOLEAN;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS current_round VARCHAR(80);

CREATE TABLE IF NOT EXISTS fee_installments (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    fee_plan_id UUID REFERENCES fee_plans(id),
    student_id UUID NOT NULL REFERENCES students(id),
    seq_no INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'DUE',
    invoice_id UUID REFERENCES invoices(id),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    payment_id UUID NOT NULL REFERENCES payments(id),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    receipt_no VARCHAR(40) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    gstin VARCHAR(32),
    issued_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (organization_id, receipt_no)
);

CREATE TABLE IF NOT EXISTS exam_attempts (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    assessment_id UUID NOT NULL REFERENCES assessments(id),
    student_id UUID NOT NULL REFERENCES students(id),
    started_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    answers_json TEXT,
    score INTEGER,
    max_score INTEGER,
    status VARCHAR(40) NOT NULL DEFAULT 'IN_PROGRESS',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS lms_packages (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    content_item_id UUID REFERENCES content_items(id),
    standard VARCHAR(40) NOT NULL,
    package_key VARCHAR(400),
    launch_url VARCHAR(500),
    version_label VARCHAR(40),
    status VARCHAR(40) NOT NULL DEFAULT 'READY',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS lms_launches (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    package_id UUID NOT NULL REFERENCES lms_packages(id),
    student_id UUID NOT NULL REFERENCES students(id),
    launched_at TIMESTAMPTZ NOT NULL,
    progress_pct INTEGER,
    completion VARCHAR(40),
    score INTEGER,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS drive_rounds (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    drive_id UUID NOT NULL REFERENCES drives(id),
    seq_no INTEGER NOT NULL,
    round_name VARCHAR(80) NOT NULL,
    round_type VARCHAR(40) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY,
    organization_id UUID,
    actor_user_id UUID,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80),
    entity_id UUID,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_org ON content_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_org ON exam_attempts(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_installments_student ON fee_installments(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_packages_org ON lms_packages(organization_id);
CREATE INDEX IF NOT EXISTS idx_drive_rounds_drive ON drive_rounds(drive_id);
