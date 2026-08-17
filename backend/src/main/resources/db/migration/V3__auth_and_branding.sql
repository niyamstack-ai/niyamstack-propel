ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug VARCHAR(80);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS access_status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_secondary VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS ux_organizations_slug ON organizations (slug) WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone ON users (phone) WHERE phone IS NOT NULL AND phone <> '';
