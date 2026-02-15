-- =============================================================================
-- Migration 006: NDVI Jobs & Results Tables with RLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS ndvi_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    parcel_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    requested_by TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    time_from TIMESTAMPTZ,
    time_to TIMESTAMPTZ,
    resolution INTEGER,
    satellite TEXT,
    parameters JSONB DEFAULT '{}'::jsonb,
    geometry JSONB,
    area_hectares DOUBLE PRECISION,
    job_type TEXT DEFAULT 'parcel',
    ndvi_mean DOUBLE PRECISION,
    preview_url TEXT,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_ndvi_jobs_tenant ON ndvi_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ndvi_jobs_parcel ON ndvi_jobs(parcel_id);
CREATE INDEX IF NOT EXISTS idx_ndvi_jobs_status ON ndvi_jobs(status);

CREATE TABLE IF NOT EXISTS ndvi_results (
    id UUID PRIMARY KEY,
    job_id UUID REFERENCES ndvi_jobs(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    parcel_id TEXT NOT NULL,
    acquisition_date TIMESTAMPTZ NOT NULL,
    ndvi_mean DOUBLE PRECISION,
    ndvi_min DOUBLE PRECISION,
    ndvi_max DOUBLE PRECISION,
    ndvi_stddev DOUBLE PRECISION,
    cloud_cover DOUBLE PRECISION,
    raster_url TEXT,
    preview_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ndvi_results_tenant ON ndvi_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ndvi_results_parcel ON ndvi_results(parcel_id, acquisition_date DESC);
CREATE INDEX IF NOT EXISTS idx_ndvi_results_job ON ndvi_results(job_id);

-- Enable Row Level Security
ALTER TABLE ndvi_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ndvi_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY ndvi_jobs_policy ON ndvi_jobs
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY ndvi_results_policy ON ndvi_results
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

GRANT ALL PRIVILEGES ON TABLE ndvi_jobs TO postgres;
GRANT ALL PRIVILEGES ON TABLE ndvi_results TO postgres;

