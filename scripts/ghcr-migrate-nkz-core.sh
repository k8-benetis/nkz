#!/usr/bin/env bash
# =============================================================================
# Copy core NKZ container images from legacy GHCR namespace to nkz-os/nkz.
# Validates digest match after each crane copy (production-safe).
#
# Prerequisites:
#   - crane: https://github.com/google/go-containerregistry/blob/main/cmd/crane/README.md
#   - docker login ghcr.io with a PAT that can read source packages and write destination
#
# Usage:
#   export GHCR_TOKEN=ghp_...   # PAT: read:packages + write:packages for both orgs as needed
#   echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GH_USERNAME --password-stdin
#   ./scripts/ghcr-migrate-nkz-core.sh
#
# Optional:
#   TAGS="latest main" ./scripts/ghcr-migrate-nkz-core.sh
#   DRY_RUN=1 ./scripts/ghcr-migrate-nkz-core.sh   # print only
#
# English comments — user-facing script output can stay minimal.
# =============================================================================

set -euo pipefail

ORIGIN_PREFIX="${ORIGIN_PREFIX:-ghcr.io/k8-benetis/nkz}"
DEST_PREFIX="${DEST_PREFIX:-ghcr.io/nkz-os/nkz}"

# Must match .github/workflows/docker-build.yml matrix.service entries
SERVICES=(
  api-gateway
  entity-manager
  tenant-user-api
  tenant-webhook
  weather-worker
  telemetry-worker
  timeseries-reader
  sdm-integration
  email-service
  mqtt-credentials-manager
  risk-api
  risk-orchestrator
  risk-worker
  host
)

read -r -a TAGS <<< "${TAGS:-latest main}"

DRY_RUN="${DRY_RUN:-0}"

if [[ "$DRY_RUN" != "1" ]] && ! command -v crane >/dev/null 2>&1; then
  echo "ERROR: crane not found. Install: go install github.com/google/go-containerregistry/cmd/crane@latest" >&2
  exit 1
fi

for svc in "${SERVICES[@]}"; do
  for tag in "${TAGS[@]}"; do
    origin="${ORIGIN_PREFIX}/${svc}:${tag}"
    dest="${DEST_PREFIX}/${svc}:${tag}"

    if [[ "$DRY_RUN" == "1" ]]; then
      echo "[DRY_RUN] crane copy $origin $dest"
      echo "[DRY_RUN] digest check: crane digest $origin vs crane digest $dest"
      continue
    fi

    echo "=== Replicating ${origin} -> ${dest} ==="
    crane copy "$origin" "$dest"

    origin_digest=$(crane digest "$origin")
    dest_digest=$(crane digest "$dest")

    if [[ "$origin_digest" != "$dest_digest" ]]; then
      echo "CRITICAL: digest mismatch for ${svc}:${tag}" >&2
      echo "  origin: $origin_digest" >&2
      echo "  dest:   $dest_digest" >&2
      exit 1
    fi
    echo "OK digest match: $svc:$tag ($origin_digest)"
  done
done

echo "All copies completed and digest-verified."
