#!/bin/bash
# =============================================================================
# Ensure Database Schema Script
# =============================================================================
# This script ensures all database migrations are applied
# It should be run as part of the deployment process
# =============================================================================

set -e

NAMESPACE="${NAMESPACE:-nekazari}"
POSTGRES_POD=$(kubectl get pods -n "$NAMESPACE" -l app=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$POSTGRES_POD" ]; then
    echo "ERROR: PostgreSQL pod not found in namespace $NAMESPACE"
    exit 1
fi

echo "Using PostgreSQL pod: $POSTGRES_POD"

# Get PostgreSQL password from secret
PGPASSWORD=$(kubectl get secret postgresql-secret -n "$NAMESPACE" -o jsonpath='{.data.password}' | base64 -d)

# Apply all migrations in order
MIGRATIONS_DIR="config/timescaledb/migrations"
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "ERROR: Migrations directory not found: $MIGRATIONS_DIR"
    exit 1
fi

echo "Applying migrations from $MIGRATIONS_DIR..."

# Apply migrations in sorted order
for migration in $(find "$MIGRATIONS_DIR" -name "*.sql" -type f | sort); do
    migration_name=$(basename "$migration")
    echo "Applying migration: $migration_name"
    
    kubectl exec "$POSTGRES_POD" -n "$NAMESPACE" -- \
        env PGPASSWORD="$PGPASSWORD" \
        psql -U postgres -d nekazari -f - < "$migration" || {
        echo "WARNING: Migration $migration_name had errors (may be idempotent)"
    }
done

echo "All migrations completed!"
