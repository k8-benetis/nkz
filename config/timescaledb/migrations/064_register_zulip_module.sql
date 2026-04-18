-- =============================================================================
-- Migration 064: Register Zulip Communications Module
-- =============================================================================
-- Registers the Zulip module in the marketplace and auto-installs for tenants.
-- Zulip replaces Mattermost as the platform's communications backbone.
--
-- Module type: IIFE remote (loaded from MinIO via /modules/zulip/nkz-module.js)
-- Frontend: iframe wrapper pointing to messaging.robotika.cloud
-- Backend: Zulip 9.4 server (dedicated deployment in nekazari namespace)
--
-- Dependencies: 024_module_federation_registry.sql, 026, 027
-- =============================================================================

-- Deactivate Mattermost if it exists (replaced by Zulip)
UPDATE marketplace_modules
SET is_active = false, updated_at = NOW()
WHERE id = 'mattermost';

-- Register Zulip module
INSERT INTO marketplace_modules (
    id, name, display_name, description,
    is_local, remote_entry_url, scope, exposed_module,
    route_path, label, version, author, category,
    module_type, required_plan_type, pricing_tier,
    is_active, required_roles, metadata
) VALUES (
    'zulip',
    'nkz-module-zulip',
    'Comunicaciones',
    'Sovereign messaging platform with IoT alert integration for team collaboration. Stream/topic model, webhooks, and full-text search.',
    false,
    '/modules/zulip/nkz-module.js',
    'zulip', './App',
    '/communications',
    'Comunicaciones',
    '0.1.0',
    'nkz-os',
    'communications',
    'ADDON_FREE',
    'basic',
    'FREE',
    true,
    ARRAY['Farmer', 'TenantAdmin', 'TechnicalConsultant', 'PlatformAdmin', 'DeviceManager'],
    '{
        "icon": "message-circle",
        "color": "#6366F1",
        "shortDescription": "Team messaging and IoT alerts",
        "features": ["Stream/topic messaging", "Webhook integrations", "Full-text search", "IoT alert channels"],
        "backend_service": "zulip",
        "externalUrl": "https://messaging.robotika.cloud"
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_local = EXCLUDED.is_local,
    remote_entry_url = EXCLUDED.remote_entry_url,
    route_path = EXCLUDED.route_path,
    label = EXCLUDED.label,
    module_type = EXCLUDED.module_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Auto-install for all existing tenants (FREE addon)
INSERT INTO tenant_installed_modules (tenant_id, module_id, is_enabled, configuration)
SELECT
    t.tenant_id,
    'zulip' AS module_id,
    true AS is_enabled,
    '{}'::jsonb AS configuration
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM tenant_installed_modules tim
    WHERE tim.tenant_id = t.tenant_id AND tim.module_id = 'zulip'
)
ON CONFLICT (tenant_id, module_id) DO NOTHING;

-- =============================================================================
-- End of migration 064
-- =============================================================================
