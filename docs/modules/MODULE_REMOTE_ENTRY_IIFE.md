# Module remote_entry_url — IIFE only

The host loads modules via a single `<script src="remote_entry_url">` and expects the script to call `window.__NKZ__.register()`. Module Federation (`remoteEntry.js`) was removed (2026-02-18).

## Canonical value

- **Correct:** `remote_entry_url = '/modules/{module-id}/nkz-module.js'`
- **Wrong:** any URL ending in `.../assets/remoteEntry.js` or full origin URL (prefer path-only).

## Migrations

- **055_vegetation_prime_iife_remote_entry.sql** — fixes `vegetation-prime` only.
- **056_normalize_all_module_remote_entry_to_iife.sql** — updates every row that still contained `remoteEntry.js` to the IIFE path (and strips origin to path-only for those).

## Repos to align (optional)

These modules still have `remoteEntry.js` or old URLs in **manifest.json** or **k8s/registration.sql**. When they migrate to IIFE build, update these so (re-)registration writes the correct URL:

| Repo | File | Current value | Should be |
|------|------|---------------|-----------|
| nkz-module-lidar | manifest.json, k8s/registration.sql | `/modules/lidar/assets/remoteEntry.js` | `/modules/lidar/nkz-module.js` |
| n8n-module-nkz | manifest.json, k8s/registration.sql | artotxiki or `/modules/n8n-nkz/assets/remoteEntry.js` | `/modules/n8n-nkz/nkz-module.js` |
| nkz-module-cadastrial_sp | k8s/registration.sql | `https://...artotxiki.../remoteEntry.js` | `/modules/catastro-spain/nkz-module.js` |
| nekazari-module-eu-elevation | k8s/registration.sql | `/modules/lidar/assets/remoteEntry.js` (wrong id) | `/modules/nkz-module-eu-elevation/nkz-module.js` |
| nekazari-module-vegetation-health | k8s/registration.sql | artotxiki + remoteEntry.js | `/modules/vegetation-prime/nkz-module.js` (manifest already correct) |

DB state is already fixed by migrations 055 and 056. Updating the repo files ensures future installs or re-runs of registration scripts use the IIFE URL.
