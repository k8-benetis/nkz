-- =============================================================================
-- Migration 034: Add source_module to NDVI tables for module distinction
-- =============================================================================
-- Adds source_module column to ndvi_jobs and ndvi_results to distinguish
-- between NDVI legacy module and VegetationHealth module.
--
-- PURPOSE:
-- This migration allows the platform to track which module created each job
-- and result, enabling:
-- - Module-specific filtering
-- - Clean module uninstallation
-- - Data migration between modules
-- - Conflict prevention
--
-- DEFAULT VALUES:
-- - Existing records: source_module = 'ndvi' (legacy)
-- - New VegetationHealth records: source_module = 'vegetation-health'
-- - New NDVI legacy records: source_module = 'ndvi'
--
-- DEPENDENCIES:
-- - 006-create-ndvi-tables.sql (ndvi_jobs and ndvi_results must exist)
--
-- IDEMPOTENCY:
-- This migration is idempotent - it can be run multiple times safely.
-- =============================================================================

-- Add source_module to ndvi_jobs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ndvi_jobs' 
        AND column_name = 'source_module'
    ) THEN
        ALTER TABLE ndvi_jobs 
        ADD COLUMN source_module TEXT DEFAULT 'ndvi' NOT NULL;
        
        -- Create index for faster queries by source module
        CREATE INDEX IF NOT EXISTS idx_ndvi_jobs_source_module 
        ON ndvi_jobs(tenant_id, source_module);
        
        -- Update existing records to have 'ndvi' as source (should already be set by DEFAULT)
        UPDATE ndvi_jobs 
        SET source_module = 'ndvi' 
        WHERE source_module IS NULL;
        
        -- Add comment
        COMMENT ON COLUMN ndvi_jobs.source_module IS 
        'Module that created this job: "ndvi" (legacy), "vegetation-health" (new)';
        
        RAISE NOTICE 'Added source_module column to ndvi_jobs';
    ELSE
        RAISE NOTICE 'source_module column already exists in ndvi_jobs, skipping';
    END IF;
END $$;

-- Add source_module to ndvi_results
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ndvi_results' 
        AND column_name = 'source_module'
    ) THEN
        ALTER TABLE ndvi_results 
        ADD COLUMN source_module TEXT DEFAULT 'ndvi' NOT NULL;
        
        -- Create index for faster queries by source module
        CREATE INDEX IF NOT EXISTS idx_ndvi_results_source_module 
        ON ndvi_results(tenant_id, source_module);
        
        -- Update existing records to have 'ndvi' as source
        UPDATE ndvi_results 
        SET source_module = 'ndvi' 
        WHERE source_module IS NULL;
        
        -- Add comment
        COMMENT ON COLUMN ndvi_results.source_module IS 
        'Module that created this result: "ndvi" (legacy), "vegetation-health" (new)';
        
        RAISE NOTICE 'Added source_module column to ndvi_results';
    ELSE
        RAISE NOTICE 'source_module column already exists in ndvi_results, skipping';
    END IF;
END $$;

-- =============================================================================
-- Verification queries (for manual verification after migration)
-- =============================================================================
-- To verify this migration ran successfully, you can run:
--
-- -- Check columns exist
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name IN ('ndvi_jobs', 'ndvi_results') 
-- AND column_name = 'source_module';
--
-- -- Check indexes exist
-- SELECT indexname, tablename 
-- FROM pg_indexes 
-- WHERE indexname LIKE '%source_module%';
--
-- -- Check distribution of source modules
-- SELECT source_module, COUNT(*) 
-- FROM ndvi_jobs 
-- GROUP BY source_module;
--
-- SELECT source_module, COUNT(*) 
-- FROM ndvi_results 
-- GROUP BY source_module;
--
-- =============================================================================
-- End of migration 034
-- =============================================================================

