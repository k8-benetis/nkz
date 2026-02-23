-- =============================================================================
-- Migration 052: Risk Webhook Registrations
-- =============================================================================
-- Allows tenants to register external URLs (e.g., N8N, custom APIs) to receive
-- push notifications when risk events are evaluated.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_risk_webhooks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    secret      TEXT,                                  -- HMAC-SHA256 signing secret (optional)
    events      TEXT[] DEFAULT ARRAY['risk_evaluation'],
    min_severity TEXT DEFAULT 'medium',               -- minimum severity to trigger: low/medium/high/critical
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Row-Level Security: each tenant sees only their own webhooks
ALTER TABLE tenant_risk_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhooks_tenant_isolation ON tenant_risk_webhooks
    USING (tenant_id = current_setting('app.current_tenant', true));

-- Index for fast lookup by tenant
CREATE INDEX IF NOT EXISTS idx_tenant_risk_webhooks_tenant
    ON tenant_risk_webhooks (tenant_id)
    WHERE is_active = true;

-- Grant access to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_risk_webhooks TO nekazari;
