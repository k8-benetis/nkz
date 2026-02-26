-- =============================================================================
-- Migration 056: Normalize all module remote_entry_url to IIFE bundle path
-- =============================================================================
-- The host only loads IIFE bundles via <script src="remote_entry_url"> and
-- window.__NKZ__.register() (Module Federation was removed 2026-02-18).
--
-- This updates any row that still points to the legacy Federation entry:
--   .../assets/remoteEntry.js  OR  https://.../modules/{id}/assets/remoteEntry.js
-- to the canonical IIFE path:
--   /modules/{id}/nkz-module.js
--
-- Affected modules (if present in DB): vegetation-prime, lidar, n8n-nkz,
-- catastro-spain, ornito-radar, eu-elevation, etc. Idempotent: skips rows
-- that already have nkz-module.js.
-- =============================================================================

-- Strip optional origin, then replace legacy entry with IIFE path
UPDATE marketplace_modules
SET remote_entry_url = regexp_replace(
  regexp_replace(COALESCE(remote_entry_url, ''), '^https?://[^/]+', ''),
  '/assets/remoteEntry\.js.*$', '/nkz-module.js'
)
WHERE remote_entry_url IS NOT NULL
  AND remote_entry_url ~ 'remoteEntry\.js'
  AND remote_entry_url !~ 'nkz-module\.js';
