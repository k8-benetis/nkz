-- =============================================================================
-- Migration 055: vegetation-prime IIFE bundle URL
-- =============================================================================
-- Updates vegetation-prime to use the IIFE bundle path instead of the legacy
-- Module Federation remoteEntry.js. Required after migration to IIFE (2026-02-18).
--
-- Before: /modules/vegetation-prime/assets/remoteEntry.js
-- After:  /modules/vegetation-prime/nkz-module.js
-- =============================================================================

UPDATE marketplace_modules
SET remote_entry_url = '/modules/vegetation-prime/nkz-module.js'
WHERE id = 'vegetation-prime'
  AND (remote_entry_url IS DISTINCT FROM '/modules/vegetation-prime/nkz-module.js');
