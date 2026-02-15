-- =============================================================================
-- Migration: Processing Profiles for Telemetry Worker
-- Description: Add processing_profiles table for configurable IoT data governance
-- =============================================================================

-- Processing Profiles table
-- Defines how telemetry data should be filtered/throttled before persistence
CREATE TABLE IF NOT EXISTS processing_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Profile identification (lookup keys)
    device_type VARCHAR(100) NOT NULL,        -- 'Tractor', 'SensorHumedad', 'WeatherStation'
    device_id VARCHAR(255) DEFAULT NULL,      -- Specific device override (optional)
    tenant_id UUID DEFAULT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Processing configuration
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Metadata
    name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,               -- Higher priority = checked first
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient profile lookup
CREATE INDEX IF NOT EXISTS idx_processing_profiles_lookup 
ON processing_profiles(device_type, tenant_id, device_id, priority DESC)
WHERE is_active = true;

-- Index for tenant-based queries
CREATE INDEX IF NOT EXISTS idx_processing_profiles_tenant 
ON processing_profiles(tenant_id) WHERE tenant_id IS NOT NULL;

-- Last seen values cache for delta threshold checks
CREATE TABLE IF NOT EXISTS telemetry_last_values (
    device_id VARCHAR(255) NOT NULL,
    attribute_name VARCHAR(100) NOT NULL,
    last_value NUMERIC,
    last_saved_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (device_id, attribute_name)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_telemetry_last_values_device 
ON telemetry_last_values(device_id);

-- Insert default profiles for common device types
INSERT INTO processing_profiles (device_type, name, description, config) VALUES
(
    'AgriSensor',
    'Default Sensor Profile',
    'Standard throttling for agricultural sensors',
    '{
        "sampling_rate": {"mode": "throttle", "interval_seconds": 60},
        "delta_threshold": {"temperature": 0.5, "humidity": 2.0, "soil_moisture": 1.0},
        "ignore_attributes": ["debug", "raw"]
    }'::jsonb
),
(
    'WeatherStation',
    'Default Weather Profile', 
    'Weather stations - moderate throttling',
    '{
        "sampling_rate": {"mode": "throttle", "interval_seconds": 300},
        "delta_threshold": {"temperature": 0.2, "humidity": 1.0, "pressure": 0.5},
        "active_attributes": ["temperature", "humidity", "pressure", "wind_speed", "precipitation"]
    }'::jsonb
),
(
    'AgriculturalRobot',
    'Default Robot Profile',
    'Robots - frequent updates for real-time tracking',
    '{
        "sampling_rate": {"mode": "throttle", "interval_seconds": 5},
        "active_attributes": ["location", "battery_level", "status", "speed"],
        "delta_threshold": {"battery_level": 1.0}
    }'::jsonb
),
(
    'Tractor',
    'Default Tractor Profile',
    'ISOBUS tractors - moderate frequency',
    '{
        "sampling_rate": {"mode": "throttle", "interval_seconds": 10},
        "active_attributes": ["location", "speed", "fuel_level", "engine_rpm", "pto_status"],
        "delta_threshold": {"fuel_level": 0.5}
    }'::jsonb
)
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON processing_profiles TO nekazari;
GRANT SELECT, INSERT, UPDATE, DELETE ON telemetry_last_values TO nekazari;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE processing_profiles IS 'Configurable rules for IoT data filtering and throttling';
COMMENT ON COLUMN processing_profiles.config IS 'JSON config: sampling_rate, active_attributes, ignore_attributes, delta_threshold';
COMMENT ON TABLE telemetry_last_values IS 'Cache of last persisted values for delta threshold checks';
