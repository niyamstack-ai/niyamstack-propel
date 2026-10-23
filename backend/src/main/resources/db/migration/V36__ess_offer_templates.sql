ALTER TABLE staff_candidates ADD COLUMN IF NOT EXISTS letter_body TEXT;
ALTER TABLE staff_candidates ADD COLUMN IF NOT EXISTS job_description TEXT;

-- Widen template body (H2 + Postgres variants; SchemaPatch also applies these)
ALTER TABLE document_templates ALTER COLUMN body SET DATA TYPE TEXT;
ALTER TABLE document_templates ALTER COLUMN body TYPE TEXT;
