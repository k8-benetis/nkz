-- =============================================================================
-- Migration 031: Convert Ornito-Radar to Remote Module
-- =============================================================================
-- Converts ornito-radar from local (bundled) to remote (Module Federation)
-- This allows the module to be updated independently without rebuilding the host
--
-- Changes:
-- - Set is_local = false
-- - Set remote_entry_url = '/modules/ornito-radar/assets/remoteEntry.js'
-- - Set scope = 'ornito_module'
-- - Set exposed_module = './OrnitoApp'
-- - Update metadata with improved information
--
-- Dependencies: 027_addon_local_modules_support.sql
-- =============================================================================

-- =============================================================================
-- UPDATE: Convert ornito-radar to REMOTE module
-- =============================================================================
UPDATE marketplace_modules 
SET 
    is_local = false,
    remote_entry_url = '/modules/ornito-radar/assets/remoteEntry.js',
    scope = 'ornito_module',
    exposed_module = './OrnitoApp',
    display_name = 'Ornito Biodiversity',
    description = 'Identificación profesional de aves beneficiosas para control biológico de plagas. Incluye búsqueda avanzada, filtros por tipo de control y temporada, información detallada de cada especie, y reproducción de cantos desde Xeno-canto.',
    metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{icon}',
        '"bird"'
    ) || jsonb_build_object(
        'color', '#10B981',
        'shortDescription', 'Identificación de aves aliadas del cultivo',
        'features', jsonb_build_array(
            'Búsqueda avanzada',
            'Filtros por tipo de control',
            'Información detallada de especies',
            'Reproducción de cantos',
            'Estadísticas de control biológico'
        ),
        'version', '2.0.0',
        'improvements', jsonb_build_array(
            'UI profesional y elegante',
            'Búsqueda y filtros avanzados',
            'Modal de detalles mejorado',
            'Más especies documentadas',
            'Estadísticas visuales'
        )
    ),
    updated_at = NOW()
WHERE id = 'ornito-radar';

-- =============================================================================
-- VERIFY: Ensure the module exists
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM marketplace_modules WHERE id = 'ornito-radar') THEN
        -- If module doesn't exist, create it
        INSERT INTO marketplace_modules (
            id, name, display_name, description,
            is_local, remote_entry_url, scope, exposed_module,
            route_path, label, version, author, category,
            module_type, required_plan_type, pricing_tier,
            is_active, required_roles, metadata
        ) VALUES (
            'ornito-radar',
            'ornito-radar',
            'Ornito Biodiversity',
            'Identificación profesional de aves beneficiosas para control biológico de plagas. Incluye búsqueda avanzada, filtros por tipo de control y temporada, información detallada de cada especie, y reproducción de cantos desde Xeno-canto.',
            false,  -- REMOTE module
            '/modules/ornito-radar/assets/remoteEntry.js',
            'ornito_module',
            './OrnitoApp',
            '/ornito',
            'Ornito Radar',
            '2.0.0',
            'Nekazari Team',
            'biodiversity',
            'ADDON_FREE',
            'basic',
            'FREE',
            true,
            ARRAY['Farmer', 'TenantAdmin', 'TechnicalConsultant', 'PlatformAdmin'],
            '{
                "icon": "bird",
                "color": "#10B981",
                "shortDescription": "Identificación de aves aliadas del cultivo",
                "features": [
                    "Búsqueda avanzada",
                    "Filtros por tipo de control",
                    "Información detallada de especies",
                    "Reproducción de cantos",
                    "Estadísticas de control biológico"
                ],
                "version": "2.0.0",
                "improvements": [
                    "UI profesional y elegante",
                    "Búsqueda y filtros avanzados",
                    "Modal de detalles mejorado",
                    "Más especies documentadas",
                    "Estadísticas visuales"
                ]
            }'::jsonb
        );
    END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON COLUMN marketplace_modules.is_local IS 
    'True = bundled with host (lazy route), False = loaded via remote_entry_url';
COMMENT ON COLUMN marketplace_modules.remote_entry_url IS 
    'URL to remoteEntry.js for Module Federation (NULL for local modules)';
COMMENT ON COLUMN marketplace_modules.scope IS 
    'Module Federation scope name (NULL for local modules)';
COMMENT ON COLUMN marketplace_modules.exposed_module IS 
    'Exposed module path in remoteEntry.js (NULL for local modules)';























