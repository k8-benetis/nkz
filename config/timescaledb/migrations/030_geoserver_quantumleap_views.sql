-- =============================================================================
-- GeoServer Views with QuantumLeap Integration
-- Migration 030: Create optimized views for GeoServer WMS/WFS
-- =============================================================================

-- 1. Parcels View (from cadastral_parcels)
CREATE OR REPLACE VIEW geoserver_parcels AS
SELECT 
    id,
    tenant_id,
    cadastral_reference,
    area_hectares,
    geometry,
    crop_type,
    updated_at
FROM cadastral_parcels
WHERE tenant_id = current_setting('app.current_tenant', true)::uuid;

-- 2. Devices View (from devices table)
CREATE OR REPLACE VIEW geoserver_devices AS
SELECT 
    id,
    tenant_id,
    device_id,
    name,
    type as device_type,
    ST_SetSRID(
        ST_MakePoint(
            (location->>'longitude')::float,
            (location->>'latitude')::float
        ), 4326
    ) as geom,
    status,
    updated_at as last_seen
FROM devices
WHERE tenant_id = current_setting('app.current_tenant', true)::uuid;

-- 3. Robot Paths (from QuantumLeap mtagriculturalrobot)
-- Aggregates robot positions into daily paths
CREATE OR REPLACE VIEW geoserver_robot_paths AS
SELECT 
    entity_id as robot_id,
    fiware_servicepath as tenant_id,
    DATE(time_index) as path_date,
    ST_MakeLine(
        ST_SetSRID(
            ST_MakePoint(
                (location->>'coordinates'->>0)::float,
                (location->>'coordinates'->>1)::float
            ), 4326
        ) ORDER BY time_index
    ) as path_geom,
    MIN(time_index) as start_time,
    MAX(time_index) as end_time,
    COUNT(*) as point_count,
    AVG((batterylevel->>'value')::float) as avg_battery,
    AVG((speed->>'value')::float) as avg_speed
FROM mtagriculturalrobot
WHERE fiware_servicepath = current_setting('app.current_tenant', true)
GROUP BY entity_id, fiware_servicepath, DATE(time_index);

-- 4. Robot Current Positions (latest position from QuantumLeap)
CREATE OR REPLACE VIEW geoserver_robots_current AS
SELECT DISTINCT ON (entity_id)
    entity_id as robot_id,
    fiware_servicepath as tenant_id,
    ST_SetSRID(
        ST_MakePoint(
            (location->>'coordinates'->>0)::float,
            (location->>'coordinates'->>1)::float
        ), 4326
    ) as geom,
    (status->>'value')::text as status,
    (batterylevel->>'value')::float as battery_level,
    (speed->>'value')::float as speed,
    time_index as last_update
FROM mtagriculturalrobot
WHERE fiware_servicepath = current_setting('app.current_tenant', true)
ORDER BY entity_id, time_index DESC;

-- 5. Sensor Locations (from QuantumLeap mtagrisensor)
CREATE OR REPLACE VIEW geoserver_sensors AS
SELECT DISTINCT ON (entity_id)
    entity_id as sensor_id,
    fiware_servicepath as tenant_id,
    ST_SetSRID(
        ST_MakePoint(
            (location->>'coordinates'->>0)::float,
            (location->>'coordinates'->>1)::float
        ), 4326
    ) as geom,
    (temperature->>'value')::float as temperature,
    (humidity->>'value')::float as humidity,
    (moisture->>'value')::float as soil_moisture,
    time_index as last_reading
FROM mtagrisensor
WHERE fiware_servicepath = current_setting('app.current_tenant', true)
ORDER BY entity_id, time_index DESC;

-- 6. Weather Stations (if using WeatherObserved entities)
CREATE OR REPLACE VIEW geoserver_weather_stations AS
SELECT DISTINCT ON (entity_id)
    entity_id as station_id,
    fiware_servicepath as tenant_id,
    ST_SetSRID(
        ST_MakePoint(
            (location->>'coordinates'->>0)::float,
            (location->>'coordinates'->>1)::float
        ), 4326
    ) as geom,
    (temperature->>'value')::float as temperature,
    (relativehumidity->>'value')::float as humidity,
    (atmosphericpressure->>'value')::float as pressure,
    (windspeed->>'value')::float as wind_speed,
    (precipitation->>'value')::float as rainfall,
    time_index as observation_time
FROM mtweatherobserved
WHERE fiware_servicepath = current_setting('app.current_tenant', true)
ORDER BY entity_id, time_index DESC;

-- =============================================================================
-- Spatial Indexes
-- =============================================================================

-- Parcels
CREATE INDEX IF NOT EXISTS idx_parcels_geom 
ON cadastral_parcels USING GIST(geometry);

-- NDVI Rasters
CREATE INDEX IF NOT EXISTS idx_ndvi_rasters_geom 
ON ndvi_rasters USING GIST(ST_ConvexHull(rast));

-- Devices (if location is stored as JSONB, create functional index)
CREATE INDEX IF NOT EXISTS idx_devices_location_geom
ON devices USING GIST(
    ST_SetSRID(
        ST_MakePoint(
            (location->>'longitude')::float,
            (location->>'latitude')::float
        ), 4326
    )
);

-- QuantumLeap tables (time_index for temporal queries)
-- Note: These will be created after QuantumLeap first run
-- CREATE INDEX IF NOT EXISTS idx_mtagriculturalrobot_time 
-- ON mtagriculturalrobot(time_index DESC);

-- CREATE INDEX IF NOT EXISTS idx_mtagrisensor_time 
-- ON mtagrisensor(time_index DESC);

-- CREATE INDEX IF NOT EXISTS idx_mtweatherobserved_time 
-- ON mtweatherobserved(time_index DESC);

-- =============================================================================
-- Permissions
-- =============================================================================

GRANT SELECT ON geoserver_parcels TO nekazari;
GRANT SELECT ON geoserver_devices TO nekazari;
-- GRANT SELECT ON geoserver_robot_paths TO nekazari;
-- GRANT SELECT ON geoserver_robots_current TO nekazari;
-- GRANT SELECT ON geoserver_sensors TO nekazari;
-- GRANT SELECT ON geoserver_weather_stations TO nekazari;

-- Note: Permissions for QuantumLeap views will be granted after tables are created
