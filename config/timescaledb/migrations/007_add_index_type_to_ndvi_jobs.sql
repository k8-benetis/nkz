-- =============================================================================
-- Migration 007: Add index_type to ndvi_jobs table
-- =============================================================================
-- Adds support for different vegetation indices (NDVI, EVI, SAVI, GNDVI, NDRE)
-- Defaults to 'ndvi' for backward compatibility

-- Add index_type column to ndvi_jobs
ALTER TABLE ndvi_jobs 
    ADD COLUMN IF NOT EXISTS index_type TEXT DEFAULT 'ndvi' NOT NULL;

-- Add index for faster queries by index type
CREATE INDEX IF NOT EXISTS idx_ndvi_jobs_index_type ON ndvi_jobs(index_type);

-- Add comment explaining the column
COMMENT ON COLUMN ndvi_jobs.index_type IS 'Type of vegetation index: ndvi (default), evi, savi, gndvi, ndre';

-- Update existing records to have 'ndvi' as default (should already be set by DEFAULT)
UPDATE ndvi_jobs SET index_type = 'ndvi' WHERE index_type IS NULL;

