#!/bin/bash
# =============================================================================
# Setup Production Secrets - Nekazari Platform
# =============================================================================
# Generates STRONG RANDOM passwords for all services.
# Run this ONCE when bootstrapping a new cluster.
#
# IMPORTANT: Save the generated passwords securely (e.g., password manager).
# This script will NOT overwrite existing secrets unless --force is passed.
# =============================================================================

set -euo pipefail

NAMESPACE="nekazari"
FORCE=false
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Parse arguments
for arg in "$@"; do
  case $arg in
    --force) FORCE=true ;;
    --namespace=*) NAMESPACE="${arg#*=}" ;;
    *) echo -e "${RED}Unknown argument: $arg${NC}"; exit 1 ;;
  esac
done

# Generate a random password of given length
gen_password() {
  local length="${1:-32}"
  openssl rand -base64 "$length" | tr -d '=/+' | head -c "$length"
}

# Create secret only if it doesn't exist (unless --force)
create_secret() {
  local name="$1"
  shift
  if [ "$FORCE" = false ] && kubectl get secret "$name" -n "$NAMESPACE" &>/dev/null; then
    echo -e "${YELLOW}[SKIP]${NC} Secret '$name' already exists. Use --force to overwrite."
    return 0
  fi
  kubectl create secret generic "$name" "$@" \
    -n "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
  echo -e "${GREEN}[OK]${NC} Secret '$name' created."
}

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN} Nekazari Production Secrets Setup${NC}"
echo -e "${CYAN} Namespace: $NAMESPACE${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Ensure namespace exists
kubectl create namespace "$NAMESPACE" 2>/dev/null || true

# Generate all passwords
PG_PASSWORD="$(gen_password 32)"
KC_PASSWORD="$(gen_password 32)"
BOOTSTRAP_PASSWORD="$(gen_password 24)"
JWT_SECRET_VAL="$(gen_password 48)"
REDIS_PASSWORD="$(gen_password 32)"
MONGODB_PASSWORD="$(gen_password 32)"
MINIO_PASSWORD="$(gen_password 32)"
HMAC_SECRET_VAL="$(gen_password 48)"
WEBHOOK_SECRET="$(gen_password 32)"

echo -e "${YELLOW}IMPORTANT: Save these credentials in a secure location!${NC}"
echo ""

# PostgreSQL
create_secret postgresql-secret \
  --from-literal=password="$PG_PASSWORD" \
  --from-literal=postgres-url="postgresql://nekazari:${PG_PASSWORD}@postgresql-service:5432/nekazari" \
  --from-literal=POSTGRES_USER="nekazari"

# Keycloak
create_secret keycloak-secret \
  --from-literal=admin-username='admin' \
  --from-literal=admin-password="$KC_PASSWORD"

# Bootstrap (admin user for first login — set email via env or argument)
BOOTSTRAP_EMAIL="${BOOTSTRAP_ADMIN_EMAIL:-admin@nekazari.local}"
create_secret bootstrap-secret \
  --from-literal=admin-email="$BOOTSTRAP_EMAIL" \
  --from-literal=admin-password="$BOOTSTRAP_PASSWORD"

# JWT Secret
create_secret jwt-secret \
  --from-literal=secret="$JWT_SECRET_VAL"

# HMAC Secret
create_secret hmac-secret \
  --from-literal=secret="$HMAC_SECRET_VAL"

# Redis
create_secret redis-secret \
  --from-literal=password="$REDIS_PASSWORD"

# MongoDB
create_secret mongodb-secret \
  --from-literal=root-username='admin' \
  --from-literal=root-password="$MONGODB_PASSWORD"

# SDM Secrets
if [ -f "./scripts/generate-sdm-secrets.sh" ]; then
  chmod +x ./scripts/generate-sdm-secrets.sh
  MONGODB_PASSWORD="$MONGODB_PASSWORD" ./scripts/generate-sdm-secrets.sh
fi

# MinIO
create_secret minio-secret \
  --from-literal=root-user='minioadmin' \
  --from-literal=root-password="$MINIO_PASSWORD"

# Copernicus CDSE (placeholder — user must fill real credentials)
create_secret copernicus-cdse-secret \
  --from-literal=username='CHANGE_ME' \
  --from-literal=password='CHANGE_ME'

# Tenant Webhook
create_secret tenant-webhook-secret \
  --from-literal=webhook-secret="$WEBHOOK_SECRET" \
  --from-literal=woocommerce-webhook-secret="$(gen_password 32)"

# GeoServer
create_secret geoserver-secret \
  --from-literal=admin-username='admin' \
  --from-literal=admin-password="$(gen_password 32)"

# Credential Encryption Key (Fernet, for external API credentials)
FERNET_KEY="$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())' 2>/dev/null || openssl rand -base64 32)"
create_secret credential-encryption-secret \
  --from-literal=key="$FERNET_KEY"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN} All secrets created successfully!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${YELLOW}Generated credentials summary:${NC}"
echo "  PostgreSQL:  $PG_PASSWORD"
echo "  Keycloak:    $KC_PASSWORD"
echo "  Bootstrap:   $BOOTSTRAP_PASSWORD (email: $BOOTSTRAP_EMAIL)"
echo "  JWT Secret:  $JWT_SECRET_VAL"
echo "  Redis:       $REDIS_PASSWORD"
echo "  MongoDB:     $MONGODB_PASSWORD"
echo "  MinIO:       $MINIO_PASSWORD"
echo ""
echo -e "${RED}SAVE THESE CREDENTIALS NOW — they cannot be recovered!${NC}"
