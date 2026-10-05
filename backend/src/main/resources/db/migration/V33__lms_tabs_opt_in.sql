-- Treat timetable / assignments / doubts like live classes: off unless the owner turns them on.

ALTER TABLE courses ALTER COLUMN enable_timetable SET DEFAULT FALSE;
ALTER TABLE courses ALTER COLUMN enable_assignments SET DEFAULT FALSE;
ALTER TABLE courses ALTER COLUMN enable_doubts SET DEFAULT FALSE;

UPDATE courses SET enable_timetable = FALSE WHERE enable_timetable IS DISTINCT FROM FALSE;
UPDATE courses SET enable_assignments = FALSE WHERE enable_assignments IS DISTINCT FROM FALSE;
UPDATE courses SET enable_doubts = FALSE WHERE enable_doubts IS DISTINCT FROM FALSE;
