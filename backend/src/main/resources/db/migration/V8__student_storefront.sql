-- Student website: enrollments after purchase, course-scoped learning.

CREATE TABLE IF NOT EXISTS course_enrollments (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    course_id UUID NOT NULL REFERENCES courses(id),
    invoice_id UUID REFERENCES invoices(id),
    status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
    source VARCHAR(40) NOT NULL DEFAULT 'WEBSITE',
    purchased_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_course_enrollments_student_course
    ON course_enrollments (student_id, course_id);

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS course_id UUID;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS course_id UUID;
