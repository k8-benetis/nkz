#!/bin/bash
# =============================================================================
# Nekazari — Run all database migrations + seed data (docker-compose)
# =============================================================================
set -e

MIGRATIONS_DIR="/migrations"
SEED_FILE="/docker/seed.sql"

echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h postgresql -U postgres -d nekazari; do
  echo "  PostgreSQL not ready yet, retrying in 2s..."
  sleep 2
done
echo "PostgreSQL is ready."

# Run migrations in sorted order
echo "Running migrations..."
MIGRATION_COUNT=0
for f in $(ls "${MIGRATIONS_DIR}"/*.sql | sort); do
  BASENAME=$(basename "$f")
  echo "  -> ${BASENAME}"
  psql -h postgresql -U postgres -d nekazari -f "$f" 2>&1 || {
    echo "  WARNING: Migration ${BASENAME} had errors (may be idempotent, continuing)"
  }
  MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
done
echo "Executed ${MIGRATION_COUNT} migrations."

# Run seed data
if [ -f "${SEED_FILE}" ]; then
  echo "Running seed data..."
  psql -h postgresql -U postgres -d nekazari -f "${SEED_FILE}"
  echo "Seed data applied."
else
  echo "WARNING: Seed file not found at ${SEED_FILE}, skipping."
fi

echo "Database initialization complete."
