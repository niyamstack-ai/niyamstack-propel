ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS language VARCHAR(40);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS starter_code TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS tests_json TEXT;
UPDATE questions SET question_type = 'MCQ' WHERE question_type IS NULL AND options_json IS NOT NULL AND options_json <> '' AND options_json <> '[]';
UPDATE questions SET question_type = 'LONG' WHERE question_type IS NULL;
