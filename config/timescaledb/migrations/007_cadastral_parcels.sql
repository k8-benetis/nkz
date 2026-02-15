-- =============================================================================
-- Migration 007: Cadastral Parcels Management
-- =============================================================================
-- Core table for tenant-selected agricultural parcels from cadastral data
-- Required for NDVI processing, analytics, and GeoServer integration

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =============================================================================
-- 1. Cadastral Parcels Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS cadastral_parcels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    
    -- Cadastral identification
    cadastral_reference TEXT NOT NULL, -- Format: 48037A02100034 (7digits+2letters+4digits)
    municipality TEXT NOT NULL,
    province TEXT NOT NULL,
    autonomous_community TEXT, -- Comunidad autónoma
    
    -- Geometry
    geometry GEOMETRY(Polygon, 4326) NOT NULL, -- WGS84 polygon
    area_hectares DOUBLE PRECISION NOT NULL, -- Calculated from geometry
    centroid GEOMETRY(Point, 4326), -- For quick searches
    
    -- Agricultural information
    land_use TEXT, -- Cadastral land use code
    crop_type TEXT, -- 'Olive', 'Vineyard', 'Citrus', 'Cereal', etc.
    crop_variety TEXT,
    
    -- Owner and selection
    selected_by_user_id UUID, -- User who selected this parcel
    selected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    
    -- Processing flags
    ndvi_enabled BOOLEAN DEFAULT false, -- Should this parcel have NDVI processing?
    analytics_enabled BOOLEAN DEFAULT false, -- Enable advanced analytics?
    last_ndvi_date DATE, -- Last NDVI calculation date
    last_ndvi_processing_date TIMESTAMPTZ,
    
    -- Metadata
    cadastral_data JSONB DEFAULT '{}', -- Raw data from Catastro API
    notes TEXT,
    tags TEXT[],
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_parcels_tenant_id ON cadastral_parcels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_parcels_cadastral_ref ON cadastral_parcels(cadastral_reference);
CREATE INDEX IF NOT EXISTS idx_parcels_geometry ON cadastral_parcels USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_parcels_centroid ON cadastral_parcels USING GIST(centroid);
CREATE INDEX IF NOT EXISTS idx_parcels_tenant_active ON cadastral_parcels(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_parcels_ndvi_enabled ON cadastral_parcels(tenant_id, ndvi_enabled) WHERE ndvi_enabled = true;
CREATE INDEX IF NOT EXISTS idx_parcels_crop_type ON cadastral_parcels(crop_type);

-- Unique constraint: same cadastral reference can only be selected once per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_parcels_tenant_ref_unique 
    ON cadastral_parcels(tenant_id, cadastral_reference) 
    WHERE is_active = true;

-- Trigger to automatically calculate centroid and area
CREATE OR REPLACE FUNCTION calculate_parcel_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate area in hectares
    NEW.area_hectares := ROUND(ST_Area(NEW.geometry::geography) / 10000, 4);
    
    -- Calculate centroid
    NEW.centroid := ST_Centroid(NEW.geometry);
    
    -- Update timestamp
    NEW.updated_at := CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER parcel_metrics_trigger
    BEFORE INSERT OR UPDATE OF geometry
    ON cadastral_parcels
    FOR EACH ROW
    EXECUTE FUNCTION calculate_parcel_metrics();

-- RLS policies
ALTER TABLE cadastral_parcels ENABLE ROW LEVEL SECURITY;

CREATE POLICY parcels_tenant_isolation ON cadastral_parcels
    USING (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY parcels_tenant_insert ON cadastral_parcels
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY parcels_tenant_update ON cadastral_parcels
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY parcels_tenant_delete ON cadastral_parcels
    USING (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- 2. View for GeoServer (Multi-tenant safe)
-- =============================================================================

CREATE OR REPLACE VIEW cadastral_parcels_geoserver AS
SELECT 
    id,
    cadastral_reference,
    municipality,
    province,
    crop_type,
    area_hectares,
    geometry as geom,
    ST_Centroid(geometry) as centroid,
    is_active,
    ndvi_enabled,
    created_at
FROM cadastral_parcels
WHERE 
    tenant_id = current_setting('app.current_tenant', true)
    AND is_active = true;

GRANT SELECT ON cadastral_parcels_geoserver TO postgres;
COMMENT ON VIEW cadastral_parcels_geoserver IS 
'Cadastral parcels filtered by current tenant for GeoServer WMS/WFS layers';

-- =============================================================================
-- 3. Helper Functions
-- =============================================================================

-- Function: Get tenant parcels summary
CREATE OR REPLACE FUNCTION get_tenant_parcels_summary(p_tenant_id TEXT)
RETURNS TABLE (
    total_parcels BIGINT,
    total_area_ha DOUBLE PRECISION,
    ndvi_enabled_parcels BIGINT,
    ndvi_enabled_area_ha DOUBLE PRECISION,
    crop_types TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_parcels,
        COALESCE(SUM(area_hectares), 0) as total_area_ha,
        COUNT(*) FILTER (WHERE ndvi_enabled = true) as ndvi_enabled_parcels,
        COALESCE(SUM(area_hectares) FILTER (WHERE ndvi_enabled = true), 0) as ndvi_enabled_area_ha,
        ARRAY_AGG(DISTINCT crop_type) FILTER (WHERE crop_type IS NOT NULL) as crop_types
    FROM cadastral_parcels
    WHERE tenant_id = p_tenant_id AND is_active = true;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_tenant_parcels_summary IS 
'Get summary statistics for tenant parcels';

-- Function: Check if cadastral reference exists
CREATE OR REPLACE FUNCTION parcel_exists(p_tenant_id TEXT, p_cadastral_ref TEXT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS(
        SELECT 1 FROM cadastral_parcels 
        WHERE tenant_id = p_tenant_id 
        AND cadastral_reference = p_cadastral_ref
        AND is_active = true
    );
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- 4. Grants
-- =============================================================================

GRANT ALL ON cadastral_parcels TO postgres;
GRANT EXECUTE ON FUNCTION get_tenant_parcels_summary(TEXT) TO postgres;
GRANT EXECUTE ON FUNCTION parcel_exists(TEXT, TEXT) TO postgres;

-- =============================================================================
-- 5. Comments
-- =============================================================================

COMMENT ON TABLE cadastral_parcels IS 
'Cadastral agricultural parcels selected by tenants for processing and analytics.
Core entity linking cadastral data with NDVI, analytics, and GeoServer layers.';

COMMENT ON COLUMN cadastral_parcels.cadastral_reference IS 
'Cadastral reference (refcat) from Spanish Catastro service';

COMMENT ON COLUMN cadastral_parcels.geometry IS 
'PostGIS polygon geometry in WGS84 (EPSG:4326)';

COMMENT ON COLUMN cadastral_parcels.ndvi_enabled IS 
'Enable NDVI processing for this parcel (triggered by GeoServer/NDVI pipeline)';

COMMENT ON COLUMN cadastral_parcels.cadastral_data IS 
'Raw JSON data from Catastro API for future enrichment';

