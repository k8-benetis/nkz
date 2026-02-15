-- =============================================================================
-- Migration 044: Remove NDVI Module (Replaced by External Module)
-- =============================================================================
-- This migration removes the legacy 'ndvi' module from the platform.
-- The NDVI functionality has been replaced by an external module (vegetation-prime).
--
-- IMPORTANT: This migration does NOT delete:
-- - Database tables (ndvi_jobs, ndvi_results) - These are shared and used by the new module
-- - Backend services (ndvi-worker) - These may still be used by the new module
-- - API endpoints - These are shared infrastructure
--
-- This migration ONLY removes:
-- - Module registration from marketplace_modules
-- - Tenant installations of the ndvi module
--
-- Dependencies: 028_register_platform_addons.sql
-- =============================================================================

-- =============================================================================
-- STEP 1: Check if ndvi module exists and count installations (for logging)
-- =============================================================================
DO $$
DECLARE
    ndvi_exists BOOLEAN;
    installation_count INTEGER;
    jobs_count INTEGER;
    results_count INTEGER;
BEGIN
    -- Check if module exists
    SELECT EXISTS(SELECT 1 FROM marketplace_modules WHERE id = 'ndvi') INTO ndvi_exists;
    
    -- Count installations
    SELECT COUNT(*) INTO installation_count 
    FROM tenant_installed_modules 
    WHERE module_id = 'ndvi';
    
    -- Count data (for information only - we're NOT deleting this)
    SELECT COUNT(*) INTO jobs_count FROM ndvi_jobs WHERE source_module = 'ndvi';
    SELECT COUNT(*) INTO results_count FROM ndvi_results WHERE source_module = 'ndvi';
    
    IF ndvi_exists THEN
        RAISE NOTICE '[Migration 044] Found ndvi module with % tenant installations.', installation_count;
        RAISE NOTICE '[Migration 044] Data preservation: % jobs and % results with source_module=''ndvi'' will remain in database.', jobs_count, results_count;
        RAISE NOTICE '[Migration 044] Tables ndvi_jobs and ndvi_results are NOT deleted (shared infrastructure).';
    ELSE
        RAISE NOTICE '[Migration 044] ndvi module does not exist. Nothing to remove.';
        RETURN;
    END IF;
END $$;

-- =============================================================================
-- STEP 2: Remove ndvi module installations from all tenants
-- =============================================================================
-- This removes the module from tenant configurations but preserves all data
DELETE FROM tenant_installed_modules
WHERE module_id = 'ndvi';

-- =============================================================================
-- STEP 3: Remove ndvi module from marketplace
-- =============================================================================
-- This removes the module registration but preserves all backend infrastructure
DELETE FROM marketplace_modules
WHERE id = 'ndvi';

-- =============================================================================
-- STEP 4: Verify removal (for manual checking)
-- =============================================================================
DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_count 
    FROM marketplace_modules 
    WHERE id = 'ndvi';
    
    IF remaining_count = 0 THEN
        RAISE NOTICE '[Migration 044] ✅ Successfully removed ndvi module registration';
        RAISE NOTICE '[Migration 044] ✅ Database tables (ndvi_jobs, ndvi_results) remain intact';
        RAISE NOTICE '[Migration 044] ✅ Backend services (ndvi-worker) remain intact';
        RAISE NOTICE '[Migration 044] ✅ API endpoints remain intact';
    ELSE
        RAISE WARNING '[Migration 044] ⚠️ ndvi module still exists after deletion attempt';
    END IF;
END $$;

-- =============================================================================
-- Verification queries (for manual checking after migration)
-- =============================================================================
-- Run these queries to verify:
--
-- -- Check that ndvi module is removed:
-- SELECT id, display_name, is_active FROM marketplace_modules WHERE id = 'ndvi';
-- -- Should return 0 rows
--
-- -- Check that tables still exist (they should):
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_name IN ('ndvi_jobs', 'ndvi_results');
-- -- Should return 2 rows
--
-- -- Check that data is preserved:
-- SELECT source_module, COUNT(*) 
-- FROM ndvi_jobs 
-- GROUP BY source_module;
-- -- Should show data with source_module='ndvi' (if any exists)
--
-- -- Check no tenant installations of ndvi remain:
-- SELECT tenant_id, module_id 
-- FROM tenant_installed_modules 
-- WHERE module_id = 'ndvi';
-- -- Should return 0 rows
--
-- -- Verify new external module exists (should be vegetation-prime or similar):
-- SELECT id, display_name, is_local, remote_entry_url 
-- FROM marketplace_modules 
-- WHERE id LIKE '%vegetation%' OR id LIKE '%ndvi%';
-- -- Should show the new external module, not 'ndvi'

-- =============================================================================
-- End of migration 044
-- =============================================================================

