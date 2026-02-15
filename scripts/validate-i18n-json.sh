#!/bin/bash

# =============================================================================
# i18n JSON Validation Script
# =============================================================================
# Validates that all translation JSON files are valid JSON syntax.
# Usage: ./scripts/validate-i18n-json.sh [path]
# Default path: apps/host/public/locales

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_success() { echo -e "${GREEN}✓ $1${NC}"; }
log_error() { echo -e "${RED}✗ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
log_info() { echo "ℹ️  $1"; }

# Get path from argument or use default
LOCALES_PATH="${1:-apps/host/public/locales}"

if [ ! -d "$LOCALES_PATH" ]; then
    log_error "Directory not found: $LOCALES_PATH"
    exit 1
fi

log_info "Validating JSON files in: $LOCALES_PATH"
echo ""

ERRORS=0
FILES_CHECKED=0

# Find all JSON files recursively
while IFS= read -r -d '' file; do
    FILES_CHECKED=$((FILES_CHECKED + 1))
    
    # Validate JSON using Python (more reliable than jq for error messages)
    if python3 -m json.tool "$file" > /dev/null 2>&1; then
        log_success "$file"
    else
        log_error "$file"
        ERRORS=$((ERRORS + 1))
        # Show the actual error
        python3 -m json.tool "$file" 2>&1 | head -5 || true
    fi
done < <(find "$LOCALES_PATH" -type f -name "*.json" -print0)

echo ""
if [ $ERRORS -eq 0 ]; then
    log_success "All $FILES_CHECKED JSON files are valid!"
    exit 0
else
    log_error "Found $ERRORS invalid JSON file(s) out of $FILES_CHECKED"
    exit 1
fi

