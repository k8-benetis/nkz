-- =============================================================================
-- Migration 021: Add missing columns to ndvi_jobs table
-- =============================================================================
-- Adds geometry, area_hectares, and job_type columns required by entity-manager
-- These columns were missing from the original 006-create-ndvi-tables.sql migration

ALTER TABLE ndvi_jobs ADD COLUMN IF NOT EXISTS geometry JSONB;
ALTER TABLE ndvi_jobs ADD COLUMN IF NOT EXISTS area_hectares DOUBLE PRECISION;
ALTER TABLE ndvi_jobs ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'parcel';

COMMENT ON COLUMN ndvi_jobs.geometry IS 'GeoJSON polygon geometry for manual job creation';
COMMENT ON COLUMN ndvi_jobs.area_hectares IS 'Parcel area in hectares';
COMMENT ON COLUMN ndvi_jobs.job_type IS 'Job type: parcel (from cadastral) or manual (from geometry)';
