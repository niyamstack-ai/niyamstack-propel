CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY,
    setting_key VARCHAR(80) NOT NULL,
    setting_value VARCHAR(4000),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_settings_key ON platform_settings (setting_key);
