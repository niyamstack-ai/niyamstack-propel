-- Classplus-parity growth layer: website, course commerce, marketing, people ops.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS category VARCHAR(80);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS sub_category VARCHAR(80);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_type VARCHAR(20) DEFAULT 'PAID';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS validity_type VARCHAR(40) DEFAULT 'SINGLE';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS validity_value INTEGER;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS validity_unit VARCHAR(20) DEFAULT 'MONTH';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT TRUE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS allow_offline BOOLEAN DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS allow_trial BOOLEAN DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS allow_preview BOOLEAN DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS allow_live BOOLEAN DEFAULT TRUE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

ALTER TABLE students ADD COLUMN IF NOT EXISTS about TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS roll_number VARCHAR(80);
ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_joining DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS institute_name VARCHAR(200);
ALTER TABLE students ADD COLUMN IF NOT EXISTS permanent_address VARCHAR(500);
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS app_share_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(200);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_published BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS website_pages (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    page_type VARCHAR(40) NOT NULL DEFAULT 'CUSTOM',
    body TEXT,
    meta_title VARCHAR(300),
    meta_description VARCHAR(1000),
    preview_image_url VARCHAR(500),
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    code VARCHAR(80) NOT NULL,
    name VARCHAR(200),
    discount_type VARCHAR(20) NOT NULL DEFAULT 'PERCENT',
    discount_value NUMERIC(12,2) NOT NULL,
    course_id UUID REFERENCES courses(id),
    max_redemptions INTEGER,
    redeemed_count INTEGER NOT NULL DEFAULT 0,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    live BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS landing_pages (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    page_kind VARCHAR(40) NOT NULL,
    slug VARCHAR(120),
    headline VARCHAR(300),
    body TEXT,
    cta_label VARCHAR(80),
    course_id UUID REFERENCES courses(id),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    views_count INTEGER NOT NULL DEFAULT 0,
    leads_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    campaign_type VARCHAR(40) NOT NULL,
    trigger_event VARCHAR(80),
    channel VARCHAR(40) NOT NULL DEFAULT 'PUSH',
    audience VARCHAR(80) NOT NULL DEFAULT 'ALL_USERS',
    title VARCHAR(300),
    body TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
    scheduled_at TIMESTAMPTZ,
    sent_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS app_banners (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    title VARCHAR(200) NOT NULL,
    image_url VARCHAR(500),
    link_url VARCHAR(500),
    live BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS app_pushes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    title VARCHAR(300) NOT NULL,
    body TEXT,
    audience VARCHAR(80) NOT NULL DEFAULT 'ALL_USERS',
    status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS free_materials (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    title VARCHAR(300) NOT NULL,
    material_type VARCHAR(40) NOT NULL,
    url VARCHAR(500),
    file_name VARCHAR(300),
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_threads (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID,
    student_name VARCHAR(200),
    subject VARCHAR(300),
    status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    thread_id UUID NOT NULL REFERENCES chat_threads(id),
    sender_role VARCHAR(40) NOT NULL,
    sender_name VARCHAR(200),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS one_to_one_sessions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    title VARCHAR(300) NOT NULL,
    mentor_name VARCHAR(200),
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    meeting_url VARCHAR(500),
    status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS backend_additions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    course_id UUID REFERENCES courses(id),
    student_id UUID REFERENCES students(id),
    student_name VARCHAR(200),
    student_phone VARCHAR(40),
    student_email VARCHAR(200),
    note VARCHAR(500),
    status VARCHAR(40) NOT NULL DEFAULT 'ADDED',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    provider VARCHAR(80) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'NOT_CONNECTED',
    config_json TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_website_pages_org ON website_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_coupons_org ON coupons(organization_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_org ON landing_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_app_banners_org ON app_banners(organization_id);
CREATE INDEX IF NOT EXISTS idx_free_materials_org ON free_materials(organization_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_org ON chat_threads(organization_id);
CREATE INDEX IF NOT EXISTS idx_backend_additions_org ON backend_additions(organization_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_org ON integration_connections(organization_id);
