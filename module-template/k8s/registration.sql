-- =============================================================================
-- MODULE_DISPLAY_NAME Module Registration
-- =============================================================================
-- Register MODULE_DISPLAY_NAME module in the marketplace_modules table
-- =============================================================================

INSERT INTO marketplace_modules (
    id,
    name,
    display_name,
    description,
    remote_entry_url,
    scope,
    exposed_module,
    version,
    author,
    category,
    route_path,
    label,
    module_type,
    required_plan_type,
    pricing_tier,
    is_local,
    is_active,
    required_roles,
    metadata
) VALUES (
    'MODULE_NAME',
    'MODULE_NAME',
    'MODULE_DISPLAY_NAME',
    'MODULE_DISPLAY_NAME - Description of your module',
    'https://nekazari.robotika.cloud/modules/MODULE_NAME/assets/remoteEntry.js',
    'MODULE_SCOPE',
    './App',
    '1.0.0',
    'Your Name',
    'analytics',
    '/MODULE_ROUTE',
    'MODULE_DISPLAY_NAME',
    'ADDON_PAID',
    'premium',
    'PAID',
    false,
    true,
    ARRAY['Farmer', 'TenantAdmin', 'PlatformAdmin'],
    '{"icon": "🔧", "color": "#3B82F6"}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    remote_entry_url = EXCLUDED.remote_entry_url,
    scope = EXCLUDED.scope,
    exposed_module = EXCLUDED.exposed_module,
    is_active = true,
    updated_at = NOW();

