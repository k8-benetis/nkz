-- =============================================================================
-- Migration 011: Weather Module - Agroclimatic Intelligence
-- =============================================================================
-- Refactors weather_observations to support multiple sources (Open-Meteo, AEMET, SENSOR_REAL)
-- Adds critical metrics for predictive models (solar radiation, ET₀, soil moisture, GDD)
-- Creates weather_alerts table for AEMET official alerts
-- =============================================================================

-- =============================================================================
-- 1. Create ENUMs for weather source and data type
-- =============================================================================

DO $$
BEGIN
    -- Create weather_source enum if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'weather_source') THEN
        CREATE TYPE weather_source AS ENUM ('OPEN-METEO', 'AEMET', 'SENSOR_REAL');
    END IF;
    
    -- Create weather_data_type enum if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'weather_data_type') THEN
        CREATE TYPE weather_data_type AS ENUM ('FORECAST', 'HISTORY');
    END IF;
END $$;

-- =============================================================================
-- 2. Add new columns to weather_observations for multi-source support
-- =============================================================================

-- Add source and data_type columns
ALTER TABLE weather_observations
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'AEMET',
    ADD COLUMN IF NOT EXISTS data_type TEXT DEFAULT 'HISTORY';

-- Add critical metrics columns for predictive models
ALTER TABLE weather_observations
    ADD COLUMN IF NOT EXISTS temp_avg DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS temp_min DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS temp_max DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS humidity_avg DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS precip_mm DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS solar_rad_w_m2 DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS solar_rad_ghi_w_m2 DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS solar_rad_dni_w_m2 DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS eto_mm DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS soil_moisture_0_10cm DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS soil_moisture_10_40cm DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS wind_speed_ms DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS wind_direction_deg DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pressure_hpa DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS gdd_accumulated DOUBLE PRECISION;

-- Add index for source and data_type queries
CREATE INDEX IF NOT EXISTS idx_weather_observations_source_type
    ON weather_observations (source, data_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_weather_observations_source_time
    ON weather_observations (source, observed_at DESC);

-- =============================================================================
-- 3. Migrate existing data (if any) from JSONB to structured columns
-- =============================================================================

DO $$
DECLARE
    row_count INTEGER;
BEGIN
    -- Count rows with data in metrics JSONB
    SELECT COUNT(*) INTO row_count
    FROM weather_observations
    WHERE source = 'AEMET' 
      AND (temp_avg IS NULL OR metrics IS NOT NULL);
    
    IF row_count > 0 THEN
        -- Migrate existing AEMET data from JSONB to structured columns
        UPDATE weather_observations
        SET 
            temp_avg = CASE 
                WHEN (metrics->>'temperatura')::TEXT IS NOT NULL 
                THEN (metrics->>'temperatura')::DOUBLE PRECISION
                WHEN (metrics->>'ta')::TEXT IS NOT NULL 
                THEN (metrics->>'ta')::DOUBLE PRECISION
                ELSE temp_avg
            END,
            humidity_avg = CASE 
                WHEN (metrics->>'humedad')::TEXT IS NOT NULL 
                THEN (metrics->>'humedad')::DOUBLE PRECISION
                WHEN (metrics->>'hr')::TEXT IS NOT NULL 
                THEN (metrics->>'hr')::DOUBLE PRECISION
                ELSE humidity_avg
            END,
            precip_mm = CASE 
                WHEN (metrics->>'precipitacion')::TEXT IS NOT NULL 
                THEN (metrics->>'precipitacion')::DOUBLE PRECISION
                WHEN (metrics->>'prec')::TEXT IS NOT NULL 
                THEN (metrics->>'prec')::DOUBLE PRECISION
                ELSE precip_mm
            END,
            pressure_hpa = CASE 
                WHEN (metrics->>'presion')::TEXT IS NOT NULL 
                THEN (metrics->>'presion')::DOUBLE PRECISION
                WHEN (metrics->>'pres')::TEXT IS NOT NULL 
                THEN (metrics->>'pres')::DOUBLE PRECISION
                ELSE pressure_hpa
            END,
            wind_speed_ms = CASE 
                WHEN (metrics->'viento'->>'velocidad')::TEXT IS NOT NULL 
                THEN (metrics->'viento'->>'velocidad')::DOUBLE PRECISION / 3.6  -- Convert km/h to m/s
                WHEN (metrics->>'vv')::TEXT IS NOT NULL 
                THEN (metrics->>'vv')::DOUBLE PRECISION / 3.6
                ELSE wind_speed_ms
            END,
            source = 'AEMET',
            data_type = 'HISTORY'
        WHERE source = 'AEMET' 
          AND (temp_avg IS NULL OR metrics IS NOT NULL);
        
        RAISE NOTICE 'Migrated % rows from JSONB to structured columns', row_count;
    END IF;
END $$;

-- =============================================================================
-- 4. Create weather_alerts table for AEMET official alerts
-- =============================================================================

CREATE TABLE IF NOT EXISTS weather_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    municipality_code TEXT NOT NULL REFERENCES catalog_municipalities(ine_code) ON DELETE RESTRICT,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('YELLOW', 'ORANGE', 'RED')),
    alert_category TEXT NOT NULL, -- 'WIND', 'RAIN', 'SNOW', 'FROST', 'HEAT', 'COLD', etc.
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ NOT NULL,
    description TEXT,
    aemet_alert_id TEXT,
    aemet_zone_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for weather_alerts
CREATE INDEX IF NOT EXISTS idx_weather_alerts_tenant_time
    ON weather_alerts (tenant_id, effective_from DESC, effective_to DESC);

CREATE INDEX IF NOT EXISTS idx_weather_alerts_municipality
    ON weather_alerts (municipality_code, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_weather_alerts_type_category
    ON weather_alerts (alert_type, alert_category, effective_from DESC);

-- Index for active alerts (without WHERE clause as CURRENT_TIMESTAMP is not IMMUTABLE)
-- PostgreSQL will still use this index efficiently for queries filtering by effective_to
CREATE INDEX IF NOT EXISTS idx_weather_alerts_active
    ON weather_alerts (tenant_id, effective_from DESC, effective_to DESC);

-- Unique constraint to prevent duplicate alerts
CREATE UNIQUE INDEX IF NOT EXISTS idx_weather_alerts_unique
    ON weather_alerts (
        tenant_id,
        municipality_code,
        aemet_alert_id,
        effective_from
    )
    WHERE aemet_alert_id IS NOT NULL;

-- Update trigger for updated_at
DROP TRIGGER IF EXISTS update_weather_alerts_updated_at ON weather_alerts;
CREATE TRIGGER update_weather_alerts_updated_at
    BEFORE UPDATE ON weather_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 5. Row Level Security (RLS) for weather_alerts
-- =============================================================================

ALTER TABLE weather_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weather_alerts_tenant_isolation ON weather_alerts;
CREATE POLICY weather_alerts_tenant_isolation ON weather_alerts
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS weather_alerts_tenant_insert ON weather_alerts;
CREATE POLICY weather_alerts_tenant_insert ON weather_alerts
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS weather_alerts_tenant_update ON weather_alerts;
CREATE POLICY weather_alerts_tenant_update ON weather_alerts
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- 6. Add comments for documentation
-- =============================================================================

COMMENT ON COLUMN weather_observations.source IS 'Weather data source: OPEN-METEO (primary), AEMET (secondary), SENSOR_REAL (validation)';
COMMENT ON COLUMN weather_observations.data_type IS 'Data type: FORECAST (future predictions), HISTORY (past observations)';
COMMENT ON COLUMN weather_observations.solar_rad_w_m2 IS 'Global Horizontal Irradiance (GHI) in W/m² - Critical for solar panel energy models';
COMMENT ON COLUMN weather_observations.solar_rad_ghi_w_m2 IS 'Global Horizontal Irradiance (GHI) in W/m²';
COMMENT ON COLUMN weather_observations.solar_rad_dni_w_m2 IS 'Direct Normal Irradiance (DNI) in W/m²';
COMMENT ON COLUMN weather_observations.eto_mm IS 'Reference Evapotranspiration (ET₀) in mm - Critical for irrigation models';
COMMENT ON COLUMN weather_observations.soil_moisture_0_10cm IS 'Soil moisture at 0-10cm depth (%) - For sensor validation';
COMMENT ON COLUMN weather_observations.soil_moisture_10_40cm IS 'Soil moisture at 10-40cm depth (%) - For sensor validation';
COMMENT ON COLUMN weather_observations.gdd_accumulated IS 'Growing Degree Days (GDD) accumulated - Critical for pest and flowering prediction models';

COMMENT ON TABLE weather_alerts IS 'Official weather alerts from AEMET (yellow/orange/red) for tenant notification system';
COMMENT ON COLUMN weather_alerts.alert_type IS 'Alert severity: YELLOW (moderate), ORANGE (high), RED (extreme)';
COMMENT ON COLUMN weather_alerts.alert_category IS 'Alert category: WIND, RAIN, SNOW, FROST, HEAT, COLD, etc.';

-- =============================================================================
-- 7. Create view for latest weather observations by source (useful for Grafana)
-- =============================================================================

CREATE OR REPLACE VIEW weather_observations_latest AS
SELECT DISTINCT ON (tenant_id, municipality_code, source, data_type)
    tenant_id,
    municipality_code,
    source,
    data_type,
    observed_at,
    temp_avg,
    humidity_avg,
    precip_mm,
    solar_rad_w_m2,
    eto_mm,
    wind_speed_ms,
    pressure_hpa,
    gdd_accumulated,
    metrics,
    metadata
FROM weather_observations
ORDER BY tenant_id, municipality_code, source, data_type, observed_at DESC;

COMMENT ON VIEW weather_observations_latest IS 'Latest weather observation per tenant, municipality, source and data type';

-- =============================================================================
-- 8. Create function to calculate GDD (Growing Degree Days) if not exists
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_gdd(
    temp_max DOUBLE PRECISION,
    temp_min DOUBLE PRECISION,
    base_temp DOUBLE PRECISION DEFAULT 10.0
) RETURNS DOUBLE PRECISION AS $$
BEGIN
    -- GDD = max(0, (T_max + T_min) / 2 - T_base)
    -- If T_max or T_min is NULL, use temp_avg if available
    RETURN GREATEST(0, ((COALESCE(temp_max, 0) + COALESCE(temp_min, 0)) / 2.0) - base_temp);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_gdd IS 'Calculate Growing Degree Days (GDD) for pest and flowering prediction models';

-- =============================================================================
-- End of migration 011
-- =============================================================================

