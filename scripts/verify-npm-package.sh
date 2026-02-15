#!/bin/bash
# =============================================================================
# Verify NPM Package Contents
# =============================================================================
# Ensures that only dist/, README.md, and LICENSE are published to NPM.
# This is critical for licensing separation (SDK Apache-2.0 vs Core AGPL-3.0).
# =============================================================================

set -e

PACKAGE_NAME="${1:-sdk}"
PACKAGE_DIR="packages/${PACKAGE_NAME}"

if [ ! -d "$PACKAGE_DIR" ]; then
  echo "❌ Error: Package directory not found: $PACKAGE_DIR"
  exit 1
fi

echo "🔍 Verifying NPM package contents for: $PACKAGE_NAME"
echo ""

cd "$PACKAGE_DIR"

# Build the package
echo "📦 Building package..."
pnpm build || npm run build

# Create tarball
echo "📦 Creating tarball..."
npm pack --dry-run 2>/dev/null || npm pack

# Find the tarball
TARBALL=$(ls -t *.tgz 2>/dev/null | head -1)

if [ -z "$TARBALL" ]; then
  echo "❌ Error: No tarball found"
  exit 1
fi

echo ""
echo "📋 Contents of $TARBALL:"
echo ""

# List contents
tar -tzf "$TARBALL" | sort

echo ""
echo "🔍 Verifying allowed files only..."

# Check for disallowed files
DISALLOWED=$(tar -tzf "$TARBALL" | grep -v "^package/dist/" | grep -v "^package/README.md" | grep -v "^package/LICENSE" | grep -v "^package/package.json" | grep -v "^package/$" || true)

if [ -n "$DISALLOWED" ]; then
  echo "❌ ERROR: Found disallowed files in tarball:"
  echo "$DISALLOWED"
  echo ""
  echo "Only the following are allowed:"
  echo "  - package/dist/*"
  echo "  - package/README.md"
  echo "  - package/LICENSE"
  echo "  - package/package.json"
  exit 1
fi

echo "✅ All files are allowed"
echo ""
echo "📊 Package size:"
du -h "$TARBALL"
echo ""
echo "✅ Package verification passed!"

# Cleanup
rm -f "$TARBALL"
