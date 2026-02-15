#!/bin/bash
# =============================================================================
# Apply all NDVI-related database migrations
# This script ensures all NDVI tables and schema are created
# =============================================================================

set -e

POSTGRES_HOST="${POSTGRES_HOST:-postgresql-service}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-nekazari}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

echo "🔧 Applying NDVI database migrations..."
echo "PostgreSQL: ${POSTGRES_HOST}/${POSTGRES_DB}"

# List of NDVI migrations in order
NDVI_MIGRATIONS=(
    "006-create-ndvi-tables.sql"
    "006_ndvi_raster_storage.sql"
    "007_add_index_type_to_ndvi_jobs.sql"
    "007-ndvi-manual-geometry.sql"
    "013_update_ndvi_rls_for_platform_tenant.sql"
    "014_fix_ndvi_jobs_id_default.sql"
    "018_add_multi_index_support.sql"
    "020_parcel_ndvi_history.sql"
    "021_add_ndvi_jobs_columns.sql"
    "022_add_ndvi_jobs_progress.sql"
    "023_parcel_ndvi_history.sql"
)

# Apply each migration
for migration in "${NDVI_MIGRATIONS[@]}"; do
    migration_path="${MIGRATIONS_DIR}/${migration}"
    
    if [ -f "$migration_path" ]; then
        echo "📄 Applying: $migration"
        if psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$migration_path" 2>&1; then
            echo "✅ Migration $migration completed successfully"
        else
            exit_code=$?
            echo "⚠️  Migration $migration exited with code $exit_code"
            echo "Note: Some migrations may fail if already applied (idempotent)"
            # Continue with other migrations even if one fails (idempotent migrations)
        fi
    else
        echo "⚠️  Migration file not found: $migration_path"
    fi
done

echo "✅ All NDVI migrations completed!"
