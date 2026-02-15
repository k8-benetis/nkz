-- =============================================================================
-- Migration 023: NDVI time series storage (opt-in)
-- =============================================================================
-- Creates parcel_ndvi_history hypertable for time-series NDVI samples.
-- Idempotente: usa IF NOT EXISTS y create_hypertable con if_not_exists.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS parcel_ndvi_history (
    id uuid DEFAULT uuid_generate_v4(),
    job_id uuid NOT NULL,
    tenant_id text NOT NULL,
    parcel_id uuid NOT NULL,
    time timestamptz NOT NULL,
    ndvi_mean double precision,
    cloud_cover double precision,
    metadata jsonb DEFAULT '{}'::jsonb,
    source text DEFAULT 'cdse',
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_parcel_ndvi_history PRIMARY KEY (id, time)
);

COMMENT ON TABLE parcel_ndvi_history IS 'Time-series NDVI samples per parcel (opt-in time_series mode)';
COMMENT ON COLUMN parcel_ndvi_history.ndvi_mean IS 'Mean NDVI value for the acquisition window';
COMMENT ON COLUMN parcel_ndvi_history.cloud_cover IS 'Cloud cover percentage for the acquisition window';

SELECT create_hypertable('parcel_ndvi_history', 'time', if_not_exists => TRUE);

-- Unique index (includes partition key 'time')
CREATE UNIQUE INDEX IF NOT EXISTS uq_parcel_ndvi_history
    ON parcel_ndvi_history (job_id, time, parcel_id);

CREATE INDEX IF NOT EXISTS idx_parcel_ndvi_history_tenant_parcel_time
    ON parcel_ndvi_history (tenant_id, parcel_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_parcel_ndvi_history_time
    ON parcel_ndvi_history (time DESC);

CREATE OR REPLACE FUNCTION set_parcel_ndvi_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parcel_ndvi_history_updated_at ON parcel_ndvi_history;
CREATE TRIGGER trg_parcel_ndvi_history_updated_at
    BEFORE UPDATE ON parcel_ndvi_history
    FOR EACH ROW EXECUTE FUNCTION set_parcel_ndvi_history_updated_at();

-- =============================================================================
-- End of migration 023
-- =============================================================================

