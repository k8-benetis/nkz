-- =============================================================================
-- Migration 062: Index for timeseries-reader telemetry queries
-- =============================================================================
-- Predicates: tenant_id, device_id, observed_at range (POST /v2/query, align).
-- Complements idx_telemetry_events_tenant_time (no device_id).
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_telemetry_tenant_device_time
    ON telemetry_events (tenant_id, device_id, observed_at DESC);

COMMENT ON INDEX ix_telemetry_tenant_device_time IS
    'Supports telemetry_events scans filtered by tenant_id + device_id + time range (timeseries-reader v2).';
