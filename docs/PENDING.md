# Nekazari — Pending Tasks

Living document. Add items here as they surface; close them with date and commit ref.

---

## Critical / Blocking

| # | Task | Context |
|---|------|---------|
| ~~C1~~ | ~~**Module template broken**~~ — **DONE 2026-02-23** (`69dd950`). `nekazari-module-template/` fully rewritten to IIFE+`@nekazari/module-builder`. `nkz/module-template/` marked deprecated with redirect README. | |
| C2 | **No automated database backups** — no cron for PostgreSQL, MongoDB, or MinIO. Single point of failure on disk corruption or accidental delete. | ops |

---

## Module Template (C1 detail)

**Decision**: keep `nekazari-module-template/` (standalone repo `k8-benetis/nkz-module-template`) as the single canonical template for external developers. Remove `nkz/module-template/` or replace it with a one-line redirect to the standalone repo.

**Rationale**: the standalone repo is the public-facing template that third-party developers clone. The one inside `nkz/` is a duplicate with no additional value — all platform-internal modules follow the same pattern and use `@nekazari/module-builder` directly.

**What the rewrite needs:**

- `vite.config.ts` — replace federation plugin with `nkzModulePreset` from `@nekazari/module-builder`
- `src/moduleEntry.ts` — add IIFE entry point calling `window.__NKZ__.register()`
- `tsconfig.json` — `"jsx": "react"` (classic, not react-jsx)
- `package.json` — remove `@originjs/vite-plugin-federation`, add `@nekazari/module-builder`
- `SETUP.md` / `README.md` — rewrite: remove `MODULE_SCOPE`, `remoteEntry.js`, nginx frontend, standalone deployment. Document IIFE build + MinIO upload flow.
- `k8s/` — remove standalone frontend deployment (nginx). Keep only backend deployment if the module has a backend.
- Web workers — any worker import must use `?worker&inline` to avoid broken absolute paths in MinIO.
- Add DataHub compatibility section (see `ADAPTER_SPEC.md` in `nkz-module-datahub`).

**Reference implementations** (working modules to copy patterns from):
- `nkz-module-datahub/` — `vite.config.ts`, `src/moduleEntry.ts`, `src/slots/`
- `nekazari-module-vegetation-health/frontend/` — same pattern

---

## Infrastructure / Ops

| # | Task | Notes |
|---|------|-------|
| O1 | **`imagePullPolicy: IfNotPresent`** on most deployments — forces manual `docker save \| k3s ctr images import` on every deploy. Change to `Always` for deployments that use GHCR, or pin image digests instead of `:latest` tags. | All core services in `k8s/` |
| O2 | **30/43 containers use `:latest` tag** — no version pinning. Roll out digest pinning or semver tags in CI. | `k8s/` manifests |
| O3 | **Disk at 82% (79G/96G)** — needs monitoring alert + cleanup cron (old Docker layers, unused K3s images, log rotation). | Server `109.123.252.120` |
| O4 | **No Prometheus/Grafana** — manifests are ready in `k8s/monitoring/` but not applied. Apply once disk/CPU headroom allows. | `k8s/monitoring/` |
| O5 | **Network policies not applied** — manifests in `k8s/common/network-policies/` (corrected for Traefik in 2026-02-14 audit) but never deployed. Need testing in staging first. | `k8s/common/network-policies/` |
| O6 | **MinIO ILM TTL is ops-only config** — not in git/IaC. The `exports/` 1-day TTL rule (ID `d6dld2rtaclquk0slui0`) lives only in MinIO state. If MinIO is re-provisioned it will be lost. Add to a bootstrap script or ConfigMap annotation. | MinIO |
| O7 | **Single-node cluster** — SPOF, no HA. Acceptable for now but documented risk. | K3s |

---

## Security

| # | Task | Notes |
|---|------|-------|
| S1 | **JWT in localStorage** — should migrate to httpOnly cookies to prevent XSS token theft. Medium effort, requires coordinated frontend + API gateway change. | `apps/host/`, `services/api-gateway/` |
| S2 | **K8s security contexts not applied uniformly** — defined in templates but many live deployments lack `runAsNonRoot`, `readOnlyRootFilesystem`, `capabilities.drop: ALL`. Should apply progressively as services are rebuilt. | `k8s/` deployments |
| S3 | **454 TypeScript `any` types** — reduces type safety, increases XSS/injection surface at boundaries. Reduce progressively. | `apps/host/src/` |

---

## Platform Features

| # | Task | Notes |
|---|------|-------|
| P1 | **Carbon module** — skeleton created (`nkz-module-carbon/`). Needs: DB schema, Celery task, PAR integration, K8s manifests, frontend IIFE bundle. | `nkz-module-carbon/` |
| P2 | **Vegetation index expansion** — 20+ indices catalogued (NDVI, EVI, SAVI, NDRE, NDWI…), only a subset implemented. | `nekazari-module-vegetation-health/` |
| P3 | **DataHub: weather data now writing** but entities appear as `WeatherObserved:{tenant}:parcel-{id}`. User needs to discover them in the entity tree. Verify they surface correctly in the DataHub entity list UI (`GET /api/datahub/entities`). | `nkz-module-datahub/` |
| P4 | **Intelligence module at 0 replicas in production** (currently 1 after 2026-02-22 fix) but was originally excluded due to CPU constraints. Monitor real usage; scale back down if idle. | `k8s/core/services/intelligence-service-deployment.yaml` |
| P5 | **OPS_PENDING.md VPN/robotics tasks** — Headscale, Tailscale, IoT CA, Mosquitto mTLS, Zenoh Router. All 12 blocks still "Pendiente". Unrelated to current sprint. | `nkz/` `.ai/OPS_PENDING.md` |

---

## Code Quality / Tech Debt

| # | Task | Notes |
|---|------|-------|
| Q1 | **~770 `console.log` statements** — ~80 removed from module system (2026-02-17), ~690 remain. Add an ESLint `no-console` rule and remove progressively. | `apps/host/src/`, `services/` |
| Q2 | **No ESLint config** — lint script exists but no config file. Add `@typescript-eslint/recommended` as baseline. | `nkz/` |
| Q3 | **Odoo, Cadastral, Intelligence module backends at 0 replicas** — CPU constraints. Revisit when cluster resources allow or move to on-demand scaling. | K8s |
| Q4 | **`debug_parcels.py` committed at repo root** — appears to be a one-off debug script. Remove or move to `scripts/`. | `nkz/debug_parcels.py` |
| Q5 | **`frontend-dist.tar.gz` at repo root** — 68MB tarball committed to git. Should be removed and the history cleaned if it was committed accidentally. | `nkz/frontend-dist.tar.gz` |

---

## Documentation

| # | Task | Notes |
|---|------|-------|
| ~~D1~~ | ~~**`SETUP.md` in both module templates**~~ — **DONE 2026-02-23**. Rewritten as part of C1 fix. | |
| D2 | **`docs/modules/EXTERNAL_MODULE_INSTALLATION.md`** — check if it references old deployment model (nginx frontend container). | `nkz/docs/modules/` |
| ~~D3~~ | ~~**`ADAPTER_SPEC.md`**~~ — **DONE 2026-02-23**. Complete and tracked in `nkz-module-datahub/`. DataHub section added to template README. | |

---

_Last updated: 2026-02-23 — C1, D1, D3 closed_
