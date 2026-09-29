ALTER TABLE students ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_status VARCHAR(40);
CREATE INDEX IF NOT EXISTS ix_students_org_trashed ON students (organization_id, trashed_at);
