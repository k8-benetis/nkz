-- =============================================================================
-- Migration 014: Fix ndvi_jobs.id to have DEFAULT gen_random_uuid()
-- =============================================================================
-- The ndvi_jobs table was created without a DEFAULT for the id column.
-- This migration adds the DEFAULT so UUIDs are auto-generated on INSERT.
-- =============================================================================

-- Add DEFAULT to ndvi_jobs.id if it doesn't have one
DO $$
BEGIN
    -- Check if DEFAULT exists, if not, add it
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ndvi_jobs' 
        AND column_name = 'id' 
        AND column_default IS NOT NULL
    ) THEN
        ALTER TABLE ndvi_jobs 
        ALTER COLUMN id SET DEFAULT gen_random_uuid();
        
        RAISE NOTICE 'Added DEFAULT gen_random_uuid() to ndvi_jobs.id';
    ELSE
        RAISE NOTICE 'ndvi_jobs.id already has a DEFAULT, skipping';
    END IF;
    
    -- Also fix ndvi_results.id for consistency
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ndvi_results') THEN
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'ndvi_results' 
            AND column_name = 'id' 
            AND column_default IS NOT NULL
        ) THEN
            ALTER TABLE ndvi_results 
            ALTER COLUMN id SET DEFAULT gen_random_uuid();
            
            RAISE NOTICE 'Added DEFAULT gen_random_uuid() to ndvi_results.id';
        END IF;
    END IF;
END $$;
