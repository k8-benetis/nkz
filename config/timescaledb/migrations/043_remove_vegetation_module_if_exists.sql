-- =============================================================================
-- Migration 043: Remove vegetation Module if Exists
-- =============================================================================
-- This migration removes the obsolete 'vegetation' module (without '-prime')
-- if it exists in the database. Only 'vegetation-prime' should exist.
--
-- Dependencies: 028_register_platform_addons.sql
-- =============================================================================

-- =============================================================================
-- STEP 1: Check if vegetation module exists (for logging)
-- =============================================================================
DO $$
DECLARE
    vegetation_exists BOOLEAN;
    installation_count INTEGER;
BEGIN
    -- Check if module exists
    SELECT EXISTS(SELECT 1 FROM marketplace_modules WHERE id = 'vegetation') INTO vegetation_exists;
    
    -- Count installations
    SELECT COUNT(*) INTO installation_count FROM tenant_installed_modules WHERE module_id = 'vegetation';
    
    IF vegetation_exists THEN
        RAISE NOTICE '[Migration 043] Found vegetation module with % tenant installations. Removing...', installation_count;
    ELSE
        RAISE NOTICE '[Migration 043] vegetation module does not exist. Nothing to remove.';
        RETURN;
    END IF;
END $$;

-- =============================================================================
-- STEP 2: Remove vegetation module installations from all tenants
-- =============================================================================
DELETE FROM tenant_installed_modules
WHERE module_id = 'vegetation';

-- =============================================================================
-- STEP 3: Remove vegetation module from marketplace
-- =============================================================================
DELETE FROM marketplace_modules
WHERE id = 'vegetation';

-- =============================================================================
-- STEP 4: Verify removal (for manual checking)
-- =============================================================================
DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_count 
    FROM marketplace_modules 
    WHERE id = 'vegetation';
    
    IF remaining_count = 0 THEN
        RAISE NOTICE '[Migration 043] ✅ Successfully removed vegetation module';
    ELSE
        RAISE WARNING '[Migration 043] ⚠️ vegetation module still exists after deletion attempt';
    END IF;
END $$;

-- =============================================================================
-- Verification queries (for manual checking after migration)
-- =============================================================================
-- Run these queries to verify:
--
-- -- Check that vegetation module is removed:
-- SELECT id, display_name, is_active FROM marketplace_modules WHERE id = 'vegetation';
-- -- Should return 0 rows
--
-- -- Check that vegetation-prime still exists (it should):
-- SELECT id, display_name, is_active, is_local, remote_entry_url 
-- FROM marketplace_modules WHERE id = 'vegetation-prime';
-- -- Should return 1 row with is_local = false and remote_entry_url set
--
-- -- Check no tenant installations of vegetation remain:
-- SELECT tenant_id, module_id FROM tenant_installed_modules WHERE module_id = 'vegetation';
-- -- Should return 0 rows

-- =============================================================================
-- End of migration 043
-- =============================================================================

