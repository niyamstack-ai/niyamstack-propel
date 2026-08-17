ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) DEFAULT 'UNPAID';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deal_amount NUMERIC(12,2);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS modules_csv VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_students INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_centers INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(80);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deal_notes VARCHAR(1000);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approved_by UUID;

UPDATE organizations SET payment_status = 'UNPAID' WHERE payment_status IS NULL;
UPDATE organizations SET payment_status = 'PAID' WHERE access_status = 'ACTIVE' AND (payment_status IS NULL OR payment_status = 'UNPAID');
