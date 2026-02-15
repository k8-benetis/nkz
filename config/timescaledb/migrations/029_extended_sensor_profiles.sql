-- =============================================================================
-- Migration 029: Extended Sensor Profiles - Complete Coverage
-- =============================================================================
-- Adds comprehensive sensor profiles for:
--   - Renewable Energy (Agrivoltaics)
--   - Robotics (AgriculturalRobot)
--   - Advanced Agriculture (AgriSensor)
--   - Weather (complements)
--   - ISOBUS Tractors (AgriculturalTractor)
--   - ISOBUS Implements (AgriculturalImplement)
--   - ISOBUS Operations (AgriOperation)
-- =============================================================================
-- Total: 65 new sensor profiles
-- =============================================================================

-- =============================================================================
-- 1. Renewable Energy (Agrivoltaics) - 12 profiles
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
    -- Panel temperature
    (NULL, 'panel_temperature', 'Panel temperature sensor', 'Photovoltaic panel temperature monitoring', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('°C'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'panelTemperature',
                    'sdmAttribute', 'temperature',
                    'unit', '°C'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy', 'component', 'panel')
    ),
    
    -- Inverter efficiency
    (NULL, 'inverter_efficiency', 'Inverter efficiency sensor', 'Photovoltaic inverter efficiency monitoring', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'efficiency',
                    'sdmAttribute', 'efficiency',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy', 'component', 'inverter')
    ),
    
    -- Inverter status
    (NULL, 'inverter_status', 'Inverter status sensor', 'Photovoltaic inverter operational status', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'status',
                    'sdmAttribute', 'status',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy', 'component', 'inverter')
    ),
    
    -- Current amperage
    (NULL, 'current_amperage', 'Current sensor', 'Electrical current monitoring', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('A'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'current',
                    'sdmAttribute', 'current',
                    'unit', 'A'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy')
    ),
    
    -- Power factor
    (NULL, 'power_factor', 'Power factor sensor', 'Electrical power factor monitoring', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'powerFactor',
                    'sdmAttribute', 'powerFactor',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy')
    ),
    
    -- Reactive power
    (NULL, 'reactive_power', 'Reactive power meter', 'Reactive power monitoring', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('kVAR'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'reactivePower',
                    'sdmAttribute', 'reactivePower',
                    'unit', 'kVAR'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy')
    ),
    
    -- Battery current
    (NULL, 'battery_current', 'Battery current sensor', 'Battery charge/discharge current', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('A'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'batteryCurrent',
                    'sdmAttribute', 'current',
                    'unit', 'A'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy', 'component', 'battery')
    ),
    
    -- Battery temperature
    (NULL, 'battery_temperature', 'Battery temperature sensor', 'Battery temperature monitoring', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('°C'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'batteryTemperature',
                    'sdmAttribute', 'temperature',
                    'unit', '°C'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'energy', 'component', 'battery')
    ),
    
    -- Solar azimuth
    (NULL, 'solar_azimuth', 'Solar azimuth tracker', 'Solar azimuth angle tracking', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('deg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'solarAzimuth',
                    'sdmAttribute', 'azimuth',
                    'unit', 'deg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'solar_tracking')
    ),
    
    -- Solar elevation
    (NULL, 'solar_elevation', 'Solar elevation tracker', 'Solar elevation angle tracking', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('deg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'solarElevation',
                    'sdmAttribute', 'elevation',
                    'unit', 'deg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'solar_tracking')
    ),
    
    -- Panel soiling
    (NULL, 'panel_soiling', 'Panel soiling sensor', 'Photovoltaic panel soiling index', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilingIndex',
                    'sdmAttribute', 'soilingIndex',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'maintenance')
    ),
    
    -- Shading coverage
    (NULL, 'shading_coverage', 'Shading coverage sensor', 'Shading coverage percentage on panels', 'AgriSensor', 'agrivoltaics',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'shadingCoverage',
                    'sdmAttribute', 'shadingCoverage',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'irradiance')
    )

ON CONFLICT (COALESCE(tenant_id, '__global__'), code) DO NOTHING;

-- =============================================================================
-- 2. Robotics (AgriculturalRobot) - 10 profiles
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
    -- Robot GPS position
    (NULL, 'robot_gps_position', 'GPS/RTK position sensor', 'Robot GPS/RTK position tracking', 'AgriculturalRobot', 'robotics',
        jsonb_build_array('deg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'gpsPosition',
                    'sdmAttribute', 'location',
                    'unit', 'geo:json'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'positioning')
    ),
    
    -- Robot orientation
    (NULL, 'robot_orientation', 'IMU orientation sensor', 'Robot orientation (roll, pitch, yaw)', 'AgriculturalRobot', 'robotics',
        jsonb_build_array('deg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'orientation',
                    'sdmAttribute', 'orientation',
                    'unit', 'deg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'attitude')
    ),
    
    -- Robot speed
    (NULL, 'robot_speed', 'Robot speed sensor', 'Robot movement speed', 'AgriculturalRobot', 'robotics',
        jsonb_build_array('m/s'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'speed',
                    'sdmAttribute', 'speed',
                    'unit', 'm/s'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'motion')
    ),
    
    -- Robot battery level
    (NULL, 'robot_battery_level', 'Robot battery sensor', 'Robot battery level monitoring', 'AgriculturalRobot', 'robotics',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'batteryLevel',
                    'sdmAttribute', 'batteryLevel',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'power')
    ),
    
    -- Robot payload
    (NULL, 'robot_payload', 'Robot payload sensor', 'Robot payload/capacity monitoring', 'AgriculturalRobot', 'robotics',
        jsonb_build_array('kg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'payload',
                    'sdmAttribute', 'payload',
                    'unit', 'kg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'capacity')
    ),
    
    -- Robot tool status
    (NULL, 'robot_tool_status', 'Robot tool status sensor', 'Active tool operational status', 'AgriculturalRobot', 'robotics',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'toolStatus',
                    'sdmAttribute', 'toolStatus',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'tool')
    ),
    
    -- Robot obstacle detection
    (NULL, 'robot_obstacle_detection', 'Robot obstacle sensor', 'Obstacle detection status', 'AgriculturalRobot', 'robotics',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'obstacleDetected',
                    'sdmAttribute', 'obstacleDetected',
                    'unit', 'boolean'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'safety')
    ),
    
    -- Robot engine hours
    (NULL, 'robot_engine_hours', 'Robot engine hours meter', 'Robot engine operating hours', 'AgriculturalRobot', 'robotics',
        jsonb_build_array('h'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'engineHours',
                    'sdmAttribute', 'engineHours',
                    'unit', 'h'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'maintenance')
    ),
    
    -- Robot fuel level
    (NULL, 'robot_fuel_level', 'Robot fuel level sensor', 'Robot fuel level monitoring', 'AgriculturalRobot', 'robotics',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'fuelLevel',
                    'sdmAttribute', 'fuelLevel',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'power')
    ),
    
    -- Robot operational status
    (NULL, 'robot_operational_status', 'Robot operational status sensor', 'Robot operational status (idle/working/error)', 'AgriculturalRobot', 'robotics',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'operationalStatus',
                    'sdmAttribute', 'status',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'status')
    )

ON CONFLICT (COALESCE(tenant_id, '__global__'), code) DO NOTHING;

-- =============================================================================
-- 3. Advanced Agriculture (AgriSensor) - 15 profiles
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
    -- Soil pH
    (NULL, 'soil_ph', 'Soil pH sensor', 'Soil pH measurement', 'AgriSensor', 'soil',
        jsonb_build_array('pH'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilPh',
                    'sdmAttribute', 'ph',
                    'unit', 'pH'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil')
    ),
    
    -- Soil EC
    (NULL, 'soil_ec', 'Soil EC sensor', 'Soil electrical conductivity', 'AgriSensor', 'soil',
        jsonb_build_array('dS/m'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilEC',
                    'sdmAttribute', 'soilElectricalConductivity',
                    'unit', 'dS/m'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil')
    ),
    
    -- Soil nitrogen
    (NULL, 'soil_nitrogen', 'Soil nitrogen sensor', 'Soil nitrogen level (N)', 'AgriSensor', 'soil',
        jsonb_build_array('mg/kg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilNitrogen',
                    'sdmAttribute', 'soilNitrogen',
                    'unit', 'mg/kg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil', 'nutrient', 'N')
    ),
    
    -- Soil phosphorus
    (NULL, 'soil_phosphorus', 'Soil phosphorus sensor', 'Soil phosphorus level (P)', 'AgriSensor', 'soil',
        jsonb_build_array('mg/kg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilPhosphorus',
                    'sdmAttribute', 'soilPhosphorus',
                    'unit', 'mg/kg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil', 'nutrient', 'P')
    ),
    
    -- Soil potassium
    (NULL, 'soil_potassium', 'Soil potassium sensor', 'Soil potassium level (K)', 'AgriSensor', 'soil',
        jsonb_build_array('mg/kg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilPotassium',
                    'sdmAttribute', 'soilPotassium',
                    'unit', 'mg/kg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil', 'nutrient', 'K')
    ),
    
    -- Leaf wetness
    (NULL, 'leaf_wetness', 'Leaf wetness sensor', 'Leaf surface wetness monitoring', 'AgriSensor', 'plant',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'leafWetness',
                    'sdmAttribute', 'leafWetness',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'plant')
    ),
    
    -- Vapor pressure deficit
    (NULL, 'vapor_pressure_deficit', 'VPD sensor', 'Vapor pressure deficit', 'AgriSensor', 'environment',
        jsonb_build_array('kPa'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'vaporPressureDeficit',
                    'sdmAttribute', 'vaporPressureDeficit',
                    'unit', 'kPa'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'environment')
    ),
    
    -- Canopy temperature
    (NULL, 'canopy_temperature', 'Canopy temperature sensor', 'Canopy temperature monitoring', 'AgriSensor', 'plant',
        jsonb_build_array('°C'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'canopyTemperature',
                    'sdmAttribute', 'temperature',
                    'unit', '°C'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'plant')
    ),
    
    -- Sap flow
    (NULL, 'sap_flow', 'Sap flow sensor', 'Plant sap flow rate', 'AgriSensor', 'plant',
        jsonb_build_array('L/h'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'sapFlow',
                    'sdmAttribute', 'sapFlow',
                    'unit', 'L/h'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'plant')
    ),
    
    -- Stem water potential
    (NULL, 'stem_water_potential', 'Stem water potential sensor', 'Stem water potential measurement', 'AgriSensor', 'plant',
        jsonb_build_array('MPa'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'stemWaterPotential',
                    'sdmAttribute', 'stemWaterPotential',
                    'unit', 'MPa'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'plant')
    ),
    
    -- Chlorophyll content
    (NULL, 'chlorophyll_content', 'Chlorophyll sensor', 'Leaf chlorophyll content (SPAD)', 'AgriSensor', 'plant',
        jsonb_build_array('SPAD'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'chlorophyllContent',
                    'sdmAttribute', 'chlorophyllContent',
                    'unit', 'SPAD'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'plant')
    ),
    
    -- NDVI ground sensor
    (NULL, 'ndvi_sensor', 'NDVI ground sensor', 'NDVI measurement from ground sensor', 'AgriSensor', 'plant',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'ndvi',
                    'sdmAttribute', 'ndvi',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'vegetation_index')
    ),
    
    -- LAI sensor
    (NULL, 'lai_sensor', 'LAI sensor', 'Leaf area index sensor', 'AgriSensor', 'plant',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'leafAreaIndex',
                    'sdmAttribute', 'leafAreaIndex',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'plant')
    ),
    
    -- Soil compaction
    (NULL, 'soil_compaction', 'Soil compaction sensor', 'Soil compaction measurement', 'AgriSensor', 'soil',
        jsonb_build_array('kPa'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilCompaction',
                    'sdmAttribute', 'soilCompaction',
                    'unit', 'kPa'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil')
    ),
    
    -- Soil organic matter
    (NULL, 'soil_organic_matter', 'Soil organic matter sensor', 'Soil organic matter content', 'AgriSensor', 'soil',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilOrganicMatter',
                    'sdmAttribute', 'soilOrganicMatter',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil')
    )

ON CONFLICT (COALESCE(tenant_id, '__global__'), code) DO NOTHING;

-- =============================================================================
-- 4. Weather (complements) - 3 profiles
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
    -- UV index
    (NULL, 'uv_index', 'UV index sensor', 'Ultraviolet index measurement', 'WeatherObserved', 'weather',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'uvIndex',
                    'sdmAttribute', 'uvIndex',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'weather')
    ),
    
    -- Solar zenith
    (NULL, 'solar_zenith', 'Solar zenith angle sensor', 'Solar zenith angle measurement', 'WeatherObserved', 'weather',
        jsonb_build_array('deg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'solarZenith',
                    'sdmAttribute', 'solarZenith',
                    'unit', 'deg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'weather')
    ),
    
    -- Dew point
    (NULL, 'dew_point', 'Dew point sensor', 'Dew point temperature', 'WeatherObserved', 'weather',
        jsonb_build_array('°C'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'dewPoint',
                    'sdmAttribute', 'dewPoint',
                    'unit', '°C'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'weather')
    )

ON CONFLICT (COALESCE(tenant_id, '__global__'), code) DO NOTHING;

-- =============================================================================
-- 5. ISOBUS Tractors (AgriculturalTractor) - 8 profiles
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
    -- Tractor engine speed
    (NULL, 'tractor_engine_speed', 'Tractor engine speed sensor', 'Tractor engine RPM monitoring', 'AgriculturalTractor', 'isobus',
        jsonb_build_array('RPM'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'engineSpeed',
                    'sdmAttribute', 'engineSpeed',
                    'unit', 'RPM'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'engine', 'protocol', 'ISOBUS')
    ),
    
    -- Tractor fuel level
    (NULL, 'tractor_fuel_level', 'Tractor fuel level sensor', 'Tractor fuel level monitoring', 'AgriculturalTractor', 'isobus',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'fuelLevel',
                    'sdmAttribute', 'fuelLevel',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'fuel', 'protocol', 'ISOBUS')
    ),
    
    -- Tractor vehicle speed
    (NULL, 'tractor_vehicle_speed', 'Tractor vehicle speed sensor', 'Tractor vehicle speed monitoring', 'AgriculturalTractor', 'isobus',
        jsonb_build_array('km/h'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'vehicleSpeed',
                    'sdmAttribute', 'speed',
                    'unit', 'km/h'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'motion', 'protocol', 'ISOBUS')
    ),
    
    -- Tractor engine hours
    (NULL, 'tractor_engine_hours', 'Tractor engine hours meter', 'Tractor engine operating hours', 'AgriculturalTractor', 'isobus',
        jsonb_build_array('h'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'engineHours',
                    'sdmAttribute', 'engineHours',
                    'unit', 'h'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'maintenance', 'protocol', 'ISOBUS')
    ),
    
    -- Tractor GPS position
    (NULL, 'tractor_gps_position', 'Tractor GPS position sensor', 'Tractor GPS position tracking', 'AgriculturalTractor', 'isobus',
        jsonb_build_array('deg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'gpsPosition',
                    'sdmAttribute', 'location',
                    'unit', 'geo:json'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'positioning', 'protocol', 'ISOBUS')
    ),
    
    -- Tractor operational status
    (NULL, 'tractor_operational_status', 'Tractor operational status sensor', 'Tractor operational status (idle/working/error)', 'AgriculturalTractor', 'isobus',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'operationalStatus',
                    'sdmAttribute', 'status',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'status', 'protocol', 'ISOBUS')
    ),
    
    -- Tractor PTO speed
    (NULL, 'tractor_power_takeoff', 'Tractor PTO speed sensor', 'Tractor power take-off speed', 'AgriculturalTractor', 'isobus',
        jsonb_build_array('RPM'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'ptoSpeed',
                    'sdmAttribute', 'ptoSpeed',
                    'unit', 'RPM'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'pto', 'protocol', 'ISOBUS')
    ),
    
    -- Tractor hydraulic pressure
    (NULL, 'tractor_hydraulic_pressure', 'Tractor hydraulic pressure sensor', 'Tractor hydraulic system pressure', 'AgriculturalTractor', 'isobus',
        jsonb_build_array('bar'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'hydraulicPressure',
                    'sdmAttribute', 'pressure',
                    'unit', 'bar'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'hydraulics', 'protocol', 'ISOBUS')
    )

ON CONFLICT (COALESCE(tenant_id, '__global__'), code) DO NOTHING;

-- =============================================================================
-- 6. ISOBUS Implements (AgriculturalImplement) - 12 profiles
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
    -- Implement seeding rate
    (NULL, 'implement_seeding_rate', 'Implement seeding rate sensor', 'Seeding rate monitoring (seeds/ha)', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('seeds/ha'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'seedingRate',
                    'sdmAttribute', 'seedingRate',
                    'unit', 'seeds/ha'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'seeding', 'protocol', 'ISOBUS')
    ),
    
    -- Implement seeding depth
    (NULL, 'implement_seeding_depth', 'Implement seeding depth sensor', 'Seeding depth monitoring', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('cm'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'seedingDepth',
                    'sdmAttribute', 'seedingDepth',
                    'unit', 'cm'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'seeding', 'protocol', 'ISOBUS')
    ),
    
    -- Implement seeding spacing
    (NULL, 'implement_seeding_spacing', 'Implement seeding spacing sensor', 'Seeding spacing monitoring', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('cm'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'seedingSpacing',
                    'sdmAttribute', 'seedingSpacing',
                    'unit', 'cm'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'seeding', 'protocol', 'ISOBUS')
    ),
    
    -- Implement application rate
    (NULL, 'implement_application_rate', 'Implement application rate sensor', 'Fertilizer/pesticide application rate (kg/ha or L/ha)', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('kg/ha'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'applicationRate',
                    'sdmAttribute', 'sprayRate',
                    'unit', 'kg/ha'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'application', 'protocol', 'ISOBUS')
    ),
    
    -- Implement working width
    (NULL, 'implement_working_width', 'Implement working width sensor', 'Implement working width monitoring', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('m'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'workingWidth',
                    'sdmAttribute', 'workingWidth',
                    'unit', 'm'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'dimensions', 'protocol', 'ISOBUS')
    ),
    
    -- Implement working depth
    (NULL, 'implement_working_depth', 'Implement working depth sensor', 'Implement working depth monitoring', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('cm'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'workingDepth',
                    'sdmAttribute', 'workingDepth',
                    'unit', 'cm'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'dimensions', 'protocol', 'ISOBUS')
    ),
    
    -- Implement harvested weight
    (NULL, 'implement_harvested_weight', 'Implement harvested weight sensor', 'Harvested weight monitoring', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('kg'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'harvestedWeight',
                    'sdmAttribute', 'harvestedWeight',
                    'unit', 'kg'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'harvesting', 'protocol', 'ISOBUS')
    ),
    
    -- Implement grain moisture
    (NULL, 'implement_grain_moisture', 'Implement grain moisture sensor', 'Grain moisture content monitoring', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'grainMoisture',
                    'sdmAttribute', 'moisture',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'harvesting', 'protocol', 'ISOBUS')
    ),
    
    -- Implement spray pressure
    (NULL, 'implement_spray_pressure', 'Implement spray pressure sensor', 'Spraying pressure monitoring', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('bar'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'sprayPressure',
                    'sdmAttribute', 'pressure',
                    'unit', 'bar'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'spraying', 'protocol', 'ISOBUS')
    ),
    
    -- Implement tank level
    (NULL, 'implement_tank_level', 'Implement tank level sensor', 'Tank level monitoring (L or %)', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('L'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'tankLevel',
                    'sdmAttribute', 'tankLevel',
                    'unit', 'L'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'capacity', 'protocol', 'ISOBUS')
    ),
    
    -- Implement nozzle status
    (NULL, 'implement_nozzle_status', 'Implement nozzle status sensor', 'Nozzle operational status (active/blocked)', 'AgriculturalImplement', 'isobus',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'nozzleStatus',
                    'sdmAttribute', 'nozzleStatus',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'spraying', 'protocol', 'ISOBUS')
    ),
    
    -- Implement soil resistance
    (NULL, 'implement_soil_resistance', 'Implement soil resistance sensor', 'Soil resistance measurement', 'AgriculturalImplement', 'isobus',
        jsonb_build_array('kPa'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'soilResistance',
                    'sdmAttribute', 'soilResistance',
                    'unit', 'kPa'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'soil', 'protocol', 'ISOBUS')
    )

ON CONFLICT (COALESCE(tenant_id, '__global__'), code) DO NOTHING;

-- =============================================================================
-- 7. ISOBUS Operations (AgriOperation) - 5 profiles
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
    -- Operation area worked
    (NULL, 'operation_area_worked', 'Operation area worked sensor', 'Area worked during operation', 'AgriOperation', 'isobus',
        jsonb_build_array('ha'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'areaWorked',
                    'sdmAttribute', 'area',
                    'unit', 'ha'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'operation', 'protocol', 'ISOBUS')
    ),
    
    -- Operation yield
    (NULL, 'operation_yield', 'Operation yield sensor', 'Crop yield during operation', 'AgriOperation', 'isobus',
        jsonb_build_array('kg/ha'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'yield',
                    'sdmAttribute', 'yield',
                    'unit', 'kg/ha'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'operation', 'protocol', 'ISOBUS')
    ),
    
    -- Operation grain losses
    (NULL, 'operation_grain_losses', 'Operation grain losses sensor', 'Grain losses during harvest operation', 'AgriOperation', 'isobus',
        jsonb_build_array('%'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'grainLosses',
                    'sdmAttribute', 'grainLosses',
                    'unit', '%'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'operation', 'protocol', 'ISOBUS')
    ),
    
    -- Operation fuel consumption
    (NULL, 'operation_fuel_consumption', 'Operation fuel consumption sensor', 'Fuel consumption per area during operation', 'AgriOperation', 'isobus',
        jsonb_build_array('L/ha'),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'fuelConsumption',
                    'sdmAttribute', 'fuelConsumption',
                    'unit', 'L/ha'
                )
            )
        ),
        jsonb_build_object('measurementKind', 'operation', 'protocol', 'ISOBUS')
    ),
    
    -- Operation work quality
    (NULL, 'operation_work_quality', 'Operation work quality sensor', 'Work quality index during operation', 'AgriOperation', 'isobus',
        jsonb_build_array(''),
        jsonb_build_object(
            'version', 1,
            'measurements', jsonb_build_array(
                jsonb_build_object(
                    'type', 'workQuality',
                    'sdmAttribute', 'workQuality',
                    'unit', ''
                )
            )
        ),
        jsonb_build_object('measurementKind', 'operation', 'protocol', 'ISOBUS')
    )

ON CONFLICT (COALESCE(tenant_id, '__global__'), code) DO NOTHING;

-- =============================================================================
-- End of migration 029
-- =============================================================================
-- Summary:
--   - 12 Renewable Energy (Agrivoltaics) profiles
--   - 10 Robotics (AgriculturalRobot) profiles
--   - 15 Advanced Agriculture (AgriSensor) profiles
--   - 3 Weather (complements) profiles
--   - 8 ISOBUS Tractors (AgriculturalTractor) profiles
--   - 12 ISOBUS Implements (AgriculturalImplement) profiles
--   - 5 ISOBUS Operations (AgriOperation) profiles
-- Total: 65 new sensor profiles
-- =============================================================================
