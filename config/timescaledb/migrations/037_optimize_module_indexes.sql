-- =============================================================================
-- Migration 037: Optimize Indexes for Module Tables
-- =============================================================================
-- Creates optimized indexes for common query patterns in module tables.
-- Improves performance for vegetation_jobs, vegetation_results, and future modules.

-- =============================================================================
-- VegetationHealth Module Indexes
-- =============================================================================

-- Composite index for tenant + status + date (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_vegetation_jobs_tenant_status_date 
    ON vegetation_jobs(tenant_id, status, requested_at DESC);

-- Composite index for tenant + parcel + date (results queries)
CREATE INDEX IF NOT EXISTS idx_vegetation_results_tenant_parcel_date 
    ON vegetation_results(tenant_id, parcel_id, acquisition_date DESC);

-- Index for job lookup by ID and tenant (security)
CREATE INDEX IF NOT EXISTS idx_vegetation_jobs_id_tenant 
    ON vegetation_jobs(id, tenant_id);

-- GIN index for JSONB metadata searches
CREATE INDEX IF NOT EXISTS idx_vegetation_jobs_parameters_gin 
    ON vegetation_jobs USING GIN (parameters);

CREATE INDEX IF NOT EXISTS idx_vegetation_results_indices_data_gin 
    ON vegetation_results USING GIN (indices_data);

-- Index for time range queries
CREATE INDEX IF NOT EXISTS idx_vegetation_jobs_time_range 
    ON vegetation_jobs(time_from, time_to) 
    WHERE time_from IS NOT NULL AND time_to IS NOT NULL;

-- =============================================================================
-- NDVI Legacy Module Indexes (if not already exist)
-- =============================================================================

-- Similar indexes for NDVI tables (if they don't exist)
DO $$
BEGIN
    -- Check if ndvi_jobs table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ndvi_jobs') THEN
        -- Composite index for tenant + status + date
        IF NOT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_ndvi_jobs_tenant_status_date') THEN
            CREATE INDEX idx_ndvi_jobs_tenant_status_date 
                ON ndvi_jobs(tenant_id, status, requested_at DESC);
        END IF;
        
        -- Index for job lookup
        IF NOT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_ndvi_jobs_id_tenant') THEN
            CREATE INDEX idx_ndvi_jobs_id_tenant 
                ON ndvi_jobs(id, tenant_id);
        END IF;
    END IF;
    
    -- Check if ndvi_results table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ndvi_results') THEN
        -- Composite index for tenant + parcel + date
        IF NOT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_ndvi_results_tenant_parcel_date') THEN
            CREATE INDEX idx_ndvi_results_tenant_parcel_date 
                ON ndvi_results(tenant_id, parcel_id, acquisition_date DESC);
        END IF;
    END IF;
END $$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON INDEX idx_vegetation_jobs_tenant_status_date IS 'Optimized for listing jobs by tenant, status, and date';
COMMENT ON INDEX idx_vegetation_results_tenant_parcel_date IS 'Optimized for listing results by tenant, parcel, and date';
COMMENT ON INDEX idx_vegetation_jobs_parameters_gin IS 'GIN index for JSONB parameter searches';
COMMENT ON INDEX idx_vegetation_results_indices_data_gin IS 'GIN index for JSONB indices_data searches';

