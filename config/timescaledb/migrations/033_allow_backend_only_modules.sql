-- =============================================================================
-- Migration: Allow Backend-Only Modules in Marketplace
-- =============================================================================
-- Allow NULL values in remote_entry_url, scope, and exposed_module
-- to support backend-only modules (modules without frontend).
-- =============================================================================

-- Allow NULL for backend-only modules
ALTER TABLE marketplace_modules 
    ALTER COLUMN remote_entry_url DROP NOT NULL,
    ALTER COLUMN scope DROP NOT NULL,
    ALTER COLUMN exposed_module DROP NOT NULL;

-- Add comment explaining the change
COMMENT ON COLUMN marketplace_modules.remote_entry_url IS 'URL for module federation entry point. NULL for backend-only modules.';
COMMENT ON COLUMN marketplace_modules.scope IS 'Module federation scope. NULL for backend-only modules.';
COMMENT ON COLUMN marketplace_modules.exposed_module IS 'Exposed module name for module federation. NULL for backend-only modules.';

