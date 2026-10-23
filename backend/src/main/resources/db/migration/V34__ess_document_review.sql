ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'PENDING';
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS review_note VARCHAR(1000);
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

UPDATE employee_documents SET status = 'PENDING' WHERE status IS NULL OR status = '';
