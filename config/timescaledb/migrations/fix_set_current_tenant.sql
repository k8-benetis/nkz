-- =============================================================================
-- Fix: Create set_current_tenant and get_current_tenant functions
-- =============================================================================
-- This script creates the missing RLS helper functions
-- It is idempotent and can be run multiple times safely

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

-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON FUNCTION set_current_tenant IS 'Sets the current tenant for RLS policies. Called automatically by application code.';
COMMENT ON FUNCTION get_current_tenant IS 'Returns the current tenant from session context.';

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_current_tenant') THEN
        RAISE NOTICE 'Function set_current_tenant created successfully';
    ELSE
        RAISE EXCEPTION 'Failed to create set_current_tenant function';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_current_tenant') THEN
        RAISE NOTICE 'Function get_current_tenant created successfully';
    ELSE
        RAISE EXCEPTION 'Failed to create get_current_tenant function';
    END IF;
END $$;

