-- =============================================================================
-- Migration 007: Allow NDVI jobs with manual geometry
-- =============================================================================

ALTER TABLE ndvi_jobs
    ALTER COLUMN parcel_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS geometry JSONB,
    ADD COLUMN IF NOT EXISTS area_hectares DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'parcel';

ALTER TABLE ndvi_results
    ALTER COLUMN parcel_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS geometry JSONB,
    ADD COLUMN IF NOT EXISTS area_hectares DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_ndvi_jobs_job_type ON ndvi_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_ndvi_jobs_created ON ndvi_jobs(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_ndvi_results_date ON ndvi_results(acquisition_date DESC);

