CREATE TABLE IF NOT EXISTS platform_roles (
    id UUID PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    capabilities_csv VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_roles_name ON platform_roles (lower(name));

CREATE TABLE IF NOT EXISTS platform_user_roles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
