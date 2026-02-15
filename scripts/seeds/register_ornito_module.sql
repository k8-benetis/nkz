-- =============================================================================
-- Seed Script: Register Ornito-Radar Module
-- =============================================================================
-- Registers the Ornito-Radar module in the marketplace_modules table
-- This module helps farmers identify beneficial birds for biological pest control
--
-- Dependencies: Requires migration 024_module_federation_registry.sql
--                and 025_tenant_governance.sql for governance fields
-- =============================================================================

-- Insert Ornito-Radar module
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
    is_active,
    is_local,
    required_roles,
    module_type,
    required_plan_type,
    pricing_tier,
    metadata,
    route_path,
    label,
    created_by
) VALUES (
    'ornito-radar',
    'ornito-radar',
    'Ornito-Radar: Aliados del Cultivo',
    'Módulo de identificación de aves beneficiosas para el control biológico de plagas. Ayuda a los agricultores a reconocer y atraer aves que actúan como depredadores naturales de insectos y roedores perjudiciales.',
    '/modules/ornito-radar/assets/remoteEntry.js', -- Served from modules-server
    'ornito_module',
    './OrnitoApp',
    '1.0.0',
    'Nekazari Platform',
    'biodiversity',
    'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=64&h=64&fit=crop', -- Icon placeholder
    true, -- Active by default
    false, -- is_local: REMOTE module (served from modules-server)
    ARRAY['Farmer', 'TenantAdmin', 'TechnicalConsultant', 'PlatformAdmin']::TEXT[], -- Available to all roles
    'ADDON_FREE', -- Free addon for all users
    'basic', -- Available from basic plan
    'FREE', -- Free pricing tier
    jsonb_build_object(
        'routePath', '/ornito',
        'displayName', 'Ornito-Radar',
        'icon', 'Bird',
        'description', 'Identificación de aves beneficiosas para control biológico',
        'tags', ARRAY['biodiversity', 'pest-control', 'birds', 'biological-control']::TEXT[]
    ),
    '/ornito', -- route_path
    'Ornito-Radar', -- label
    'system' -- Created by system
)
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    remote_entry_url = EXCLUDED.remote_entry_url,
    scope = EXCLUDED.scope,
    exposed_module = EXCLUDED.exposed_module,
    version = EXCLUDED.version,
    module_type = EXCLUDED.module_type,
    required_plan_type = EXCLUDED.required_plan_type,
    pricing_tier = EXCLUDED.pricing_tier,
    metadata = EXCLUDED.metadata,
    is_active = EXCLUDED.is_active,
    is_local = EXCLUDED.is_local,
    route_path = EXCLUDED.route_path,
    label = EXCLUDED.label,
    updated_at = NOW();

-- Verify insertion
SELECT 
    id,
    display_name,
    module_type,
    required_plan_type,
    pricing_tier,
    is_active,
    metadata->>'routePath' as route_path
FROM marketplace_modules
WHERE id = 'ornito-radar';

-- =============================================================================
-- Seed Complete
-- =============================================================================
-- After deployment to Vercel, update remote_entry_url with the actual URL:
-- UPDATE marketplace_modules 
-- SET remote_entry_url = 'https://ornito-radar.robotika.cloud/assets/remoteEntry.js'
-- WHERE id = 'ornito-radar';
