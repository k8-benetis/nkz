-- =============================================================================
-- Migration 026: Extend Module Federation with Addons Support
-- =============================================================================
-- Adds explicit columns for route_path and label to marketplace_modules.
-- Previously these were stored only in the metadata JSONB field.
-- Explicit columns improve query performance and schema clarity.
--
-- Also seeds the first addon module: ornito-radar
--
-- Dependencies: 024_module_federation_registry.sql
-- =============================================================================

-- Add new columns if they don't exist
DO $$ 
BEGIN
    -- route_path: The frontend route for this module (e.g., /ornito)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketplace_modules' AND column_name = 'route_path'
    ) THEN
        ALTER TABLE marketplace_modules ADD COLUMN route_path TEXT;
    END IF;

    -- label: Display label for navigation
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketplace_modules' AND column_name = 'label'
    ) THEN
        ALTER TABLE marketplace_modules ADD COLUMN label TEXT;
    END IF;

    -- module_type: Classification (CORE, ADDON_FREE, ADDON_PAID, ENTERPRISE)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketplace_modules' AND column_name = 'module_type'
    ) THEN
        ALTER TABLE marketplace_modules ADD COLUMN module_type TEXT DEFAULT 'ADDON_FREE';
    END IF;

    -- required_plan_type: Minimum tenant plan required (basic, premium, enterprise)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketplace_modules' AND column_name = 'required_plan_type'
    ) THEN
        ALTER TABLE marketplace_modules ADD COLUMN required_plan_type TEXT DEFAULT 'basic';
    END IF;

    -- pricing_tier: Pricing classification (FREE, PAID, ENTERPRISE_ONLY)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketplace_modules' AND column_name = 'pricing_tier'
    ) THEN
        ALTER TABLE marketplace_modules ADD COLUMN pricing_tier TEXT DEFAULT 'FREE';
    END IF;
END $$;

-- Update existing rows to populate route_path from metadata if null
UPDATE marketplace_modules 
SET route_path = COALESCE(
    metadata->>'routePath',
    '/' || REPLACE(name, '-', '')
)
WHERE route_path IS NULL;

-- Update label from metadata or display_name
UPDATE marketplace_modules 
SET label = COALESCE(
    metadata->>'label',
    display_name
)
WHERE label IS NULL;

-- Create index on route_path for faster lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_modules_route_path 
ON marketplace_modules(route_path);

-- =============================================================================
-- SEED DATA: Ornito Radar Module
-- =============================================================================
-- First federated addon module for biodiversity/bird identification

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
    icon_url,
    route_path,
    label,
    module_type,
    required_plan_type,
    pricing_tier,
    is_active,
    required_roles,
    metadata
) VALUES (
    'ornito-radar',
    'ornito-radar',
    'Ornito Biodiversity',
    'Bird identification and biodiversity radar for natural pest control. Identify beneficial birds in your agricultural parcels.',
    '/modules/ornito-radar/assets/remoteEntry.js',
    'ornito_module',
    './OrnitoApp',
    '1.0.0',
    'Nekazari Team',
    'biodiversity',
    NULL,
    '/ornito',
    'Ornito Radar',
    'ADDON_FREE',
    'basic',
    'FREE',
    true,
    ARRAY['Farmer', 'TenantAdmin', 'TechnicalConsultant', 'PlatformAdmin'],
    '{
        "icon": "🐦",
        "color": "#10B981",
        "shortDescription": "Bird identification for pest control",
        "features": ["Bird identification", "Biodiversity index", "Pest control recommendations"],
        "navigationItems": [
            {
                "path": "/ornito",
                "label": "Ornito Radar",
                "icon": "bird"
            }
        ]
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    remote_entry_url = EXCLUDED.remote_entry_url,
    scope = EXCLUDED.scope,
    exposed_module = EXCLUDED.exposed_module,
    route_path = EXCLUDED.route_path,
    label = EXCLUDED.label,
    module_type = EXCLUDED.module_type,
    is_active = EXCLUDED.is_active,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- AUTO-INSTALL: Install ornito-radar for all existing tenants (FREE addon)
-- =============================================================================
-- Since ornito-radar is ADDON_FREE, we auto-install it for all tenants
-- This ensures the module appears immediately for all users

INSERT INTO tenant_installed_modules (tenant_id, module_id, is_enabled, configuration)
SELECT DISTINCT 
    t.id as tenant_id,
    'ornito-radar' as module_id,
    true as is_enabled,
    '{}'::jsonb as configuration
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM tenant_installed_modules tim 
    WHERE tim.tenant_id = t.id AND tim.module_id = 'ornito-radar'
)
ON CONFLICT (tenant_id, module_id) DO NOTHING;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON COLUMN marketplace_modules.route_path IS 'Frontend route path for this module (e.g., /ornito)';
COMMENT ON COLUMN marketplace_modules.label IS 'Display label for navigation menus';
COMMENT ON COLUMN marketplace_modules.module_type IS 'Classification: CORE, ADDON_FREE, ADDON_PAID, ENTERPRISE';
COMMENT ON COLUMN marketplace_modules.required_plan_type IS 'Minimum tenant plan: basic, premium, enterprise';
COMMENT ON COLUMN marketplace_modules.pricing_tier IS 'Pricing: FREE, PAID, ENTERPRISE_ONLY';
