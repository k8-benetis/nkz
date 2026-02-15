#!/bin/bash
# =============================================================================
# Deploy Frontend to MinIO Static Serving
# =============================================================================
# Usage: ./scripts/deploy-frontend.sh
#
# This script:
# 1. Builds the frontend application
# 2. Generates runtime config.js with environment variables
# 3. Syncs the built files to MinIO bucket
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Deploying Frontend to MinIO...${NC}"

# Check if mc (MinIO Client) is installed
if ! command -v mc &> /dev/null; then
    echo -e "${RED}❌ MinIO Client (mc) not found. Install with: brew install minio/stable/mc${NC}"
    exit 1
fi

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_ROOT/apps/host/dist"

# Default values for environment variables
VITE_API_URL="${VITE_API_URL:-https://nkz.robotika.cloud}"
VITE_KEYCLOAK_URL="${VITE_KEYCLOAK_URL:-https://auth.robotika.cloud/auth}"
VITE_KEYCLOAK_REALM="${VITE_KEYCLOAK_REALM:-nekazari}"
VITE_KEYCLOAK_CLIENT_ID="${VITE_KEYCLOAK_CLIENT_ID:-nekazari-frontend}"
VITE_TITILER_URL="${VITE_TITILER_URL:-https://nkz.robotika.cloud/titiler}"

# MinIO alias (configure with: mc alias set minio http://localhost:9000 ACCESS_KEY SECRET_KEY)
MINIO_ALIAS="${MINIO_ALIAS:-minio}"
MINIO_BUCKET="nekazari-frontend"
MINIO_PATH="host"

# Step 0: Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
cd "$PROJECT_ROOT"
pnpm install --filter nekazari-frontend

# Step 1: Build frontend
echo -e "${YELLOW}📦 Building frontend...${NC}"
pnpm --filter nekazari-frontend build

# Step 2: Generate runtime config.js
echo -e "${YELLOW}⚙️  Generating config.js...${NC}"
cat > "$DIST_DIR/config.js" <<EOF
// Runtime configuration - generated at deploy time
// Keys must match getConfig() in apps/host/src/config/environment.ts (VITE_*)
window.__ENV__ = {
  VITE_API_URL: "${VITE_API_URL}",
  VITE_KEYCLOAK_URL: "${VITE_KEYCLOAK_URL}",
  VITE_KEYCLOAK_REALM: "${VITE_KEYCLOAK_REALM}",
  VITE_KEYCLOAK_CLIENT_ID: "${VITE_KEYCLOAK_CLIENT_ID}",
  VITE_TITILER_URL: "${VITE_TITILER_URL}"
};
EOF

echo -e "${GREEN}  → config.js generated with:${NC}"
echo "     API_URL: $VITE_API_URL"
echo "     KEYCLOAK_URL: $VITE_KEYCLOAK_URL"

# Step 3: Sync to MinIO
echo -e "${YELLOW}☁️  Syncing to MinIO...${NC}"
mc mirror --overwrite "$DIST_DIR/" "${MINIO_ALIAS}/${MINIO_BUCKET}/${MINIO_PATH}/"

# Step 4: Verify
echo -e "${YELLOW}🔍 Verifying deployment...${NC}"
FILE_COUNT=$(mc ls "${MINIO_ALIAS}/${MINIO_BUCKET}/${MINIO_PATH}/" --recursive | wc -l)
echo -e "${GREEN}  → $FILE_COUNT files deployed${NC}"

echo -e "${GREEN}✅ Frontend deployed to MinIO successfully!${NC}"
echo ""
echo "Access at: https://nekazari.robotika.cloud/"
