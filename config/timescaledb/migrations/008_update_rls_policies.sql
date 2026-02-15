-- =============================================================================
-- Migration 008: Update RLS policies with platform admin override
-- =============================================================================
-- Recreate tenant-based RLS policies to allow a dedicated platform admin
-- context (`set_current_tenant('platform_admin')`) to access multi-tenant data
-- when required for operations such as provisioning, diagnostics or support.
--
-- Each block checks that the target table exists before attempting to drop or
-- recreate policies, keeping the migration idempotent and safe to re-run.
-- =============================================================================

DO $$
DECLARE
    admin_tenant CONSTANT TEXT := 'platform_admin';
BEGIN
    -- api_keys
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'api_keys') THEN
        EXECUTE 'DROP POLICY IF EXISTS api_keys_tenant_isolation ON api_keys';
        EXECUTE format(
            'CREATE POLICY api_keys_tenant_isolation ON api_keys USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS api_keys_tenant_modify ON api_keys';
        EXECUTE format(
            'CREATE POLICY api_keys_tenant_modify ON api_keys USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            ) WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant, admin_tenant
        );
    END IF;

    -- audit_log
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_log') THEN
        EXECUTE 'DROP POLICY IF EXISTS audit_log_tenant_isolation ON audit_log';
        EXECUTE format(
            'CREATE POLICY audit_log_tenant_isolation ON audit_log USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );
    END IF;

    -- farmers
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'farmers') THEN
        EXECUTE 'DROP POLICY IF EXISTS farmers_tenant_isolation ON farmers';
        EXECUTE format(
            'CREATE POLICY farmers_tenant_isolation ON farmers USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS farmers_tenant_modify ON farmers';
        EXECUTE format(
            'CREATE POLICY farmers_tenant_modify ON farmers USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            ) WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant, admin_tenant
        );
    END IF;

    -- users
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        EXECUTE 'DROP POLICY IF EXISTS users_tenant_isolation ON users';
        EXECUTE format(
            'CREATE POLICY users_tenant_isolation ON users USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS users_tenant_modify ON users';
        EXECUTE format(
            'CREATE POLICY users_tenant_modify ON users USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            ) WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant, admin_tenant
        );
    END IF;

    -- devices
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'devices') THEN
        EXECUTE 'DROP POLICY IF EXISTS devices_tenant_isolation ON devices';
        EXECUTE format(
            'CREATE POLICY devices_tenant_isolation ON devices USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS devices_tenant_modify ON devices';
        EXECUTE format(
            'CREATE POLICY devices_tenant_modify ON devices USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            ) WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant, admin_tenant
        );
    END IF;

    -- telemetry
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telemetry') THEN
        EXECUTE 'DROP POLICY IF EXISTS telemetry_tenant_isolation ON telemetry';
        EXECUTE format(
            'CREATE POLICY telemetry_tenant_isolation ON telemetry USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS telemetry_tenant_insert ON telemetry';
        EXECUTE format(
            'CREATE POLICY telemetry_tenant_insert ON telemetry WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );
    END IF;

    -- commands
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'commands') THEN
        EXECUTE 'DROP POLICY IF EXISTS commands_tenant_isolation ON commands';
        EXECUTE format(
            'CREATE POLICY commands_tenant_isolation ON commands USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS commands_tenant_modify ON commands';
        EXECUTE format(
            'CREATE POLICY commands_tenant_modify ON commands USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            ) WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant, admin_tenant
        );
    END IF;

    -- ndvi_jobs
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
            )', admin_tenant, 'platform', admin_tenant, 'platform'
        );
    END IF;

    -- ndvi_results
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
            )', admin_tenant, 'platform', admin_tenant, 'platform'
        );
    END IF;

    -- ndvi_rasters
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ndvi_rasters') THEN
        EXECUTE 'DROP POLICY IF EXISTS ndvi_tenant_isolation ON ndvi_rasters';
        EXECUTE format(
            'CREATE POLICY ndvi_tenant_isolation ON ndvi_rasters USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS ndvi_tenant_insert ON ndvi_rasters';
        EXECUTE format(
            'CREATE POLICY ndvi_tenant_insert ON ndvi_rasters WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );
    END IF;

    -- ndvi_time_series
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ndvi_time_series') THEN
        EXECUTE 'DROP POLICY IF EXISTS ndvi_ts_tenant_isolation ON ndvi_time_series';
        EXECUTE format(
            'CREATE POLICY ndvi_ts_tenant_isolation ON ndvi_time_series USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );
    END IF;

    -- cadastral_parcels
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cadastral_parcels') THEN
        EXECUTE 'DROP POLICY IF EXISTS parcels_tenant_isolation ON cadastral_parcels';
        EXECUTE format(
            'CREATE POLICY parcels_tenant_isolation ON cadastral_parcels USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS parcels_tenant_insert ON cadastral_parcels';
        EXECUTE format(
            'CREATE POLICY parcels_tenant_insert ON cadastral_parcels WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS parcels_tenant_update ON cadastral_parcels';
        EXECUTE format(
            'CREATE POLICY parcels_tenant_update ON cadastral_parcels USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            ) WITH CHECK (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant, admin_tenant
        );

        EXECUTE 'DROP POLICY IF EXISTS parcels_tenant_delete ON cadastral_parcels';
        EXECUTE format(
            'CREATE POLICY parcels_tenant_delete ON cadastral_parcels USING (
                tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );
    END IF;

    -- optional legacy audit_logs table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        EXECUTE 'DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs';
        EXECUTE format(
            'CREATE POLICY audit_logs_tenant_isolation ON audit_logs USING (
                tenant = current_setting(''app.current_tenant'', true)
                OR tenant_id = current_setting(''app.current_tenant'', true)
                OR current_setting(''app.current_tenant'', true) = %L
            )', admin_tenant
        );
    END IF;
END $$;
