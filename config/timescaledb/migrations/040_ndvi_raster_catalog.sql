-- =============================================================================
-- NDVI Raster Catalog and Time Series Support
-- =============================================================================
-- This migration creates tables for tracking NDVI COGs (Cloud Optimized GeoTIFFs)
-- enabling time series visualization with date slider in the frontend.

-- Table to track all generated COG rasters
CREATE TABLE IF NOT EXISTS ndvi_raster_catalog (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    parcel_id TEXT NOT NULL,
    index_type TEXT NOT NULL CHECK (index_type IN ('ndvi', 'evi', 'savi', 'gndvi', 'ndre', 'rgb')),
    acquisition_date DATE NOT NULL,
    cog_url TEXT NOT NULL,
    thumbnail_url TEXT,
    cloud_cover FLOAT,
    -- Aggregate statistics for quick access
    mean_value FLOAT,
    min_value FLOAT,
    max_value FLOAT,
    stddev FLOAT,
    p10 FLOAT,  -- 10th percentile
    p90 FLOAT,  -- 90th percentile
    -- Metadata
    pixel_count INTEGER,
    valid_pixel_count INTEGER,
    file_size_bytes BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    -- Ensure unique entries per parcel/index/date
    CONSTRAINT unique_raster_entry UNIQUE(tenant_id, parcel_id, index_type, acquisition_date)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_raster_catalog_parcel 
    ON ndvi_raster_catalog(parcel_id, index_type, acquisition_date DESC);
    
CREATE INDEX IF NOT EXISTS idx_raster_catalog_tenant 
    ON ndvi_raster_catalog(tenant_id, parcel_id);

CREATE INDEX IF NOT EXISTS idx_raster_catalog_date_range 
    ON ndvi_raster_catalog(parcel_id, acquisition_date);

-- Enable Row Level Security
ALTER TABLE ndvi_raster_catalog ENABLE ROW LEVEL SECURITY;

-- RLS policy for tenant isolation
CREATE POLICY tenant_isolation_raster_catalog ON ndvi_raster_catalog
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true));

-- Function to get available dates for a parcel
CREATE OR REPLACE FUNCTION get_available_ndvi_dates(
    p_tenant_id TEXT,
    p_parcel_id TEXT,
    p_index_type TEXT DEFAULT 'ndvi'
) RETURNS TABLE (
    acquisition_date DATE,
    mean_value FLOAT,
    cloud_cover FLOAT,
    cog_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        nrc.acquisition_date,
        nrc.mean_value,
        nrc.cloud_cover,
        nrc.cog_url
    FROM ndvi_raster_catalog nrc
    WHERE nrc.tenant_id = p_tenant_id
      AND nrc.parcel_id = p_parcel_id
      AND nrc.index_type = p_index_type
    ORDER BY nrc.acquisition_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get time series data for Grafana
CREATE OR REPLACE FUNCTION get_ndvi_time_series(
    p_parcel_id TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_index_type TEXT DEFAULT 'ndvi'
) RETURNS TABLE (
    time TIMESTAMP,
    value FLOAT,
    cloud_cover FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        nrc.acquisition_date::TIMESTAMP as time,
        nrc.mean_value as value,
        nrc.cloud_cover
    FROM ndvi_raster_catalog nrc
    WHERE nrc.parcel_id = p_parcel_id
      AND nrc.index_type = p_index_type
      AND nrc.acquisition_date BETWEEN p_start_date AND p_end_date
    ORDER BY nrc.acquisition_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment for documentation
COMMENT ON TABLE ndvi_raster_catalog IS 'Catalog of NDVI COG rasters for time series visualization. Each row represents one index calculation for a parcel on a specific date.';
