#!/usr/bin/env bash

# =============================================================================
# Apply Core TimescaleDB Migrations inside the Nekazari cluster
# =============================================================================
# This script replays every SQL migration under config/timescaledb/migrations
# against the production database running in Kubernetes. All migrations are
# written to be idempotent (CREATE IF NOT EXISTS, etc.), so running this script
# multiple times is safe. Use it after modifying SQL migrations locally or when
# a fresh deploy is missing structural objects (tables, views, grants…).
#
# Optional environment variables:
#   NAMESPACE   – Kubernetes namespace (default: nekazari)
#   DB_NAME     – Database name (default: nekazari)
#   DB_USER     – Database user (default: postgres)
#   KUBECTL_CTX – kubectl context to use (optional)
# =============================================================================

set -euo pipefail

NAMESPACE=${NAMESPACE:-nekazari}
DB_NAME=${DB_NAME:-nekazari}
DB_USER=${DB_USER:-postgres}
KUBECTL_CTX=${KUBECTL_CTX:-}

if ! command -v kubectl >/dev/null 2>&1; then
  echo "[ERROR] kubectl is required in PATH" >&2
  exit 1
fi

if [[ -n "$KUBECTL_CTX" ]]; then
  KUBECTL_CMD=(kubectl --context "$KUBECTL_CTX")
else
  KUBECTL_CMD=(kubectl)
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/config/timescaledb/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "[ERROR] Migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "Looking for PostgreSQL pod in namespace '$NAMESPACE'..."
PG_POD="$(${KUBECTL_CMD[@]} get pods -n "$NAMESPACE" -l app=postgresql -o jsonpath='{.items[0].metadata.name}')"

if [[ -z "$PG_POD" ]]; then
  echo "[ERROR] No PostgreSQL pod found in namespace '$NAMESPACE'." >&2
  exit 1
fi

echo "PostgreSQL pod detected: $PG_POD"

mapfile -t MIGRATIONS < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)

if [[ ${#MIGRATIONS[@]} -eq 0 ]]; then
  echo "[ERROR] No SQL migrations found under $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "Applying ${#MIGRATIONS[@]} migrations to database '$DB_NAME' as user '$DB_USER'"

for sql_file in "${MIGRATIONS[@]}"; do
  sql_name="$(basename "$sql_file")"
  echo ""
  echo "Applying migration: $sql_name"
  ${KUBECTL_CMD[@]} exec -n "$NAMESPACE" "$PG_POD" -- \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -f - < "$sql_file"
  echo "Migration applied: $sql_name"
done

echo ""
echo "All migrations executed successfully."

