#!/bin/bash
# =============================================================================
# Apply Weather Module Database Migrations
# =============================================================================
# This script applies the required database migrations for the weather module
# Use this after Keycloak issues or database schema problems
# =============================================================================

set -e

NAMESPACE="${NAMESPACE:-nekazari}"
POSTGRES_POD=$(kubectl get pods -n "$NAMESPACE" -l app=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$POSTGRES_POD" ]; then
    echo "❌ ERROR: PostgreSQL pod not found in namespace $NAMESPACE"
    echo "Available pods:"
    kubectl get pods -n "$NAMESPACE" | grep -E 'postgres|NAME'
    exit 1
fi

echo "🔧 Applying weather module database migrations..."
echo "PostgreSQL pod: $POSTGRES_POD"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../config/timescaledb/migrations"

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "❌ ERROR: Migrations directory not found: $MIGRATIONS_DIR"
    exit 1
fi

# Migration files in order
MIGRATIONS=(
    "010_sensor_ingestion_schema.sql"
    "011_weather_module_agroclimatic_intelligence.sql"
)

for migration in "${MIGRATIONS[@]}"; do
    MIGRATION_FILE="$MIGRATIONS_DIR/$migration"
    
    if [ ! -f "$MIGRATION_FILE" ]; then
        echo "⚠️  WARNING: Migration file not found: $migration"
        continue
    fi
    
    echo "📄 Applying migration: $migration"
    
    # Copy migration to pod and execute
    kubectl cp "$MIGRATION_FILE" "$NAMESPACE/$POSTGRES_POD:/tmp/$migration" || {
        echo "❌ Failed to copy migration file to pod"
        exit 1
    }
    
    # Execute migration
    kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U postgres -d nekazari -f "/tmp/$migration" || {
        echo "⚠️  WARNING: Migration $migration had errors (may be expected if already applied)"
    }
    
    echo "✅ Migration $migration completed"
    echo ""
done

echo "=========================================="
echo "✅ All migrations applied"
echo ""
echo "Verifying critical tables..."
kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U postgres -d nekazari -c "
    SELECT 
        CASE WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'catalog_municipalities') 
        THEN '✅ catalog_municipalities exists' 
        ELSE '❌ catalog_municipalities MISSING' 
        END as status;
"

echo ""
echo "🎉 Done! If tables are missing, check the migration output above for errors."




























