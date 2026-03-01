-- =============================================================================
-- Nekazari — Demo seed data for docker-compose
-- =============================================================================
-- Requires: all migrations have been applied first.
-- Creates: 1 tenant, 1 municipality, 2 parcels, weather data, risk states,
--          marketplace modules, and tenant module installations.

-- =============================================================================
-- 1. Demo Tenant
-- =============================================================================
INSERT INTO tenants (tenant_id, tenant_name, plan_type, status, max_users, max_robots, max_sensors)
VALUES ('demo-farm', 'Demo Farm — Olite (Navarra)', 'premium', 'active', 10, 5, 50)
ON CONFLICT (tenant_id) DO NOTHING;

-- =============================================================================
-- 2. Municipality catalog (Olite, Navarra — required FK for weather_observations)
-- =============================================================================
INSERT INTO catalog_municipalities (ine_code, name, province, autonomous_community, latitude, longitude, geom)
VALUES (
    '31189', 'Olite/Erriberri', 'Navarra', 'Comunidad Foral de Navarra',
    42.6490, -1.6509,
    ST_SetSRID(ST_MakePoint(-1.6509, 42.6490), 4326)
)
ON CONFLICT (ine_code) DO NOTHING;

-- =============================================================================
-- 3. Weather observations (7 days x 24 hourly readings)
-- =============================================================================
INSERT INTO weather_observations (tenant_id, observed_at, municipality_code, station_id, metrics, metadata)
SELECT
    'demo-farm',
    ts,
    '31189',
    'openmeteo-olite',
    jsonb_build_object(
        'temperature_2m', 12.0 + 8.0 * sin(extract(hour FROM ts)::float * 3.14159 / 12.0) + (random() * 2 - 1),
        'relative_humidity_2m', 65.0 - 20.0 * sin(extract(hour FROM ts)::float * 3.14159 / 12.0) + (random() * 5 - 2.5),
        'precipitation', CASE WHEN random() < 0.1 THEN round((random() * 5)::numeric, 1) ELSE 0 END,
        'wind_speed_10m', 5.0 + random() * 10,
        'wind_direction_10m', floor(random() * 360),
        'surface_pressure', 1013.0 + (random() * 6 - 3),
        'cloud_cover', floor(random() * 100),
        'soil_moisture_0_to_1cm', 0.25 + random() * 0.15
    ),
    jsonb_build_object('source', 'seed', 'delta_t', round(((12.0 + 8.0 * sin(extract(hour FROM ts)::float * 3.14159 / 12.0)) - (2.0 + (65.0 - 20.0 * sin(extract(hour FROM ts)::float * 3.14159 / 12.0)) * 0.06))::numeric, 2),
                       'gdd_accumulated', greatest(0, round(((12.0 + 8.0 * sin(extract(hour FROM ts)::float * 3.14159 / 12.0)) - 10.0)::numeric, 2)))
FROM generate_series(
    NOW() - INTERVAL '7 days',
    NOW(),
    INTERVAL '1 hour'
) AS ts;

-- =============================================================================
-- 4. Risk daily states (4 risk codes x 2 parcels x 7 days)
-- =============================================================================
-- Note: risk_daily_states references risk_catalog via risk_code FK.
-- The risk_catalog is populated by migrations 051-054.

INSERT INTO risk_daily_states (tenant_id, entity_id, entity_type, risk_code, probability_score, severity, evaluation_data, timestamp)
SELECT
    'demo-farm',
    entity_id,
    'AgriParcel',
    risk_code,
    CASE
        WHEN risk_code = 'SPRAY_SUITABILITY' THEN 30 + random() * 50
        WHEN risk_code = 'FROST' THEN 5 + random() * 30
        WHEN risk_code = 'WIND_SPRAY' THEN 10 + random() * 40
        WHEN risk_code = 'WATER_STRESS' THEN 15 + random() * 45
    END,
    CASE
        WHEN random() < 0.3 THEN 'low'
        WHEN random() < 0.6 THEN 'medium'
        WHEN random() < 0.85 THEN 'high'
        ELSE 'critical'
    END,
    jsonb_build_object('source', 'seed', 'model_version', '1.0.0'),
    day_ts
FROM
    (VALUES
        ('urn:ngsi-ld:AgriParcel:demo-farm:olite-north'),
        ('urn:ngsi-ld:AgriParcel:demo-farm:olite-south')
    ) AS entities(entity_id),
    (VALUES ('SPRAY_SUITABILITY'), ('FROST'), ('WIND_SPRAY'), ('WATER_STRESS')) AS risks(risk_code),
    generate_series(
        NOW() - INTERVAL '7 days',
        NOW(),
        INTERVAL '1 day'
    ) AS day_ts;

-- =============================================================================
-- 5. Marketplace modules
-- =============================================================================
INSERT INTO marketplace_modules (id, name, display_name, description, remote_entry_url, scope, exposed_module, version, author, category, is_active, metadata)
VALUES
    ('datahub', 'datahub', 'DataHub — Timeseries Canvas', 'Interactive timeseries visualization with multi-series support and Arrow IPC adapter', '/modules/datahub/nkz-module.js', 'datahub', './App', '1.0.0', 'Nekazari', 'analytics', true, '{"slots": ["bottom-panel", "dashboard-widget"]}'::jsonb),
    ('vegetation-prime', 'vegetation-prime', 'Vegetation Health', 'NDVI and vegetation indices from satellite imagery', '/modules/vegetation-prime/nkz-module.js', 'vegetation-prime', './App', '1.0.0', 'Nekazari', 'remote-sensing', true, '{"slots": ["map-layer", "context-panel"]}'::jsonb),
    ('lidar', 'lidar', 'LiDAR Processing', 'Point cloud analysis and terrain modeling with 3D tiles', '/modules/lidar/nkz-module.js', 'lidar', './App', '1.0.0', 'Nekazari', 'remote-sensing', true, '{"slots": ["map-layer", "context-panel"]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 6. Install modules for demo-farm tenant
-- =============================================================================
INSERT INTO tenant_installed_modules (tenant_id, module_id, is_enabled)
VALUES
    ('demo-farm', 'datahub', true),
    ('demo-farm', 'vegetation-prime', true),
    ('demo-farm', 'lidar', true)
ON CONFLICT (tenant_id, module_id) DO NOTHING;

-- =============================================================================
-- 7. Activation code for demo tenant (pre-activated)
-- =============================================================================
INSERT INTO activation_codes (code, email, plan, status, max_users, max_robots, max_sensors, activated_at, duration_days, notes)
VALUES ('NEK-DEMO-FARM-0001', 'demo@nekazari.local', 'premium', 'active', 10, 5, 50, NOW(), 365, 'Demo farm activation code')
ON CONFLICT (code) DO NOTHING;
