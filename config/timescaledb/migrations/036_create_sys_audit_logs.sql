-- =============================================================================
-- Migration 036: Create System Audit Logs Table
-- =============================================================================
-- Creates sys_audit_logs table for structured audit logging of module actions,
-- user operations, and security events. Designed for GDPR compliance and
-- operational visibility.

-- Create sys_audit_logs table
CREATE TABLE IF NOT EXISTS sys_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    username TEXT,
    module_id TEXT,
    event_type TEXT NOT NULL, -- 'module_action', 'security_event', 'data_access', 'api_request'
    action TEXT NOT NULL, -- 'module.toggle', 'module.job.create', 'api.request', etc.
    resource_type TEXT,
    resource_id TEXT,
    success BOOLEAN DEFAULT true,
    error TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance (critical for queries)
CREATE INDEX IF NOT EXISTS idx_sys_audit_logs_tenant_id ON sys_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sys_audit_logs_module_id ON sys_audit_logs(module_id);
CREATE INDEX IF NOT EXISTS idx_sys_audit_logs_created_at ON sys_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_audit_logs_action ON sys_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_sys_audit_logs_event_type ON sys_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_sys_audit_logs_user_id ON sys_audit_logs(user_id);

-- Composite index for common queries (tenant + module + date)
CREATE INDEX IF NOT EXISTS idx_sys_audit_logs_tenant_module_date 
    ON sys_audit_logs(tenant_id, module_id, created_at DESC);

-- Composite index for tenant + date (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_sys_audit_logs_tenant_date 
    ON sys_audit_logs(tenant_id, created_at DESC);

-- GIN index for JSONB metadata searches
CREATE INDEX IF NOT EXISTS idx_sys_audit_logs_metadata_gin 
    ON sys_audit_logs USING GIN (metadata);

-- Enable Row Level Security (RLS) for multi-tenancy
ALTER TABLE sys_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
DROP POLICY IF EXISTS sys_audit_logs_policy ON sys_audit_logs;
CREATE POLICY sys_audit_logs_policy ON sys_audit_logs
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Grant permissions
GRANT SELECT, INSERT ON sys_audit_logs TO timescale;
GRANT USAGE ON SEQUENCE sys_audit_logs_id_seq TO timescale;

-- Add comment
COMMENT ON TABLE sys_audit_logs IS 'System audit logs for module actions, user operations, and security events. Used for compliance (GDPR) and operational visibility.';
COMMENT ON COLUMN sys_audit_logs.event_type IS 'Type of event: module_action, security_event, data_access, api_request';
COMMENT ON COLUMN sys_audit_logs.action IS 'Specific action performed: module.toggle, module.job.create, etc.';
COMMENT ON COLUMN sys_audit_logs.metadata IS 'Additional structured data in JSONB format';

