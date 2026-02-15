-- =============================================================================
-- Migration 020: Ensure set_current_tenant and get_current_tenant functions exist
-- =============================================================================
-- This migration ensures the RLS helper functions exist with proper permissions
-- It is idempotent and safe to run multiple times
-- 
-- DEPENDENCIES:
--   - None (standalone migration, but 004_enable_rls.sql may create these first)
-- 
-- IMPORTANCE: CRITICAL
--   - Required by all services that interact with tenant-isolated data
--   - Without this function, activation code generation, tenant creation, and
--     all RLS-aware operations will fail with "function does not exist" errors
-- =============================================================================

-- =============================================================================
-- Helper Function: Set Current Tenant
-- =============================================================================
-- This function sets the current tenant context for Row-Level Security policies
-- It uses PostgreSQL's session variables (set_config) to store tenant context
CREATE OR REPLACE FUNCTION set_current_tenant(tenant TEXT)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant', tenant, true);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Helper Function: Get Current Tenant
-- =============================================================================
-- This function retrieves the current tenant context from session variables
CREATE OR REPLACE FUNCTION get_current_tenant()
RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('app.current_tenant', true);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Grant Permissions to all users (required for RLS to work)
-- =============================================================================
-- PUBLIC permissions are critical - all database users (including application
-- connections) must be able to call these functions for RLS to work correctly
GRANT EXECUTE ON FUNCTION set_current_tenant(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_tenant() TO PUBLIC;
GRANT EXECUTE ON FUNCTION set_current_tenant(TEXT) TO postgres;
GRANT EXECUTE ON FUNCTION get_current_tenant() TO postgres;

-- Also grant to timescale user if it exists (for telemetry/weather data access)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'timescale') THEN
        GRANT EXECUTE ON FUNCTION set_current_tenant(TEXT) TO timescale;
        GRANT EXECUTE ON FUNCTION get_current_tenant() TO timescale;
        RAISE NOTICE 'Granted execute permissions to timescale user';
    END IF;
END $$;

-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON FUNCTION set_current_tenant IS 'Sets the current tenant for RLS policies. Called automatically by application code before accessing tenant-isolated data.';
COMMENT ON FUNCTION get_current_tenant IS 'Returns the current tenant from session context. Used by RLS policies to filter data by tenant.';

-- =============================================================================
-- Verification and Error Handling
-- =============================================================================
DO $$
DECLARE
    func_exists BOOLEAN;
    func_signature TEXT;
BEGIN
    -- Verify set_current_tenant function exists and has correct signature
    SELECT EXISTS (
        SELECT 1 
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'set_current_tenant'
          AND n.nspname = 'public'
          AND pg_get_function_arguments(p.oid) = 'tenant text'
    ) INTO func_exists;
    
    IF func_exists THEN
        RAISE NOTICE 'Function set_current_tenant verified successfully (signature: TEXT)';
    ELSE
        -- Try to get current signature for debugging
        SELECT pg_get_function_arguments(p.oid) INTO func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'set_current_tenant'
          AND n.nspname = 'public'
        LIMIT 1;
        
        IF func_signature IS NOT NULL THEN
            RAISE EXCEPTION 'Function set_current_tenant exists but has wrong signature: %. Expected: tenant text', func_signature;
        ELSE
            RAISE EXCEPTION 'Failed to verify set_current_tenant function - function does not exist or is in wrong schema';
        END IF;
    END IF;
    
    -- Verify get_current_tenant function exists
    SELECT EXISTS (
        SELECT 1 
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'get_current_tenant'
          AND n.nspname = 'public'
    ) INTO func_exists;
    
    IF func_exists THEN
        RAISE NOTICE 'Function get_current_tenant verified successfully';
    ELSE
        RAISE EXCEPTION 'Failed to verify get_current_tenant function';
    END IF;
    
    -- Verify PUBLIC execute permissions (check proacl directly on pg_proc)
    -- Note: proacl can be NULL (default PUBLIC) or contain permissions
    DECLARE
        has_public_perms BOOLEAN;
    BEGIN
        SELECT (
            CASE 
                WHEN p.proacl IS NULL THEN true  -- NULL means default PUBLIC permissions
                WHEN array_to_string(p.proacl, ',') LIKE '%=X/%' OR array_to_string(p.proacl, ',') LIKE '%=X' THEN true
                ELSE false
            END
        ) INTO has_public_perms
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'set_current_tenant'
          AND n.nspname = 'public'
        LIMIT 1;
        
        IF has_public_perms THEN
            RAISE NOTICE 'Function set_current_tenant has PUBLIC execute permissions';
        ELSE
            RAISE WARNING 'Function set_current_tenant may not have PUBLIC execute permissions - RLS may not work correctly';
        END IF;
    END;
END $$;
