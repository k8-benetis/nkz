-- =============================================================================
-- Migration 012: Weather Module - Delta T and Agro Metrics
-- =============================================================================
-- Adds delta_t column for spraying conditions calculation
-- Adds support for water balance calculations
-- =============================================================================

-- =============================================================================
-- 1. Add delta_t column to weather_observations
-- =============================================================================

ALTER TABLE weather_observations
    ADD COLUMN IF NOT EXISTS delta_t DOUBLE PRECISION;

-- Add comment for documentation
COMMENT ON COLUMN weather_observations.delta_t IS 'Delta T (temperature difference) in °C - Critical for spraying conditions. Calculated from temperature and relative humidity. Optimal range: 2-8°C for spraying.';

-- =============================================================================
-- 2. Create function to calculate delta_t from temperature and humidity
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_delta_t(
    temp_celsius DOUBLE PRECISION,
    relative_humidity_percent DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
    -- Constants for psychrometric calculation
    -- Using simplified formula: Delta T ≈ (1 - RH/100) * (T - T_wet)
    -- Where T_wet is approximated using psychrometric relationships
    vapor_pressure_sat DOUBLE PRECISION;
    vapor_pressure DOUBLE PRECISION;
    dew_point DOUBLE PRECISION;
    wet_bulb_temp DOUBLE PRECISION;
BEGIN
    -- Validate inputs
    IF temp_celsius IS NULL OR relative_humidity_percent IS NULL THEN
        RETURN NULL;
    END IF;
    
    IF relative_humidity_percent < 0 OR relative_humidity_percent > 100 THEN
        RETURN NULL;
    END IF;
    
    -- Calculate saturation vapor pressure (Magnus formula)
    -- e_sat = 6.112 * exp((17.67 * T) / (T + 243.5))
    vapor_pressure_sat := 6.112 * exp((17.67 * temp_celsius) / (temp_celsius + 243.5));
    
    -- Calculate actual vapor pressure
    vapor_pressure := vapor_pressure_sat * (relative_humidity_percent / 100.0);
    
    -- Calculate dew point temperature
    -- T_dew = (243.5 * ln(e / 6.112)) / (17.67 - ln(e / 6.112))
    dew_point := (243.5 * ln(GREATEST(vapor_pressure / 6.112, 0.01))) / 
                 (17.67 - ln(GREATEST(vapor_pressure / 6.112, 0.01)));
    
    -- Approximate wet bulb temperature using simplified formula
    -- T_wet ≈ (T + T_dew) / 2 (rough approximation)
    -- More accurate: T_wet ≈ T - (T - T_dew) * 0.4
    wet_bulb_temp := temp_celsius - (temp_celsius - dew_point) * 0.4;
    
    -- Delta T = T_dry - T_wet
    RETURN ROUND(temp_celsius - wet_bulb_temp, 2);
    
EXCEPTION
    WHEN OTHERS THEN
        -- Return NULL on any calculation error
        RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_delta_t IS 'Calculate Delta T (temperature difference between dry and wet bulb) from temperature and relative humidity. Used for spraying conditions assessment.';

-- =============================================================================
-- 3. Backfill delta_t for existing records (optional, can be slow on large tables)
-- =============================================================================

-- Update existing records with calculated delta_t where we have temp and humidity
-- This is done in batches to avoid long locks
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- Update records that have both temp_avg and humidity_avg
    UPDATE weather_observations
    SET delta_t = calculate_delta_t(temp_avg, humidity_avg)
    WHERE delta_t IS NULL
      AND temp_avg IS NOT NULL
      AND humidity_avg IS NOT NULL
      AND (SELECT COUNT(*) FROM weather_observations WHERE delta_t IS NULL) > 0;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    IF updated_count > 0 THEN
        RAISE NOTICE 'Backfilled delta_t for % existing records', updated_count;
    END IF;
END $$;

-- =============================================================================
-- 4. Create index for delta_t queries (useful for filtering optimal spraying conditions)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_weather_observations_delta_t
    ON weather_observations (delta_t)
    WHERE delta_t IS NOT NULL;

-- =============================================================================
-- 5. Create view for agro metrics summary (useful for dashboards)
-- =============================================================================

CREATE OR REPLACE VIEW weather_agro_metrics_summary AS
SELECT 
    tenant_id,
    municipality_code,
    observed_at,
    temp_avg,
    humidity_avg,
    delta_t,
    wind_speed_ms,
    precip_mm,
    eto_mm,
    soil_moisture_0_10cm,
    gdd_accumulated,
    -- Spraying conditions
    CASE 
        WHEN wind_speed_ms < 4.17 AND delta_t BETWEEN 2 AND 8 THEN 'optimal'  -- < 15 km/h
        WHEN wind_speed_ms BETWEEN 4.17 AND 5.56 AND delta_t BETWEEN 2 AND 10 THEN 'caution'  -- 15-20 km/h
        WHEN wind_speed_ms > 5.56 OR delta_t > 10 OR delta_t < 2 THEN 'not_suitable'  -- > 20 km/h
        ELSE 'unknown'
    END AS spraying_condition,
    -- Workability (tempero) condition
    CASE 
        WHEN soil_moisture_0_10cm BETWEEN 15 AND 25 THEN 'optimal'
        WHEN soil_moisture_0_10cm > 25 THEN 'too_wet'
        WHEN soil_moisture_0_10cm < 10 THEN 'too_dry'
        ELSE 'unknown'
    END AS workability_condition
FROM weather_observations
WHERE source = 'OPEN-METEO'
  AND data_type = 'HISTORY'
ORDER BY observed_at DESC;

COMMENT ON VIEW weather_agro_metrics_summary IS 'Summary view of agroclimatic metrics for quick dashboard queries';

-- =============================================================================
-- End of migration 012
-- =============================================================================

