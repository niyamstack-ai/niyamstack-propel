-- Per-course toggles for student LMS tabs (timetable, assignments, doubts)

ALTER TABLE courses ADD COLUMN IF NOT EXISTS enable_timetable BOOLEAN DEFAULT TRUE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS enable_assignments BOOLEAN DEFAULT TRUE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS enable_doubts BOOLEAN DEFAULT TRUE;
