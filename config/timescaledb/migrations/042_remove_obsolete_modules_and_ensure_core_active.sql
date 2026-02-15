-- =============================================================================
-- Migration 042: Remove Obsolete Modules and Ensure Core Modules Active
-- =============================================================================
-- This migration:
-- 1. Removes obsolete modules (vegetation-health, ornito-radar) from marketplace
-- 2. Removes their installations from all tenants
-- 3. Ensures all core platform modules are active and properly configured
-- 4. Auto-installs FREE core modules for all existing tenants
--
-- Dependencies: 028_register_platform_addons.sql
-- =============================================================================

-- =============================================================================
-- STEP 1: Remove obsolete modules from tenant installations
-- =============================================================================
-- First, remove installations of obsolete modules from all tenants
DELETE FROM tenant_installed_modules
WHERE module_id IN ('vegetation-health', 'ornito-radar');

-- =============================================================================
-- STEP 2: Remove obsolete modules from marketplace
-- =============================================================================
-- Remove vegetation-health and ornito-radar from marketplace_modules
DELETE FROM marketplace_modules
WHERE id IN ('vegetation-health', 'ornito-radar');

-- =============================================================================
-- STEP 3: Ensure all core platform modules are active
-- =============================================================================
-- Activate all core modules that should be available
UPDATE marketplace_modules
SET is_active = true,
    updated_at = NOW()
WHERE id IN (
    'weather',
    'sensors',
    'robots',
    'simulation',
    'risks',
    'ndvi',
    'predictions',
    'parcels',
    'entities'
)
AND is_active = false;

-- =============================================================================
-- STEP 4: Ensure core modules have correct configuration
-- =============================================================================
-- Update module_type for core features (parcels, entities) to CORE if needed
-- Note: Keeping them as ADDON_FREE is fine, but ensuring they're properly configured

-- Ensure parcels is marked as core feature
UPDATE marketplace_modules
SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{is_core_feature}',
    'true'::jsonb
)
WHERE id = 'parcels';

-- Ensure entities is marked as core feature
UPDATE marketplace_modules
SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{is_core_feature}',
    'true'::jsonb
)
WHERE id = 'entities';

-- =============================================================================
-- STEP 5: Auto-install FREE core modules for all existing tenants
-- =============================================================================
-- Install FREE addons (weather, sensors, parcels, entities) for all tenants
-- that don't already have them installed
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
  AND m.id IN ('weather', 'sensors', 'parcels', 'entities')
  AND NOT EXISTS (
      SELECT 1 FROM tenant_installed_modules tim 
      WHERE tim.tenant_id = t.tenant_id AND tim.module_id = m.id
  )
ON CONFLICT (tenant_id, module_id) DO NOTHING;

-- =============================================================================
-- STEP 6: Log the cleanup
-- =============================================================================
-- Create a comment to document this migration
COMMENT ON TABLE marketplace_modules IS 
    'Marketplace modules registry. Obsolete modules (vegetation-health, ornito-radar) removed in migration 042.';

-- =============================================================================
-- Verification queries (for manual checking after migration)
-- =============================================================================
-- Run these queries to verify the migration:
--
-- -- Check that obsolete modules are removed:
-- SELECT id, display_name, is_active FROM marketplace_modules 
-- WHERE id IN ('vegetation-health', 'ornito-radar');
-- -- Should return 0 rows
--
-- -- Check that core modules are active:
-- SELECT id, display_name, is_active, module_type, pricing_tier 
-- FROM marketplace_modules 
-- WHERE id IN ('weather', 'sensors', 'robots', 'simulation', 'risks', 'ndvi', 'predictions', 'parcels', 'entities')
-- ORDER BY id;
-- -- All should have is_active = true
--
-- -- Check tenant installations of FREE modules:
-- SELECT t.tenant_id, tim.module_id, tim.is_enabled
-- FROM tenants t
-- INNER JOIN tenant_installed_modules tim ON t.tenant_id = tim.tenant_id
-- INNER JOIN marketplace_modules m ON tim.module_id = m.id
-- WHERE m.pricing_tier = 'FREE' AND m.is_active = true
-- ORDER BY t.tenant_id, tim.module_id;
-- -- Should show all tenants have FREE modules installed

-- =============================================================================
-- End of migration 042
-- =============================================================================


