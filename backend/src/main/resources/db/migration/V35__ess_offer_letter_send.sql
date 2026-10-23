ALTER TABLE staff_candidates ADD COLUMN IF NOT EXISTS offer_letter_status VARCHAR(40) DEFAULT 'DRAFT';
ALTER TABLE staff_candidates ADD COLUMN IF NOT EXISTS offer_sent_at TIMESTAMPTZ;
ALTER TABLE staff_candidates ADD COLUMN IF NOT EXISTS offer_sent_channel VARCHAR(40);

UPDATE staff_candidates
SET offer_letter_status = 'DRAFT'
WHERE offer_letter_status IS NULL OR offer_letter_status = '';
