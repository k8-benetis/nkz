#!/bin/bash
# =============================================================================
# Create Keycloak Audit ConfigMap
# =============================================================================
# This script creates the ConfigMap needed for the Keycloak audit Job
# from the audit script file.
#
# Usage:
#   ./scripts/create-keycloak-audit-configmap.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AUDIT_SCRIPT="${PROJECT_ROOT}/scripts/keycloak-audit.sh"

if [ ! -f "$AUDIT_SCRIPT" ]; then
    echo "ERROR: Audit script not found at: $AUDIT_SCRIPT"
    exit 1
fi

echo "Creating ConfigMap from audit script..."
kubectl create configmap keycloak-audit-scripts \
  --from-file=keycloak-audit.sh="$AUDIT_SCRIPT" \
  -n nekazari \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✓ ConfigMap created/updated successfully"
































