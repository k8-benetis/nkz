-- =============================================================================
-- Migration 004: Enable Row Level Security (RLS) for Multi-Tenancy
-- =============================================================================
-- This migration enables RLS on all tables with tenant_id to enforce data isolation
-- Execution: Run this AFTER confirming schema alignment with production

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- Verify PostGIS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        RAISE WARNING 'PostGIS extension could not be enabled. GeoServer functionality will be limited.';
    ELSE
        RAISE NOTICE 'PostGIS extension enabled successfully';
    END IF;
END $$;

-- =============================================================================
-- API Keys Table
-- =============================================================================
ALTER TABLE IF EXISTS api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's API keys
CREATE POLICY api_keys_tenant_isolation ON api_keys
    USING (tenant_id = current_setting('app.current_tenant', true));

-- Policy: Users can only modify their tenant's API keys
CREATE POLICY api_keys_tenant_modify ON api_keys
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- Audit Log Table
-- =============================================================================
ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's audit logs
CREATE POLICY audit_log_tenant_isolation ON audit_log
    USING (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- Farmers Table
-- =============================================================================
ALTER TABLE IF EXISTS farmers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's farmers
CREATE POLICY farmers_tenant_isolation ON farmers
    USING (tenant_id = current_setting('app.current_tenant', true));

-- Policy: Users can only modify their tenant's farmers
CREATE POLICY farmers_tenant_modify ON farmers
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Also handle old 'tenant' column for backward compatibility
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'farmers' AND column_name = 'tenant'
    ) THEN
        -- Drop old policy if exists, then recreate
        DROP POLICY IF EXISTS farmers_tenant_isolation ON farmers;
        
        CREATE POLICY farmers_tenant_isolation ON farmers
            USING (
                tenant_id = current_setting('app.current_tenant', true) OR
                tenant = current_setting('app.current_tenant', true)
            );
    END IF;
END $$;

-- =============================================================================
-- Users Table
-- =============================================================================
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's users
CREATE POLICY users_tenant_isolation ON users
    USING (tenant_id = current_setting('app.current_tenant', true));

-- Policy: Users can only modify their tenant's users
CREATE POLICY users_tenant_modify ON users
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- Devices Table
-- =============================================================================
ALTER TABLE IF EXISTS devices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's devices
CREATE POLICY devices_tenant_isolation ON devices
    USING (tenant_id = current_setting('app.current_tenant', true));

-- Policy: Users can only modify their tenant's devices
CREATE POLICY devices_tenant_modify ON devices
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- Telemetry Table (TimescaleDB hypertable)
-- =============================================================================
ALTER TABLE IF EXISTS telemetry ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's telemetry
CREATE POLICY telemetry_tenant_isolation ON telemetry
    USING (tenant_id = current_setting('app.current_tenant', true));

-- Policy: Users can only insert their tenant's telemetry
CREATE POLICY telemetry_tenant_insert ON telemetry
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- Commands Table
-- =============================================================================
ALTER TABLE IF EXISTS commands ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's commands
CREATE POLICY commands_tenant_isolation ON commands
    USING (tenant_id = current_setting('app.current_tenant', true));

-- Policy: Users can only modify their tenant's commands
CREATE POLICY commands_tenant_modify ON commands
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- Audit Logs Table (old schema compatibility)
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'audit_logs'
    ) THEN
        ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
        
        -- Drop old policy if exists, then recreate
        DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
        
        CREATE POLICY audit_logs_tenant_isolation ON audit_logs
            USING (
                tenant = current_setting('app.current_tenant', true) OR
                (tenant_id IS NOT NULL AND tenant_id = current_setting('app.current_tenant', true))
            );
    END IF;
END $$;

-- =============================================================================
-- Helper Function: Set Current Tenant
-- =============================================================================
CREATE OR REPLACE FUNCTION set_current_tenant(tenant TEXT)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant', tenant, false);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Helper Function: Get Current Tenant
-- =============================================================================
CREATE OR REPLACE FUNCTION get_current_tenant()
RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('app.current_tenant', true);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Grant Permissions
-- =============================================================================
GRANT EXECUTE ON FUNCTION set_current_tenant(TEXT) TO postgres;
GRANT EXECUTE ON FUNCTION get_current_tenant() TO postgres;
-- Grant to PUBLIC so all users can execute (required for RLS to work)
GRANT EXECUTE ON FUNCTION set_current_tenant(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_tenant() TO PUBLIC;

-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON FUNCTION set_current_tenant IS 'Sets the current tenant for RLS policies. Called automatically by application code.';
COMMENT ON FUNCTION get_current_tenant IS 'Returns the current tenant from session context.';

-- =============================================================================
-- Verification Query
-- =============================================================================
-- Run this to verify RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('api_keys', 'audit_log', 'farmers', 'users', 'devices', 'telemetry', 'commands');

