#!/bin/bash
# =============================================================================
# Phase 1: Verification Script for QuantumLeap + GeoServer Deployment
# =============================================================================
# This script verifies PostGIS and TimescaleDB extensions are ready

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "=========================================="
echo "Phase 1: Database Verification"
echo "=========================================="
echo ""

# 1. Verify PostgreSQL pod is running
log_info "Checking PostgreSQL pod status..."
if kubectl get pod -n nekazari postgresql-0 &>/dev/null; then
    log_success "PostgreSQL pod is running"
else
    log_error "PostgreSQL pod not found!"
    exit 1
fi

# 2. Check PostGIS extensions
log_info "Checking PostGIS extensions..."
kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c "
SELECT name, installed_version 
FROM pg_available_extensions 
WHERE name IN ('postgis', 'postgis_raster', 'postgis_topology', 'timescaledb', 'uuid-ossp', 'pgcrypto')
ORDER BY name;
" || log_warning "Could not query extensions"

# 3. Check existing hypertables
log_info "Checking TimescaleDB hypertables..."
kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c "
SELECT hypertable_name, num_dimensions, num_chunks
FROM timescaledb_information.hypertables;
" || log_warning "No hypertables found or TimescaleDB not installed"

# 4. Check for existing QuantumLeap tables
log_info "Checking for existing QuantumLeap tables..."
kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c "
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename LIKE 'mt%'
ORDER BY tablename;
" || log_info "No QuantumLeap tables found (expected for first deployment)"

# 5. Check cadastral_parcels table
log_info "Checking cadastral_parcels table..."
kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c "
SELECT COUNT(*) as parcel_count FROM cadastral_parcels;
" || log_warning "cadastral_parcels table not found"

# 6. Check ndvi_rasters table
log_info "Checking ndvi_rasters table..."
kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c "
SELECT COUNT(*) as raster_count FROM ndvi_rasters;
" || log_warning "ndvi_rasters table not found"

# 7. Check devices table
log_info "Checking devices table..."
kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c "
SELECT COUNT(*) as device_count FROM devices;
" || log_warning "devices table not found"

# 8. Check database size
log_info "Checking database size..."
kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c "
SELECT pg_size_pretty(pg_database_size('nekazari')) as database_size;
"

# 9. Check PostgreSQL version
log_info "Checking PostgreSQL version..."
kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c "
SELECT version();
"

echo ""
echo "=========================================="
log_success "Phase 1 Verification Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review the output above"
echo "2. If PostGIS is missing, run: kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c 'CREATE EXTENSION IF NOT EXISTS postgis;'"
echo "3. If PostGIS Raster is missing, run: kubectl exec -n nekazari -it postgresql-0 -- psql -U nekazari -d nekazari -c 'CREATE EXTENSION IF NOT EXISTS postgis_raster;'"
echo "4. Proceed to Phase 2: Deploy QuantumLeap"
