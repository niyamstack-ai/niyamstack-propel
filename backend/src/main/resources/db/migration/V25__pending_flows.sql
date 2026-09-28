-- Durable pending auth/purchase flows (survive restart / multi-instance)

CREATE TABLE IF NOT EXISTS pending_flows (
    id UUID PRIMARY KEY,
    flow_key VARCHAR(160) NOT NULL,
    purpose VARCHAR(40) NOT NULL,
    payload_json TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_flows_key ON pending_flows (flow_key);
