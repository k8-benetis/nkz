-- =============================================================================
-- Migration 013: Update NDVI RLS policies to allow 'platform' tenant
-- =============================================================================
-- The RLS policies currently allow 'platform_admin' but we're using 'platform'
-- as the tenant for PlatformAdmin users. This migration updates the policies
-- to allow both 'platform' and 'platform_admin' for backward compatibility.
-- =============================================================================

DO $$
DECLARE
    admin_tenant CONSTANT TEXT := 'platform_admin';
    platform_tenant CONSTANT TEXT := 'platform';
BEGIN
    -- Update ndvi_jobs policy
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ndvi_jobs') THEN
        EXECUTE 'DROP POLICY IF EXISTS ndvi_jobs_policy ON ndvi_jobs';
        EXECUTE format(
            'CREATE POLICY ndvi_jobs_policy ON ndvi_jobs USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
                OR current_setting(''app.current_tenant'', true) = %L
            ) WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant, platform_tenant, admin_tenant, platform_tenant
        );
        RAISE NOTICE 'Updated ndvi_jobs_policy to allow platform and platform_admin tenants';
    END IF;

    -- Update ndvi_results policy
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ndvi_results') THEN
        EXECUTE 'DROP POLICY IF EXISTS ndvi_results_policy ON ndvi_results';
        EXECUTE format(
            'CREATE POLICY ndvi_results_policy ON ndvi_results USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
                OR current_setting(''app.current_tenant'', true) = %L
            ) WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant, platform_tenant, admin_tenant, platform_tenant
        );
        RAISE NOTICE 'Updated ndvi_results_policy to allow platform and platform_admin tenants';
    END IF;
END $$;
