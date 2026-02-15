#!/bin/bash
# =============================================================================
# Database Schema Verification Script
# =============================================================================
# Verifies that all required tables exist in the database
# This helps diagnose issues after Keycloak or other infrastructure problems
# =============================================================================

set -e

NAMESPACE="${NAMESPACE:-nekazari}"
POSTGRES_POD=$(kubectl get pods -n "$NAMESPACE" -l app=postgresql -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POSTGRES_POD" ]; then
    echo "❌ ERROR: PostgreSQL pod not found in namespace $NAMESPACE"
    exit 1
fi

echo "🔍 Verifying database schema..."
echo "PostgreSQL pod: $POSTGRES_POD"
echo ""

# List of critical tables that must exist
CRITICAL_TABLES=(
    "catalog_municipalities"
    "tenant_weather_locations"
    "weather_observations"
    "sensors"
    "sensor_profiles"
    "telemetry_events"
    "api_keys"
    "tenants"
)

MISSING_TABLES=()
EXISTING_TABLES=()

for table in "${CRITICAL_TABLES[@]}"; do
    EXISTS=$(kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U postgres -d nekazari -tAc \
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');" 2>/dev/null || echo "false")
    
    if [ "$EXISTS" = "t" ]; then
        echo "✅ Table '$table' exists"
        EXISTING_TABLES+=("$table")
    else
        echo "❌ Table '$table' MISSING"
        MISSING_TABLES+=("$table")
    fi
done

echo ""
echo "=========================================="
echo "Summary:"
echo "  ✅ Existing tables: ${#EXISTING_TABLES[@]}"
echo "  ❌ Missing tables: ${#MISSING_TABLES[@]}"
echo ""

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
    echo "⚠️  WARNING: Missing critical tables detected!"
    echo ""
    echo "Missing tables:"
    for table in "${MISSING_TABLES[@]}"; do
        echo "  - $table"
    done
    echo ""
    echo "To fix this, run the database migrations:"
    echo "  1. Apply migration 010: config/timescaledb/migrations/010_sensor_ingestion_schema.sql"
    echo "  2. Apply migration 011: config/timescaledb/migrations/011_weather_module_agroclimatic_intelligence.sql"
    echo ""
    echo "You can apply migrations using:"
    echo "  kubectl exec -n $NAMESPACE $POSTGRES_POD -- psql -U postgres -d nekazari -f /path/to/migration.sql"
    echo ""
    exit 1
else
    echo "✅ All critical tables exist. Database schema is complete."
    exit 0
fi




























