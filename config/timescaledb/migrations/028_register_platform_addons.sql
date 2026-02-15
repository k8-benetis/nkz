-- =============================================================================
-- Migration 028: Register Platform Addons in Marketplace
-- =============================================================================
-- Registers all existing platform addons in marketplace_modules table.
-- This enables the Modules management UI to display and control these addons.
--
-- Addon Categories:
-- - ADDON_FREE: Available to all plans at no extra cost
-- - ADDON_PAID: Requires premium plan
-- - ENTERPRISE: Requires enterprise plan
--
-- Dependencies: 027_addon_local_modules_support.sql
-- =============================================================================

-- =============================================================================
-- WEATHER ADDON (FREE - basic plan)
-- =============================================================================
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'weather',
    'weather',
    'Weather Intelligence',
    'Real-time and forecast weather data from AEMET and OpenMeteo. Includes temperature, humidity, precipitation, wind, solar radiation, and agroclimatic indices (GDD, ET₀).',
    true,  -- LOCAL: bundled with host
    NULL, NULL, NULL,
    '/weather',
    'Weather',
    '1.0.0',
    'Nekazari Team',
    'weather',
    'ADDON_FREE',
    'basic',
    'FREE',
    true,
    ARRAY['Farmer', 'TenantAdmin', 'TechnicalConsultant', 'PlatformAdmin'],
    '{
        "icon": "cloud",
        "color": "#3B82F6",
        "shortDescription": "Weather data and forecasts",
        "features": ["Real-time weather", "14-day forecast", "AEMET alerts", "Agroclimatic indices"],
        "backend_service": "weather-worker"
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    label = EXCLUDED.label,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- NDVI ADDON (PAID - premium plan)
-- =============================================================================
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'ndvi',
    'ndvi',
    'Satellite NDVI Analysis',
    'Process Sentinel-2 satellite imagery for vegetation indices (NDVI, SAVI, EVI). Monitor crop health and detect stress early.',
    true,
    NULL, NULL, NULL,
    '/ndvi',
    'NDVI',
    '1.0.0',
    'Nekazari Team',
    'analytics',
    'ADDON_PAID',
    'premium',
    'PAID',
    true,
    ARRAY['Farmer', 'TenantAdmin', 'TechnicalConsultant', 'PlatformAdmin'],
    '{
        "icon": "satellite",
        "color": "#10B981",
        "shortDescription": "Satellite vegetation analysis",
        "features": ["NDVI index", "SAVI index", "EVI index", "Historical trends", "Anomaly detection"],
        "backend_services": ["ndvi-service", "ndvi-worker"],
        "external_dependencies": ["Copernicus CDSE"]
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- RISK ASSESSMENT ADDON (PAID - premium plan)
-- =============================================================================
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'risks',
    'risks',
    'Risk Assessment',
    'Agricultural risk analysis including pest risk, frost risk, drought risk, and energy production forecasts. Get alerts before problems occur.',
    true,
    NULL, NULL, NULL,
    '/risks',
    'Risks',
    '1.0.0',
    'Nekazari Team',
    'analytics',
    'ADDON_PAID',
    'premium',
    'PAID',
    true,
    ARRAY['Farmer', 'TenantAdmin', 'TechnicalConsultant', 'PlatformAdmin'],
    '{
        "icon": "alert",
        "color": "#F59E0B",
        "shortDescription": "Agricultural risk analysis",
        "features": ["Pest risk prediction", "Frost alerts", "Drought monitoring", "Energy forecasting"],
        "backend_services": ["risk-api", "risk-orchestrator", "risk-worker"],
        "dependencies": ["weather"]
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- SIMULATION ADDON (PAID - premium plan)
-- =============================================================================
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'simulation',
    'simulation',
    'Agricultural Simulation',
    'Run what-if scenarios for irrigation, fertilization, and harvest timing. Optimize your agricultural decisions with data-driven simulations.',
    true,
    NULL, NULL, NULL,
    '/simulation',
    'Simulation',
    '1.0.0',
    'Nekazari Team',
    'simulation',
    'ADDON_PAID',
    'premium',
    'PAID',
    true,
    ARRAY['Farmer', 'TenantAdmin', 'TechnicalConsultant', 'PlatformAdmin'],
    '{
        "icon": "line-chart",
        "color": "#8B5CF6",
        "shortDescription": "Agricultural scenario simulation",
        "features": ["Irrigation simulation", "Yield prediction", "What-if scenarios", "Cost optimization"],
        "backend_service": "simulation-service"
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- SENSORS ADDON (FREE - basic plan)
-- =============================================================================
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'sensors',
    'sensors',
    'Sensor Management',
    'Manage IoT sensors for soil moisture, temperature, humidity, and more. Real-time telemetry visualization and historical data.',
    true,
    NULL, NULL, NULL,
    '/sensors',
    'Sensors',
    '1.0.0',
    'Nekazari Team',
    'iot',
    'ADDON_FREE',
    'basic',
    'FREE',
    true,
    ARRAY['DeviceManager', 'TenantAdmin', 'PlatformAdmin'],
    '{
        "icon": "gauge",
        "color": "#06B6D4",
        "shortDescription": "IoT sensor management",
        "features": ["Real-time telemetry", "Sensor provisioning", "Historical data", "Alert thresholds"],
        "backend_service": "sensor-ingestor"
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- ROBOTS ADDON (ENTERPRISE)
-- =============================================================================
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'robots',
    'robots',
    'Agricultural Robotics',
    'Monitor and control autonomous agricultural robots. Real-time telemetry, mission planning, and ROS2 integration.',
    true,
    NULL, NULL, NULL,
    '/robots',
    'Robots',
    '1.0.0',
    'Nekazari Team',
    'robotics',
    'ENTERPRISE',
    'enterprise',
    'ENTERPRISE_ONLY',
    true,
    ARRAY['DeviceManager', 'TenantAdmin', 'PlatformAdmin'],
    '{
        "icon": "bot",
        "color": "#EC4899",
        "shortDescription": "Autonomous robot management",
        "features": ["Real-time tracking", "Mission planning", "ROS2 integration", "Telemetry visualization"],
        "backend_services": ["ros2-fiware-bridge", "ros2-web-bridge"],
        "requires_vpn": true
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- PREDICTIONS/AI ADDON (PAID - premium plan)
-- =============================================================================
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'predictions',
    'predictions',
    'AI Predictions',
    'Machine learning predictions for yield, pest outbreaks, and optimal harvest timing. Trained on your historical data.',
    true,
    NULL, NULL, NULL,
    '/predictions',
    'Predictions',
    '1.0.0',
    'Nekazari Team',
    'analytics',
    'ADDON_PAID',
    'premium',
    'PAID',
    true,
    ARRAY['Farmer', 'TenantAdmin', 'TechnicalConsultant', 'PlatformAdmin'],
    '{
        "icon": "brain",
        "color": "#7C3AED",
        "shortDescription": "AI-powered predictions",
        "features": ["Yield prediction", "Pest outbreak alerts", "Harvest timing", "Custom ML models"],
        "status": "beta"
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- PARCELS ADDON (FREE - basic plan, but CORE feature)
-- =============================================================================
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'parcels',
    'parcels',
    'Parcel Management',
    'Manage your agricultural parcels with cadastral integration. Import from Spanish Catastro or draw manually on the map.',
    true,
    NULL, NULL, NULL,
    '/parcels',
    'Parcels',
    '1.0.0',
    'Nekazari Team',
    'core',
    'ADDON_FREE',
    'basic',
    'FREE',
    true,
    ARRAY['Farmer', 'TenantAdmin', 'PlatformAdmin'],
    '{
        "icon": "map",
        "color": "#22C55E",
        "shortDescription": "Agricultural parcel management",
        "features": ["Cadastral import", "Manual drawing", "Area calculation", "Crop assignment"],
        "is_core_feature": true
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- ENTITIES ADDON (FREE - basic plan, but CORE feature)
-- =============================================================================
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'entities',
    'entities',
    'Entity Explorer',
    'Browse and manage NGSI-LD entities in the Context Broker. View all your connected devices, sensors, and data in one place.',
    true,
    NULL, NULL, NULL,
    '/entities',
    'Entities',
    '1.0.0',
    'Nekazari Team',
    'core',
    'ADDON_FREE',
    'basic',
    'FREE',
    true,
    ARRAY['Farmer', 'DeviceManager', 'TenantAdmin', 'PlatformAdmin'],
    '{
        "icon": "layers",
        "color": "#6366F1",
        "shortDescription": "NGSI-LD entity explorer",
        "features": ["Entity browser", "Attribute viewer", "Relationship explorer", "FIWARE integration"],
        "is_core_feature": true
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- AUTO-INSTALL FREE ADDONS FOR ALL TENANTS
-- =============================================================================
-- Install FREE addons (weather, sensors, parcels, entities) for all existing tenants

INSERT INTO tenant_installed_modules (tenant_id, module_id, is_enabled, configuration)
SELECT 
    t.tenant_id,
    m.id as module_id,
    true as is_enabled,
    '{}'::jsonb as configuration
FROM tenants t
CROSS JOIN marketplace_modules m
WHERE m.pricing_tier = 'FREE'
  AND m.is_active = true
  AND NOT EXISTS (
      SELECT 1 FROM tenant_installed_modules tim 
      WHERE tim.tenant_id = t.tenant_id AND tim.module_id = m.id
  )
ON CONFLICT (tenant_id, module_id) DO NOTHING;

-- =============================================================================
-- Update ornito-radar metadata to include proper icon
-- =============================================================================
UPDATE marketplace_modules 
SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{icon}',
    '"bird"'
)
WHERE id = 'ornito-radar';

-- =============================================================================
-- Create index for faster module queries by category and plan
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_marketplace_modules_category 
ON marketplace_modules(category);

CREATE INDEX IF NOT EXISTS idx_marketplace_modules_pricing 
ON marketplace_modules(pricing_tier, required_plan_type);

-- =============================================================================
-- End of migration 028
-- =============================================================================
