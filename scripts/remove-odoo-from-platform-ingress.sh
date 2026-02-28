#!/usr/bin/env bash
# Remove odoo.robotika.cloud from the platform (nekazari) ingress so only
# the module's odoo-direct-ingress handles the Odoo subdomain.
# Run on the server with: sudo ./scripts/remove-odoo-from-platform-ingress.sh
# Requires: kubectl, python3 (standard library only).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
INGRESS_NAME="${INGRESS_NAME:-nekazari-ingress}"
NAMESPACE="${NAMESPACE:-nekazari}"
ODOO_HOST="${ODOO_HOST:-odoo.robotika.cloud}"

echo "Removing host ${ODOO_HOST} from ingress ${INGRESS_NAME} in namespace ${NAMESPACE}..."

# Export to JSON, strip odoo from spec.tls and spec.rules, re-apply (no sensitive data in script)
kubectl get ingress "$INGRESS_NAME" -n "$NAMESPACE" -o json | python3 -c '
import json, sys
host = sys.argv[1]
data = json.load(sys.stdin)
data["spec"]["tls"] = [t for t in data["spec"]["tls"] if host not in t.get("hosts", [])]
data["spec"]["rules"] = [r for r in data["spec"]["rules"] if r.get("host") != host]
for k in ("resourceVersion", "uid", "generation", "creationTimestamp", "managedFields"):
    data.get("metadata", {}).pop(k, None)
data.pop("status", None)
print(json.dumps(data))
' "$ODOO_HOST" | kubectl apply -f - || {
  echo "Apply failed. Inspect and apply manually if needed."
  exit 1
}

echo "Done. Only odoo-direct-ingress (module) should now serve ${ODOO_HOST}."
