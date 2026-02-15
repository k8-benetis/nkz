-- =============================================================================
-- Migration 005: GeoServer Integration - Parameterized Views
-- =============================================================================
-- Creates parameterized views for GeoServer multi-tenant access
-- GeoServer will use these views to access PostGIS data per tenant

-- Note: PostGIS extensions must be installed for this migration
-- If PostGIS is not available, skip geometry columns and use location JSON instead

-- =============================================================================
-- 2. Create parameterized views for GeoServer
-- =============================================================================

-- View: devices_by_tenant (using location JSON if PostGIS not available)
CREATE OR REPLACE VIEW devices_geoserver AS
SELECT 
    id,
    device_id,
    name,
    type,
    status,
    tenant_id,
    location as location_json,
    metadata,
    is_active,
    created_at,
    updated_at
FROM devices
WHERE 
    tenant_id = current_setting('app.current_tenant', true);

GRANT SELECT ON devices_geoserver TO postgres;

-- View: farmers_by_tenant  
CREATE OR REPLACE VIEW farmers_geoserver AS
SELECT 
    id,
    username,
    email,
    first_name,
    last_name,
    tenant_id,
    phone,
    is_active,
    is_verified,
    created_at,
    updated_at
FROM farmers
WHERE 
    tenant_id = current_setting('app.current_tenant', true);

GRANT SELECT ON farmers_geoserver TO postgres;

-- Note: PostGIS geometry conversion triggers skipped
-- Enable PostGIS extension in migration 006 to use geometry columns

-- =============================================================================
-- 4. GeoServer Data Store Configuration
-- =============================================================================

-- Create a helper view that GeoServer admin can reference
CREATE OR REPLACE VIEW gis_datastore_info AS
SELECT 
    'nekazari_gis' as datastore_name,
    'PostgreSQL PostGIS' as datastore_type,
    'TimescaleDB with PostGIS extension' as description,
    current_database() as database_name,
    'public' as schema_name;

GRANT SELECT ON gis_datastore_info TO postgres;

-- =============================================================================
-- 5. Verification queries
-- =============================================================================

-- Run these to verify setup:
-- SELECT PostGIS_version(); -- Check PostGIS version
-- SELECT COUNT(*) FROM devices_geoserver; -- Check devices view
-- SELECT COUNT(*) FROM farmers_geoserver; -- Check farmers view

-- =============================================================================
-- Documentation
-- =============================================================================

-- GeoServer views created with RLS support

