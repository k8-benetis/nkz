-- =============================================================================
-- Migration 010: Sensor ingestion, parcels and weather support
-- =============================================================================
-- Adds sensor catalogue tables, telemetry hypertables, tenant weather bindings,
-- and seeds initial agrivoltaic sensor profiles for the Nekazari platform.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- =============================================================================
-- 1. Catalog of Spanish municipalities (INE codes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalog_municipalities (
    ine_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    province TEXT,
    autonomous_community TEXT,
    aemet_id TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    geom GEOMETRY(Point, 4326),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_municipalities_name
    ON catalog_municipalities (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_catalog_municipalities_geom
    ON catalog_municipalities
    USING GIST (geom);

-- =============================================================================
-- 2. Tenant weather locations (multiple municipalities per tenant)
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant_weather_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    municipality_code TEXT NOT NULL REFERENCES catalog_municipalities(ine_code) ON DELETE RESTRICT,
    station_id TEXT,
    label TEXT,
    is_primary BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weather_locations_tenant_municipality
    ON tenant_weather_locations (tenant_id, municipality_code);

CREATE INDEX IF NOT EXISTS idx_weather_locations_primary
    ON tenant_weather_locations (tenant_id)
    WHERE is_primary = true;

DROP TRIGGER IF EXISTS update_weather_locations_updated_at ON tenant_weather_locations;
CREATE TRIGGER update_weather_locations_updated_at
    BEFORE UPDATE ON tenant_weather_locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. Sensor profiles (global + tenant overrides)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sensor_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    sdm_entity_type TEXT NOT NULL,
    sdm_category TEXT,
    default_units JSONB DEFAULT '[]'::jsonb,
    mapping JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_profiles_tenant_code
    ON sensor_profiles (COALESCE(tenant_id, '__global__'), code);

CREATE INDEX IF NOT EXISTS idx_sensor_profiles_active
    ON sensor_profiles (is_active)
    WHERE is_active = true;

DROP TRIGGER IF EXISTS update_sensor_profiles_updated_at ON sensor_profiles;
CREATE TRIGGER update_sensor_profiles_updated_at
    BEFORE UPDATE ON sensor_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 4. Sensors catalogue
-- =============================================================================

CREATE TABLE IF NOT EXISTS sensors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    profile_id UUID REFERENCES sensor_profiles(id),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    installation_location GEOGRAPHY(Point, 4326),
    altitude_meters DOUBLE PRECISION,
    is_under_canopy BOOLEAN DEFAULT false,
    parcel_id UUID REFERENCES cadastral_parcels(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    installed_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sensors_tenant_external
    ON sensors (tenant_id, external_id);

CREATE INDEX IF NOT EXISTS idx_sensors_profile
    ON sensors (profile_id);

CREATE INDEX IF NOT EXISTS idx_sensors_status
    ON sensors (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_sensors_location
    ON sensors
    USING GIST ((installation_location::geometry))
    WHERE installation_location IS NOT NULL;

DROP TRIGGER IF EXISTS update_sensors_updated_at ON sensors;
CREATE TRIGGER update_sensors_updated_at
    BEFORE UPDATE ON sensors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 5. Parcel ↔ sensor association (many-to-many)
-- =============================================================================

CREATE TABLE IF NOT EXISTS parcel_sensors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    parcel_id UUID NOT NULL REFERENCES cadastral_parcels(id) ON DELETE CASCADE,
    sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'monitoring',
    is_primary BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parcel_sensors_unique
    ON parcel_sensors (parcel_id, sensor_id);

CREATE INDEX IF NOT EXISTS idx_parcel_sensors_role
    ON parcel_sensors (tenant_id, role);

DROP TRIGGER IF EXISTS update_parcel_sensors_updated_at ON parcel_sensors;
CREATE TRIGGER update_parcel_sensors_updated_at
    BEFORE UPDATE ON parcel_sensors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 6. Telemetry events (Timescale hypertable)
-- =============================================================================

CREATE TABLE IF NOT EXISTS telemetry_events (
    tenant_id TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    id BIGSERIAL,
    sensor_id UUID,
    device_id TEXT,
    profile_code TEXT,
    task_id TEXT,
    ingested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    payload JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (tenant_id, observed_at, id)
);

ALTER TABLE telemetry_events
    DROP CONSTRAINT IF EXISTS telemetry_events_pkey;

ALTER TABLE telemetry_events
    ADD CONSTRAINT telemetry_events_pkey PRIMARY KEY (tenant_id, observed_at, id);

DO $$
BEGIN
    PERFORM create_hypertable(
        'telemetry_events',
        'observed_at',
        if_not_exists => TRUE,
        migrate_data => FALSE
    );
END $$;

CREATE INDEX IF NOT EXISTS idx_telemetry_events_tenant_time
    ON telemetry_events (tenant_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_sensor_time
    ON telemetry_events (sensor_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_task
    ON telemetry_events (tenant_id, task_id)
    WHERE task_id IS NOT NULL;

-- =============================================================================
-- 7. Weather observations (Timescale hypertable)
-- =============================================================================

CREATE TABLE IF NOT EXISTS weather_observations (
    tenant_id TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    id BIGSERIAL,
    municipality_code TEXT NOT NULL REFERENCES catalog_municipalities(ine_code) ON DELETE RESTRICT,
    station_id TEXT,
    ingested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metrics JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (tenant_id, observed_at, id)
);

ALTER TABLE weather_observations
    DROP CONSTRAINT IF EXISTS weather_observations_pkey;

ALTER TABLE weather_observations
    ADD CONSTRAINT weather_observations_pkey PRIMARY KEY (tenant_id, observed_at, id);

DO $$
BEGIN
    PERFORM create_hypertable(
        'weather_observations',
        'observed_at',
        if_not_exists => TRUE,
        migrate_data => FALSE
    );
END $$;

CREATE INDEX IF NOT EXISTS idx_weather_observations_tenant_time
    ON weather_observations (tenant_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_weather_observations_station_time
    ON weather_observations (municipality_code, station_id, observed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weather_observations_unique
    ON weather_observations (
        tenant_id,
        municipality_code,
        COALESCE(station_id, ''),
        observed_at
    );

-- =============================================================================
-- 8. Extend cadastral parcels for manual geometry and weather linkage
-- =============================================================================
-- NOTE: Requires postgres user (superuser) to ALTER TABLE if table was created by postgres

-- Check if table exists before altering
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cadastral_parcels') THEN
        -- Add columns (will fail silently if columns already exist)
        ALTER TABLE cadastral_parcels
            ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'catastro',
            ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS manual_geometry BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS weather_location_id UUID REFERENCES tenant_weather_locations(id) ON DELETE SET NULL;
        
        -- Create indexes (will fail silently if indexes already exist)
        CREATE INDEX IF NOT EXISTS idx_parcels_source
            ON cadastral_parcels (source);
        
        CREATE INDEX IF NOT EXISTS idx_parcels_weather_location
            ON cadastral_parcels (weather_location_id);
    ELSE
        RAISE NOTICE 'Table cadastral_parcels does not exist, skipping ALTER TABLE';
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Insufficient privileges to ALTER TABLE cadastral_parcels. Run as postgres user.';
    WHEN OTHERS THEN
        RAISE NOTICE 'Error altering cadastral_parcels: %', SQLERRM;
END $$;

-- =============================================================================
-- 9. Row Level Security (RLS) policies
-- =============================================================================

ALTER TABLE sensor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensors ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_sensors ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_weather_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_observations ENABLE ROW LEVEL SECURITY;

-- Sensor profiles: allow global (NULL tenant) reads, tenant-specific writes
DROP POLICY IF EXISTS sensor_profiles_select ON sensor_profiles;
CREATE POLICY sensor_profiles_select ON sensor_profiles
    USING (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant', true)
    );

DROP POLICY IF EXISTS sensor_profiles_write ON sensor_profiles;
CREATE POLICY sensor_profiles_write ON sensor_profiles
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Sensors
DROP POLICY IF EXISTS sensors_tenant_isolation ON sensors;
CREATE POLICY sensors_tenant_isolation ON sensors
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS sensors_tenant_write ON sensors;
CREATE POLICY sensors_tenant_write ON sensors
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Parcel sensors
DROP POLICY IF EXISTS parcel_sensors_tenant_isolation ON parcel_sensors;
CREATE POLICY parcel_sensors_tenant_isolation ON parcel_sensors
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS parcel_sensors_tenant_write ON parcel_sensors;
CREATE POLICY parcel_sensors_tenant_write ON parcel_sensors
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Telemetry events
DROP POLICY IF EXISTS telemetry_events_tenant_isolation ON telemetry_events;
CREATE POLICY telemetry_events_tenant_isolation ON telemetry_events
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS telemetry_events_tenant_insert ON telemetry_events;
CREATE POLICY telemetry_events_tenant_insert ON telemetry_events
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Tenant weather locations
DROP POLICY IF EXISTS tenant_weather_locations_isolation ON tenant_weather_locations;
CREATE POLICY tenant_weather_locations_isolation ON tenant_weather_locations
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_weather_locations_write ON tenant_weather_locations;
CREATE POLICY tenant_weather_locations_write ON tenant_weather_locations
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Weather observations
DROP POLICY IF EXISTS weather_observations_isolation ON weather_observations;
CREATE POLICY weather_observations_isolation ON weather_observations
    USING (tenant_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS weather_observations_insert ON weather_observations;
CREATE POLICY weather_observations_insert ON weather_observations
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- =============================================================================
-- 10. Seed global sensor profiles (Smart Data Models aligned)
-- =============================================================================

INSERT INTO sensor_profiles (
    tenant_id,
    code,
    name,
    description,
    sdm_entity_type,
    sdm_category,
    default_units,
    mapping,
    metadata
) VALUES
    (NULL, 'par_photon_flux', 'PAR quantum sensor', 'Photosynthetic photon flux density sensor', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('umol/m2/s'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'photosyntheticPhotonFluxDensity',
                    'sdmAttribute', 'photosyntheticPhotonFluxDensity',
                    'unit', 'umol/m2/s'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'PAR')
    ),
    (NULL, 'solar_irradiance', 'Pyranometer', 'Global solar irradiance sensor', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('W/m2'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'solarRadiation',
                    'sdmAttribute', 'solarRadiation',
                    'unit', 'W/m2'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'irradiance')
    ),
    (NULL, 'air_temperature', 'Air temperature probe', 'Ambient air temperature', 'AgriSensor', 'environment',
        jsonb_build_array('°C'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'temperature',
                    'sdmAttribute', 'airTemperature',
                    'unit', '°C'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'air')
    ),
    (NULL, 'air_humidity', 'Air humidity probe', 'Ambient relative humidity', 'AgriSensor', 'environment',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'relativeHumidity',
                    'sdmAttribute', 'relativeHumidity',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'air')
    ),
    (NULL, 'dendrometer', 'Dendrometer', 'Trunk diameter variation sensor', 'AgriSensor', 'plant',
        jsonb_build_array('µm'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'trunkDiameterVariation',
                    'sdmAttribute', 'stemDiameter',
                    'unit', 'µm'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'plant')
    ),
    (NULL, 'soil_temperature', 'Soil temperature probe', 'Soil temperature at given depth', 'AgriSensor', 'soil',
        jsonb_build_array('°C'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilTemperature',
                    'sdmAttribute', 'soilTemperature',
                    'unit', '°C'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil')
    ),
    (NULL, 'soil_moisture', 'Soil moisture probe', 'Volumetric soil moisture', 'AgriSensor', 'soil',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilMoisture',
                    'sdmAttribute', 'soilMoisture',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil')
    ),
    (NULL, 'leaf_temperature', 'Leaf temperature sensor', 'Canopy leaf temperature', 'AgriSensor', 'plant',
        jsonb_build_array('°C'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'leafTemperature',
                    'sdmAttribute', 'leafTemperature',
                    'unit', '°C'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'plant')
    ),
    (NULL, 'precipitation', 'Tipping bucket rain gauge', 'Precipitation accumulation', 'WeatherObserved', 'weather',
        jsonb_build_array('mm'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'precipitation',
                    'sdmAttribute', 'precipitation',
                    'unit', 'mm'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'weather')
    ),
    (NULL, 'snow_presence', 'Snow presence sensor', 'Snow depth or detection', 'WeatherObserved', 'weather',
        jsonb_build_array('mm'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'snowHeight',
                    'sdmAttribute', 'snowHeight',
                    'unit', 'mm'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'weather')
    ),
    (NULL, 'solar_reference', 'Reference irradiance sensor', 'Reference cell irradiance', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('W/m2'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'solarRadiation',
                    'sdmAttribute', 'solarRadiation',
                    'unit', 'W/m2',
                    'context', 'reference'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'irradiance')
    ),
    (NULL, 'air_pressure', 'Atmospheric pressure sensor', 'Atmospheric pressure at reference height', 'WeatherObserved', 'weather',
        jsonb_build_array('hPa'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'atmosphericPressure',
                    'sdmAttribute', 'atmosphericPressure',
                    'unit', 'hPa'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'weather')
    ),
    (NULL, 'wind_speed', 'Wind speed sensor', 'Horizontal wind speed', 'WeatherObserved', 'weather',
        jsonb_build_array('m/s'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'windSpeed',
                    'sdmAttribute', 'windSpeed',
                    'unit', 'm/s'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'weather')
    ),
    (NULL, 'wind_direction', 'Wind direction sensor', 'Wind direction', 'WeatherObserved', 'weather',
        jsonb_build_array('deg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'windDirection',
                    'sdmAttribute', 'windDirection',
                    'unit', 'deg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'weather')
    ),
    (NULL, 'panel_inclination', 'Panel inclination sensor', 'Inclination angle for agrivoltaic structures', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('deg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'inclinationAngle',
                    'sdmAttribute', 'inclination',
                    'unit', 'deg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'structure')
    ),
    (NULL, 'energy_production', 'Energy production meter', 'Electrical energy production', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('kWh'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'instantaneousPower',
                    'sdmAttribute', 'instantaneousPower',
                    'unit', 'kW'
                ),
                jsonb_build_object(
                    'type', 'cumulativeActivePowerImport',
                    'sdmAttribute', 'cumulativeActivePowerImport',
                    'unit', 'kWh'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy')
    ),
    (NULL, 'battery_voltage', 'Battery voltage sensor', 'Battery voltage monitoring', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('V'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'voltage',
                    'sdmAttribute', 'voltage',
                    'unit', 'V'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy')
    ),
    (NULL, 'battery_soc', 'Battery state-of-charge sensor', 'Battery state of charge', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'stateOfCharge',
                    'sdmAttribute', 'stateOfCharge',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy')
    )
ON CONFLICT (COALESCE(tenant_id, '__global__'), code) DO NOTHING;

-- =============================================================================
-- 11. Seed initial sensors for tenant 'gabrego' (agrivoltaic deployment)
-- =============================================================================

DO $$
DECLARE
    tenant_exists BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM tenants WHERE tenant_id = 'gabrego') INTO tenant_exists;

    IF tenant_exists THEN
        -- Under-panel Espaldera sensors
        INSERT INTO sensors (
            tenant_id, external_id, profile_id, name, installation_location, is_under_canopy, metadata
        )
        SELECT
            'gabrego',
            sensor_code,
            (SELECT id FROM sensor_profiles WHERE code = profile_code AND tenant_id IS NULL LIMIT 1),
            sensor_name,
            ST_SetSRID(ST_MakePoint(-2.026656052067378, 42.57235887721984), 4326)::geography,
            true,
            jsonb_build_object('group', 'BP_Espaldera')
        FROM (VALUES
            ('BP_Espaldera_PAR_1', 'par_photon_flux', 'BP Espaldera PAR 1'),
            ('BP_Espaldera_PAR_2', 'par_photon_flux', 'BP Espaldera PAR 2'),
            ('BP_Espaldera_Piranometro_1', 'solar_irradiance', 'BP Espaldera Pirano 1'),
            ('BP_Espaldera_Piranometro_2', 'solar_irradiance', 'BP Espaldera Pirano 2'),
            ('BP_Espaldera_TempAire', 'air_temperature', 'BP Espaldera Temp Aire'),
            ('BP_Espaldera_HRAire', 'air_humidity', 'BP Espaldera HR Aire'),
            ('BP_Espaldera_Dendrometro_1', 'dendrometer', 'BP Espaldera Dendro 1'),
            ('BP_Espaldera_Dendrometro_2', 'dendrometer', 'BP Espaldera Dendro 2'),
            ('BP_Espaldera_TempSuelo_1', 'soil_temperature', 'BP Espaldera Temp Suelo 1'),
            ('BP_Espaldera_HRSuelo_1', 'soil_moisture', 'BP Espaldera HR Suelo 1'),
            ('BP_Espaldera_TempSuelo_2', 'soil_temperature', 'BP Espaldera Temp Suelo 2'),
            ('BP_Espaldera_HRSuelo_2', 'soil_moisture', 'BP Espaldera HR Suelo 2'),
            ('BP_Espaldera_TempHoja_1', 'leaf_temperature', 'BP Espaldera Temp Hoja 1'),
            ('BP_Espaldera_TempHoja_2', 'leaf_temperature', 'BP Espaldera Temp Hoja 2')
        ) AS seed(sensor_code, profile_code, sensor_name)
        ON CONFLICT (tenant_id, external_id) DO NOTHING;

        -- Under-panel Vaso sensors
        INSERT INTO sensors (
            tenant_id, external_id, profile_id, name, installation_location, is_under_canopy, metadata
        )
        SELECT
            'gabrego',
            sensor_code,
            (SELECT id FROM sensor_profiles WHERE code = profile_code AND tenant_id IS NULL LIMIT 1),
            sensor_name,
            ST_SetSRID(ST_MakePoint(-2.028292199544963, 42.5713514957486), 4326)::geography,
            true,
            jsonb_build_object('group', 'BP_Vaso')
        FROM (VALUES
            ('BP_Vaso_PAR_1', 'par_photon_flux', 'BP Vaso PAR 1'),
            ('BP_Vaso_PAR_2', 'par_photon_flux', 'BP Vaso PAR 2'),
            ('BP_Vaso_Piranometro_1', 'solar_irradiance', 'BP Vaso Pirano 1'),
            ('BP_Vaso_Piranometro_2', 'solar_irradiance', 'BP Vaso Pirano 2'),
            ('BP_Vaso_TempAire', 'air_temperature', 'BP Vaso Temp Aire'),
            ('BP_Vaso_HRAire', 'air_humidity', 'BP Vaso HR Aire'),
            ('BP_Vaso_Dendrometro_1', 'dendrometer', 'BP Vaso Dendro 1'),
            ('BP_Vaso_Dendrometro_2', 'dendrometer', 'BP Vaso Dendro 2'),
            ('BP_Vaso_TempSuelo_1', 'soil_temperature', 'BP Vaso Temp Suelo 1'),
            ('BP_Vaso_TempSuelo_2', 'soil_temperature', 'BP Vaso Temp Suelo 2'),
            ('BP_Vaso_HRSuelo_1', 'soil_moisture', 'BP Vaso HR Suelo 1'),
            ('BP_Vaso_HRSuelo_2', 'soil_moisture', 'BP Vaso HR Suelo 2'),
            ('BP_Vaso_TempHoja_1', 'leaf_temperature', 'BP Vaso Temp Hoja 1'),
            ('BP_Vaso_TempHoja_2', 'leaf_temperature', 'BP Vaso Temp Hoja 2')
        ) AS seed(sensor_code, profile_code, sensor_name)
        ON CONFLICT (tenant_id, external_id) DO NOTHING;

        -- Environmental mast sensors (open field reference)
        INSERT INTO sensors (
            tenant_id, external_id, profile_id, name, installation_location, is_under_canopy, metadata
        )
        SELECT
            'gabrego',
            sensor_code,
            (SELECT id FROM sensor_profiles WHERE code = profile_code AND tenant_id IS NULL LIMIT 1),
            sensor_name,
            ST_SetSRID(ST_MakePoint(-2.0277567420116323, 42.57178279267356), 4326)::geography,
            false,
            jsonb_build_object('group', 'Ambiental')
        FROM (VALUES
            ('Ambiental_Precipitacion', 'precipitation', 'Ambiental Precipitación'),
            ('Ambiental_Nieve', 'snow_presence', 'Ambiental Nieve'),
            ('Ambiental_PAR', 'par_photon_flux', 'Ambiental PAR'),
            ('Ambiental_Irradiancia_Ref', 'solar_reference', 'Ambiental Irradiancia Ref'),
            ('Ambiental_Piranometro', 'solar_irradiance', 'Ambiental Pirano'),
            ('Ambiental_TempSuelo', 'soil_temperature', 'Ambiental Temp Suelo'),
            ('Ambiental_HRSuelo', 'soil_moisture', 'Ambiental HR Suelo'),
            ('Ambiental_VientoVel', 'wind_speed', 'Ambiental Viento Vel'),
            ('Ambiental_VientoDir', 'wind_direction', 'Ambiental Viento Dir'),
            ('Ambiental_Inclinacion_Espaldera', 'panel_inclination', 'Ambiental Inclinación Espaldera'),
            ('Ambiental_Inclinacion_Vaso', 'panel_inclination', 'Ambiental Inclinación Vaso'),
            ('Prod_Vaso', 'energy_production', 'Producción Vaso'),
            ('Prod_Espaldera', 'energy_production', 'Producción Espaldera'),
            ('Prod_Baterias', 'battery_voltage', 'Producción Baterías'),
            ('Estado_Baterias_SoC', 'battery_soc', 'Estado Baterías SoC')
        ) AS seed(sensor_code, profile_code, sensor_name)
        ON CONFLICT (tenant_id, external_id) DO NOTHING;

        -- Control plots (non-panel reference)
        INSERT INTO sensors (
            tenant_id, external_id, profile_id, name, installation_location, is_under_canopy, metadata
        )
        SELECT
            'gabrego',
            sensor_code,
            (SELECT id FROM sensor_profiles WHERE code = profile_code AND tenant_id IS NULL LIMIT 1),
            sensor_name,
            location_geog,
            false,
            jsonb_build_object('group', control_group)
        FROM (VALUES
            ('Control_Espaldera_Dendrometro_1', 'dendrometer', 'Control Espaldera Dendro 1', ST_SetSRID(ST_MakePoint(-2.026656052067378, 42.57235887721984), 4326)::geography, 'Control_Espaldera'),
            ('Control_Espaldera_Dendrometro_2', 'dendrometer', 'Control Espaldera Dendro 2', ST_SetSRID(ST_MakePoint(-2.026656052067378, 42.57235887721984), 4326)::geography, 'Control_Espaldera'),
            ('Control_Espaldera_TempAire', 'air_temperature', 'Control Espaldera Temp Aire', ST_SetSRID(ST_MakePoint(-2.026656052067378, 42.57235887721984), 4326)::geography, 'Control_Espaldera'),
            ('Control_Espaldera_HRAire', 'air_humidity', 'Control Espaldera HR Aire', ST_SetSRID(ST_MakePoint(-2.026656052067378, 42.57235887721984), 4326)::geography, 'Control_Espaldera'),
            ('Control_Espaldera_PAR', 'par_photon_flux', 'Control Espaldera PAR', ST_SetSRID(ST_MakePoint(-2.026656052067378, 42.57235887721984), 4326)::geography, 'Control_Espaldera'),
            ('Control_Vaso_Dendrometro_1', 'dendrometer', 'Control Vaso Dendro 1', ST_SetSRID(ST_MakePoint(-2.028292199544963, 42.5713514957486), 4326)::geography, 'Control_Vaso'),
            ('Control_Vaso_Dendrometro_2', 'dendrometer', 'Control Vaso Dendro 2', ST_SetSRID(ST_MakePoint(-2.028292199544963, 42.5713514957486), 4326)::geography, 'Control_Vaso'),
            ('Control_Vaso_TempAire', 'air_temperature', 'Control Vaso Temp Aire', ST_SetSRID(ST_MakePoint(-2.028292199544963, 42.5713514957486), 4326)::geography, 'Control_Vaso'),
            ('Control_Vaso_HRAire', 'air_humidity', 'Control Vaso HR Aire', ST_SetSRID(ST_MakePoint(-2.028292199544963, 42.5713514957486), 4326)::geography, 'Control_Vaso')
        ) AS seed(sensor_code, profile_code, sensor_name, location_geog, control_group)
        ON CONFLICT (tenant_id, external_id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Tenant gabrego not found; skipping agrivoltaic sensor seed.';
    END IF;
END $$;

-- =============================================================================
-- End of migration 010
-- =============================================================================


