-- =============================================================================
-- Migration 022: Add progress tracking to ndvi_jobs
-- =============================================================================
-- Adds progress_message column to track processing stages
-- Adds estimated_duration_seconds for time estimation

ALTER TABLE ndvi_jobs ADD COLUMN IF NOT EXISTS progress_message TEXT;
ALTER TABLE ndvi_jobs ADD COLUMN IF NOT EXISTS estimated_duration_seconds INTEGER;

COMMENT ON COLUMN ndvi_jobs.progress_message IS 'Current processing stage message (e.g., "Downloading satellite imagery", "Calculating indices")';
COMMENT ON COLUMN ndvi_jobs.estimated_duration_seconds IS 'Estimated duration in seconds based on similar jobs';

