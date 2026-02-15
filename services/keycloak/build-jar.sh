#!/bin/bash
# =============================================================================
# Build Script Mappers JAR for Keycloak
# =============================================================================
# This script creates a JAR file containing the script mapper for Keycloak
# Script Mappers must be packaged as JAR files with META-INF structure
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
JAR_FILE="${SCRIPT_DIR}/keycloak-script-mappers.jar"

# Clean previous build
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}/META-INF"

# Copy script files
cp "${SCRIPT_DIR}/scripts/group-tenant-attributes-mapper.js" "${BUILD_DIR}/"
cp "${SCRIPT_DIR}/META-INF/keycloak-scripts.json" "${BUILD_DIR}/META-INF/"

# Create JAR file (jar command creates MANIFEST.MF automatically)
cd "${BUILD_DIR}"
jar cf "${JAR_FILE}" .

echo "✓ JAR file created: ${JAR_FILE}"
echo ""
echo "Contents:"
jar tf "${JAR_FILE}"
