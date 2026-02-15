#!/bin/bash

# =============================================================================
# Create Kubernetes Secrets from .env file
# =============================================================================
# This script reads the .env file and creates/updates all Kubernetes secrets
# 
# CRITICAL: This is the ONLY way to create secrets. NEVER create secrets manually.
# 
# Usage:
#   ./scripts/create-secrets-from-env.sh
#
# Requirements:
#   - .env file must exist in the repository root
#   - kubectl must be configured and have access to the nekazari namespace
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
NAMESPACE="nekazari"

echo "=============================================================================="
echo "Creating Kubernetes Secrets from .env file"
echo "=============================================================================="
echo ""

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}ERROR: .env file not found at $ENV_FILE${NC}"
    echo "Please create .env file from env.example first."
    exit 1
fi

echo -e "${GREEN}✓${NC} Found .env file: $ENV_FILE"
echo ""

# Source .env file
set -a  # Automatically export all variables
source "$ENV_FILE"
set +a  # Stop automatically exporting

# Validate required variables
REQUIRED_VARS=(
    "KEYCLOAK_ADMIN_PASSWORD"
    "POSTGRES_PASSWORD"
    "JWT_SECRET"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ] || [ "${!var}" = "your-strong-keycloak-admin-password" ] || [ "${!var}" = "your-super-secret-jwt-key-minimum-32-characters-long" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo -e "${RED}ERROR: Missing or placeholder values in .env:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Please update .env file with actual values."
    exit 1
fi

echo -e "${GREEN}✓${NC} All required variables are set in .env"
echo ""

# Check if namespace exists
if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    echo -e "${YELLOW}WARNING: Namespace $NAMESPACE does not exist. Creating it...${NC}"
    kubectl create namespace "$NAMESPACE"
fi

echo "Creating/updating secrets in namespace: $NAMESPACE"
echo ""

# =============================================================================
# 1. Keycloak Secret
# =============================================================================
echo "1. Creating/updating keycloak-secret..."
KEYCLOAK_USERNAME="${KEYCLOAK_ADMIN_USERNAME:-admin}"

# Delete existing secret if it exists (to update it)
kubectl delete secret keycloak-secret -n "$NAMESPACE" --ignore-not-found=true >/dev/null 2>&1

# Create new secret
kubectl create secret generic keycloak-secret \
    --from-literal=admin-username="$KEYCLOAK_USERNAME" \
    --from-literal=admin-password="$KEYCLOAK_ADMIN_PASSWORD" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} keycloak-secret created/updated"
else
    echo -e "   ${RED}✗${NC} Failed to create keycloak-secret"
    exit 1
fi

# =============================================================================
# 2. PostgreSQL Secret
# =============================================================================
echo "2. Creating/updating postgresql-secret..."

# Construct postgres-url
POSTGRES_USER="${POSTGRES_USER:-nekazari}"
POSTGRES_DB="${POSTGRES_DB:-nekazari}"
POSTGRES_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgresql-service:5432/${POSTGRES_DB}"

# Delete existing secret if it exists
kubectl delete secret postgresql-secret -n "$NAMESPACE" --ignore-not-found=true >/dev/null 2>&1

# Create new secret
kubectl create secret generic postgresql-secret \
    --from-literal=password="$POSTGRES_PASSWORD" \
    --from-literal=postgres-url="$POSTGRES_URL" \
    --from-literal=POSTGRES_USER="$POSTGRES_USER" \
    --from-literal=POSTGRES_DB="$POSTGRES_DB" \
    --from-literal=POSTGRES_HOST="postgresql-service" \
    --from-literal=POSTGRES_PORT="5432" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} postgresql-secret created/updated"
else
    echo -e "   ${RED}✗${NC} Failed to create postgresql-secret"
    exit 1
fi

# =============================================================================
# 3. JWT Secret
# =============================================================================
echo "3. Creating/updating jwt-secret..."

# Delete existing secret if it exists
kubectl delete secret jwt-secret -n "$NAMESPACE" --ignore-not-found=true >/dev/null 2>&1

# Create new secret
kubectl create secret generic jwt-secret \
    --from-literal=secret="$JWT_SECRET" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} jwt-secret created/updated"
else
    echo -e "   ${RED}✗${NC} Failed to create jwt-secret"
    exit 1
fi

# =============================================================================
# 4. MongoDB Secret (if configured)
# =============================================================================
if [ -n "$MONGODB_ROOT_PASSWORD" ] && [ "$MONGODB_ROOT_PASSWORD" != "your-mongodb-root-password" ]; then
    echo "4. Creating/updating mongodb-secret..."
    
    # Delete existing secret if it exists
    kubectl delete secret mongodb-secret -n "$NAMESPACE" --ignore-not-found=true >/dev/null 2>&1
    
    # Create new secret
    kubectl create secret generic mongodb-secret \
        --from-literal=root-username="${MONGODB_ROOT_USERNAME:-root}" \
        --from-literal=root-password="$MONGODB_ROOT_PASSWORD" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "   ${GREEN}✓${NC} mongodb-secret created/updated"
    else
        echo -e "   ${YELLOW}⚠${NC} Failed to create mongodb-secret (non-critical)"
    fi
else
    echo "4. Skipping mongodb-secret (not configured in .env)"
fi

# =============================================================================
# 5. IONOS SFTP Secret (if configured)
# =============================================================================
if [ -n "$IONOS_SFTP_USER" ] && [ -n "$IONOS_SFTP_PASSWORD" ] && [ -n "$IONOS_SFTP_HOST" ]; then
    echo "5. Creating/updating ionos-sftp-creds..."
    
    # Delete existing secret if it exists
    kubectl delete secret ionos-sftp-creds -n "$NAMESPACE" --ignore-not-found=true >/dev/null 2>&1
    
    # Create new secret
    kubectl create secret generic ionos-sftp-creds \
        --from-literal=username="$IONOS_SFTP_USER" \
        --from-literal=password="$IONOS_SFTP_PASSWORD" \
        --from-literal=host="$IONOS_SFTP_HOST" \
        --from-literal=port="${IONOS_SFTP_PORT:-22}" \
        --from-literal=remote-path="${IONOS_SFTP_REMOTE_PATH:-/backups}" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "   ${GREEN}✓${NC} ionos-sftp-creds created/updated"
    else
        echo -e "   ${YELLOW}⚠${NC} Failed to create ionos-sftp-creds (non-critical)"
    fi
else
    echo "5. Skipping ionos-sftp-creds (not configured in .env)"
fi

# =============================================================================
# 6. Vercel Blob Secret (if configured)
# =============================================================================
if [ -n "$BLOB_READ_WRITE_TOKEN" ] && [ "$BLOB_READ_WRITE_TOKEN" != "vercel_blob_rw_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" ]; then
    echo "6. Creating/updating vercel-blob-secret..."
    
    # Delete existing secret if it exists
    kubectl delete secret vercel-blob-secret -n "$NAMESPACE" --ignore-not-found=true >/dev/null 2>&1
    
    # Create new secret
    kubectl create secret generic vercel-blob-secret \
        --from-literal=blob-read-write-token="$BLOB_READ_WRITE_TOKEN" \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "   ${GREEN}✓${NC} vercel-blob-secret created/updated"
    else
        echo -e "   ${YELLOW}⚠${NC} Failed to create vercel-blob-secret (non-critical)"
    fi
else
    echo "6. Skipping vercel-blob-secret (not configured in .env)"
fi

# =============================================================================
# 7. Tenant Webhook Secret (if configured)
# =============================================================================
if [ -n "$KEYCLOAK_CLIENT_SECRET" ] && [ "$KEYCLOAK_CLIENT_SECRET" != "your-keycloak-client-secret" ]; then
    echo "7. Creating/updating tenant-webhook-secrets..."
    
    # Ensure namespace exists
    if ! kubectl get namespace nekazari-webhook >/dev/null 2>&1; then
        kubectl create namespace nekazari-webhook
    fi

    # Delete existing secret if it exists
    kubectl delete secret tenant-webhook-secrets -n nekazari-webhook --ignore-not-found=true >/dev/null 2>&1
    
    # Create new secret
    kubectl create secret generic tenant-webhook-secrets \
        --from-literal=KEYCLOAK_CLIENT_SECRET="$KEYCLOAK_CLIENT_SECRET" \
        --from-literal=WEBHOOK_SECRET="${WEBHOOK_SECRET:?WEBHOOK_SECRET env var is required}" \
        -n nekazari-webhook \
        --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "   ${GREEN}✓${NC} tenant-webhook-secrets created/updated"
    else
        echo -e "   ${YELLOW}⚠${NC} Failed to create tenant-webhook-secrets (non-critical)"
    fi
else
    echo "7. Skipping tenant-webhook-secrets (not configured in .env)"
fi



# =============================================================================
# 8. Bootstrap Secret
# =============================================================================
echo "8. Creating/updating bootstrap-secret..."

# Delete existing secret if it exists
kubectl delete secret bootstrap-secret -n "$NAMESPACE" --ignore-not-found=true >/dev/null 2>&1

# Create new secret
kubectl create secret generic bootstrap-secret \
    --from-literal=admin-email="${BOOTSTRAP_ADMIN_EMAIL:-admin@nekazari.local}" \
    --from-literal=admin-password="${BOOTSTRAP_ADMIN_PASSWORD:?BOOTSTRAP_ADMIN_PASSWORD env var is required}" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} bootstrap-secret created/updated"
else
    echo -e "   ${RED}✗${NC} Failed to create bootstrap-secret"
    exit 1
fi

echo ""
echo "=============================================================================="
echo -e "${GREEN}✓ All secrets created/updated successfully${NC}"
echo "=============================================================================="
echo ""
echo "Verification:"
echo "  kubectl get secrets -n $NAMESPACE"
echo ""
echo "To verify secret values match .env:"
echo "  source $ENV_FILE"
echo "  kubectl get secret keycloak-secret -n $NAMESPACE -o jsonpath='{.data.admin-password}' | base64 -d"
echo "  echo \"Should match: \$KEYCLOAK_ADMIN_PASSWORD\""
echo ""

