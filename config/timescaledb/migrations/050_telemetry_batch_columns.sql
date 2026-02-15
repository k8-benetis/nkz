-- =============================================================================
-- Migration: Add columns for batch telemetry processing
-- =============================================================================
-- Adds entity_id, value_numeric, value_text columns to telemetry table
-- for better separation of numeric vs text values and entity tracking
-- =============================================================================

-- Add entity_id column for NGSI-LD entity reference
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- Add value_numeric for numeric measurements (separate from original 'value')
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS value_numeric DOUBLE PRECISION;

-- Add value_text for text-based measurements
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS value_text TEXT;

-- Create index on entity_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_telemetry_entity_id 
ON telemetry(entity_id, time DESC);

-- Create index on tenant_id + time for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_time 
ON telemetry(tenant_id, time DESC);

-- Create index on device_id + metric for fast attribute lookups
CREATE INDEX IF NOT EXISTS idx_telemetry_device_metric 
ON telemetry(device_id, metric_name, time DESC);

-- Comment explaining the columns
COMMENT ON COLUMN telemetry.entity_id IS 'NGSI-LD entity URN (e.g., urn:ngsi-ld:AgriSensor:tenant:device)';
COMMENT ON COLUMN telemetry.value_numeric IS 'Numeric measurement value (temperature, humidity, etc.)';
COMMENT ON COLUMN telemetry.value_text IS 'Text measurement value (status, mode, etc.)';

