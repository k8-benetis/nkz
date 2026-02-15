-- =============================================================================
-- Migration 006: NDVI Raster Storage Schema
-- =============================================================================
-- Storage for NDVI rasters from satellite imagery processing
-- Supports multi-tenant with RLS

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Note: postgis_raster may not be available in all images
-- If unavailable, raster_data column will use BYTEA instead
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'postgis_raster'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS postgis_raster;
        RAISE NOTICE 'PostGIS Raster extension enabled';
    ELSE
        RAISE WARNING 'PostGIS Raster extension not available - will use BYTEA for raster storage';
    END IF;
END $$;

-- =============================================================================
-- 1. NDVI Rasters Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS ndvi_rasters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    parcel_id UUID, -- References cadastral_parcels(id) if available
    
    -- Temporal information
    acquisition_date DATE NOT NULL,
    acquisition_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Spatial information
    bounds GEOMETRY(Polygon, 4326) NOT NULL,
    
    -- Raster data (PostGIS raster type if available, else BYTEA)
    raster_data BYTEA,  -- Changed from RASTER for compatibility
    
    -- NDVI statistics
    ndvi_min DOUBLE PRECISION,
    ndvi_max DOUBLE PRECISION,
    ndvi_mean DOUBLE PRECISION,
    ndvi_stddev DOUBLE PRECISION,
    ndvi_median DOUBLE PRECISION,
    
    -- Quality information
    cloud_cover_percentage DOUBLE PRECISION,
    data_quality_score DOUBLE PRECISION, -- 0-1, higher is better
    
    -- Source information
    source_satellite TEXT, -- 'Sentinel-2', 'Landsat-8', etc.
    source_platform TEXT, -- 'Sentinel Hub', 'Google Earth Engine', etc.
    processing_method TEXT,
    processing_version TEXT,
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}',
    
    -- Tracking
    created_by UUID,
    processing_time_seconds INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ndvi_tenant_date ON ndvi_rasters(tenant_id, acquisition_date DESC);
CREATE INDEX IF NOT EXISTS idx_ndvi_bounds ON ndvi_rasters USING GIST(bounds);
CREATE INDEX IF NOT EXISTS idx_ndvi_parcel ON ndvi_rasters(parcel_id) WHERE parcel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ndvi_satellite ON ndvi_rasters(source_satellite);
CREATE INDEX IF NOT EXISTS idx_ndvi_created ON ndvi_rasters(created_at DESC);

-- RLS policies
ALTER TABLE ndvi_rasters ENABLE ROW LEVEL SECURITY;

CREATE POLICY ndvi_tenant_isolation ON ndvi_rasters
    USING (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY ndvi_tenant_insert ON ndvi_rasters
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Comments
COMMENT ON TABLE ndvi_rasters IS 'NDVI rasters from satellite imagery processing';
COMMENT ON COLUMN ndvi_rasters.raster_data IS 'Raster data as GeoTIFF binary (BYTEA) storing NDVI values (-1 to 1)';
COMMENT ON COLUMN ndvi_rasters.bounds IS 'Bounding polygon in WGS84 (EPSG:4326)';
COMMENT ON COLUMN ndvi_rasters.cloud_cover_percentage IS 'Percentage of cloud cover in image (0-100)';
COMMENT ON COLUMN ndvi_rasters.data_quality_score IS 'Overall quality score (0-1)';

-- =============================================================================
-- 2. NDVI Time Series Table (Aggregated)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ndvi_time_series (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    parcel_id UUID,
    
    -- Temporal
    date DATE NOT NULL,
    year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
    month INTEGER GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)) STORED,
    
    -- Aggregated statistics
    ndvi_mean DOUBLE PRECISION NOT NULL,
    ndvi_min DOUBLE PRECISION,
    ndvi_max DOUBLE PRECISION,
    ndvi_stddev DOUBLE PRECISION,
    
    -- Additional metrics
    vegetation_percentage DOUBLE PRECISION, -- % area with NDVI > 0.5
    stress_indicators DOUBLE PRECISION, -- % area with NDVI < 0.2
    
    -- Metadata
    source_raster_id UUID REFERENCES ndvi_rasters(id),
    sample_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ndvi_ts_tenant_parcel_date ON ndvi_time_series(tenant_id, parcel_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ndvi_ts_year_month ON ndvi_time_series(year, month);

-- RLS
ALTER TABLE ndvi_time_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY ndvi_ts_tenant_isolation ON ndvi_time_series
    USING (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- 3. Helper Views for GeoServer
-- =============================================================================

-- View: Latest NDVI raster per tenant
CREATE OR REPLACE VIEW ndvi_current AS
SELECT 
    r.id,
    r.tenant_id,
    r.parcel_id,
    r.acquisition_date,
    r.bounds as geom,
    r.ndvi_min,
    r.ndvi_max,
    r.ndvi_mean,
    r.cloud_cover_percentage,
    r.source_satellite
FROM ndvi_rasters r
WHERE 
    r.tenant_id = current_setting('app.current_tenant', true)
    AND r.acquisition_date = (
        SELECT MAX(acquisition_date) 
        FROM ndvi_rasters 
        WHERE tenant_id = r.tenant_id
    );

GRANT SELECT ON ndvi_current TO postgres;

COMMENT ON VIEW ndvi_current IS 'Latest NDVI raster per tenant for GeoServer WMS';

-- =============================================================================
-- 4. Functions for NDVI Analysis
-- =============================================================================

-- Function: Get NDVI trend for a parcel
CREATE OR REPLACE FUNCTION get_ndvi_trend(
    p_parcel_id UUID,
    p_months INTEGER DEFAULT 12
)
RETURNS TABLE (
    date DATE,
    ndvi_mean DOUBLE PRECISION,
    trend TEXT,
    change_percentage DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ts.date,
        ts.ndvi_mean,
        CASE 
            WHEN ts.ndvi_mean > LAG(ts.ndvi_mean) OVER (ORDER BY ts.date) THEN 'increasing'
            WHEN ts.ndvi_mean < LAG(ts.ndvi_mean) OVER (ORDER BY ts.date) THEN 'decreasing'
            ELSE 'stable'
        END as trend,
        CASE 
            WHEN LAG(ts.ndvi_mean) OVER (ORDER BY ts.date) > 0 THEN
                ((ts.ndvi_mean - LAG(ts.ndvi_mean) OVER (ORDER BY ts.date)) / 
                 LAG(ts.ndvi_mean) OVER (ORDER BY ts.date)) * 100
            ELSE NULL
        END as change_percentage
    FROM ndvi_time_series ts
    WHERE 
        ts.parcel_id = p_parcel_id
        AND ts.date >= CURRENT_DATE - INTERVAL '1 month' * p_months
    ORDER BY ts.date DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Detect vegetation anomalies
CREATE OR REPLACE FUNCTION detect_vegetation_anomalies(
    p_parcel_id UUID,
    p_threshold_stddev DOUBLE PRECISION DEFAULT 2.0
)
RETURNS TABLE (
    date DATE,
    ndvi_value DOUBLE PRECISION,
    expected_mean DOUBLE PRECISION,
    anomaly_score DOUBLE PRECISION,
    severity TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            AVG(ndvi_mean) as long_term_mean,
            STDDEV(ndvi_mean) as long_term_stddev
        FROM ndvi_time_series
        WHERE parcel_id = p_parcel_id
            AND date >= CURRENT_DATE - INTERVAL '1 year'
    )
    SELECT 
        ts.date,
        ts.ndvi_mean,
        s.long_term_mean,
        ABS(ts.ndvi_mean - s.long_term_mean) / NULLIF(s.long_term_stddev, 0) as anomaly_score,
        CASE 
            WHEN ABS(ts.ndvi_mean - s.long_term_mean) / NULLIF(s.long_term_stddev, 0) > 3 THEN 'critical'
            WHEN ABS(ts.ndvi_mean - s.long_term_mean) / NULLIF(s.long_term_stddev, 0) > 2 THEN 'warning'
            ELSE 'normal'
        END as severity
    FROM ndvi_time_series ts
    CROSS JOIN stats s
    WHERE ts.parcel_id = p_parcel_id
        AND ts.date >= CURRENT_DATE - INTERVAL '6 months'
        AND ABS(ts.ndvi_mean - s.long_term_mean) / NULLIF(s.long_term_stddev, 0) > p_threshold_stddev
    ORDER BY ts.date DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_ndvi_trend IS 'Calculate NDVI trend over time for a parcel';
COMMENT ON FUNCTION detect_vegetation_anomalies IS 'Detect anomalies in vegetation health';

-- =============================================================================
-- 5. Grants
-- =============================================================================

GRANT ALL ON ndvi_rasters TO postgres;
GRANT ALL ON ndvi_time_series TO postgres;
GRANT EXECUTE ON FUNCTION get_ndvi_trend(UUID, INTEGER) TO postgres;
GRANT EXECUTE ON FUNCTION detect_vegetation_anomalies(UUID, DOUBLE PRECISION) TO postgres;

-- =============================================================================
-- Documentation
-- =============================================================================

COMMENT ON TABLE ndvi_rasters IS 
'NDVI rasters from satellite imagery. Primary storage for processed GeoTIFF rasters.
Uses BYTEA for raster storage with PostGIS geometries for spatial operations.';

COMMENT ON TABLE ndvi_time_series IS 
'Aggregated NDVI statistics over time. Used for trends and analytics.
Automatically populated from ndvi_rasters during processing.';

