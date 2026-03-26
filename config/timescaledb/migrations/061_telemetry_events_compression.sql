-- =============================================================================
-- Migration 061: TimescaleDB compression + indexes for telemetry_events
-- =============================================================================
-- Enables native compression on the hypertable for long-term storage efficiency.
-- Segments by device_id for optimal query patterns (device-centric queries).
-- Adds entity_id/entity_type columns if missing and device_id index.
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

-- Enable compression on the hypertable
-- segment_by = device_id: each device's data is compressed independently
-- order_by = observed_at DESC: optimizes time-range queries
ALTER TABLE telemetry_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'observed_at DESC'
);

-- Auto-compress chunks older than 7 days
SELECT add_compression_policy('telemetry_events', INTERVAL '7 days', if_not_exists => TRUE);

-- =============================================================================
-- End of migration 061
-- =============================================================================
