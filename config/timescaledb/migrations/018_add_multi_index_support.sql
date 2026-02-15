-- =============================================================================
-- Migration 018: Add multi-index support to ndvi_results
-- =============================================================================
-- Adds indices_data JSONB column to store all vegetation indices (NDVI, EVI, SAVI, GNDVI, NDRE)
-- while maintaining backward compatibility with existing ndvi_mean, ndvi_min, etc. columns
-- =============================================================================

DO $$
BEGIN
    -- Add indices_data JSONB column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ndvi_results' 
        AND column_name = 'indices_data'
    ) THEN
        ALTER TABLE ndvi_results 
        ADD COLUMN indices_data JSONB DEFAULT '{}'::jsonb;
        
        -- Create index for JSONB queries
        CREATE INDEX IF NOT EXISTS idx_ndvi_results_indices_data 
        ON ndvi_results USING GIN (indices_data);
        
        RAISE NOTICE 'Added indices_data JSONB column to ndvi_results';
    ELSE
        RAISE NOTICE 'indices_data column already exists, skipping';
    END IF;
    
    -- Add comment explaining the structure
    COMMENT ON COLUMN ndvi_results.indices_data IS 
    'JSONB structure: {"ndvi": {"mean": 0.7, "min": 0.3, "max": 0.9, "stddev": 0.1}, "evi": {...}, "savi": {...}, "gndvi": {...}, "ndre": {...}, "cloud_cover_real": 15.5}';
END $$;

