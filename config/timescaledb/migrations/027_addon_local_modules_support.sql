-- =============================================================================
-- Migration 027: Add Local Module Support for Addons
-- =============================================================================
-- Adds support for distinguishing between:
-- - LOCAL modules: Bundled with the host application (lazy routes)
-- - REMOTE modules: Loaded via URL from modules-server or external URLs
--
-- This enables a hybrid architecture where:
-- 1. Internal addons (like ornito-radar) are bundled for performance
-- 2. Third-party addons can be deployed to modules-server and loaded remotely
-- 3. External addons can be hosted on their own infrastructure
--
-- Dependencies: 026_extend_module_federation_addons.sql
-- =============================================================================

-- Add is_local column to distinguish bundled vs remote modules
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketplace_modules' AND column_name = 'is_local'
    ) THEN
        ALTER TABLE marketplace_modules ADD COLUMN is_local BOOLEAN DEFAULT false;
        COMMENT ON COLUMN marketplace_modules.is_local IS 
            'True = bundled with host (lazy route), False = loaded via remote_entry_url';
    END IF;
END $$;

-- =============================================================================
-- UPDATE: Mark ornito-radar as LOCAL module
-- =============================================================================
-- Since ornito-radar is now bundled with the host application,
-- we mark it as local and clear the remote_entry_url (not needed)

UPDATE marketplace_modules 
SET 
    is_local = true,
    remote_entry_url = NULL,
    scope = NULL,
    exposed_module = NULL,
    updated_at = NOW()
WHERE id = 'ornito-radar';

-- =============================================================================
-- Create index for faster local/remote filtering
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_marketplace_modules_is_local 
ON marketplace_modules(is_local);

-- =============================================================================
-- Documentation: Module Types
-- =============================================================================
-- 
-- LOCAL MODULES (is_local = true):
--   - Bundled with host at build time
--   - Listed in apps/host/src/config/localAddons.ts
--   - Fast loading (no network request for code)
--   - remote_entry_url, scope, exposed_module can be NULL
--
-- REMOTE MODULES (is_local = false):
--   - Loaded via remote_entry_url at runtime
--   - Can be:
--     a) Deployed to modules-server (internal hosting)
--     b) Hosted externally (third-party URL)
--   - Requires: remote_entry_url, scope, exposed_module
--
-- =============================================================================
