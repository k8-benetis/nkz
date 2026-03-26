-- =============================================================================
-- Migration 061: TimescaleDB compression + indexes for telemetry_events
-- =============================================================================
-- Enables native compression on the hypertable for long-term storage efficiency.
-- NOTE: TimescaleDB does not support RLS + compression on the same hypertable.
-- RLS is disabled here; tenant isolation is enforced at the application layer
-- (telemetry-worker receives tenant from NGSILD-Tenant header).
-- =============================================================================

-- Ensure entity_id and entity_type columns exist (added in earlier hotfix)
ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS entity_type TEXT;

-- Index for device-centric time-series queries
CREATE INDEX IF NOT EXISTS idx_telemetry_events_device_time
    ON telemetry_events (device_id, observed_at DESC);

-- Index for entity-type queries (e.g., all AgriSensor events)
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type_time
    ON telemetry_events (entity_type, observed_at DESC);

-- Disable RLS (incompatible with TimescaleDB compression)
-- Tenant isolation enforced at application layer
ALTER TABLE telemetry_events DISABLE ROW LEVEL SECURITY;

-- Enable compression on the hypertable
-- PK is (tenant_id, observed_at, id) — all must be in segmentby or orderby
-- segment_by = tenant_id, device_id: tenant + device isolation for compression
-- order_by = observed_at DESC, id DESC: optimizes time-range queries
ALTER TABLE telemetry_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id,device_id',
    timescaledb.compress_orderby = 'observed_at DESC,id DESC'
);

-- Auto-compress chunks older than 7 days
SELECT add_compression_policy('telemetry_events', INTERVAL '7 days', if_not_exists => TRUE);

-- =============================================================================
-- End of migration 061
-- =============================================================================
