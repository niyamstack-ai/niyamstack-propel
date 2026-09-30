-- Soft-delete courses (keep enrollments / fees / progress)

ALTER TABLE courses ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_courses_org_trashed ON courses (organization_id, trashed_at);
