#!/bin/bash
# =============================================================================
# Check Keycloak Client Configuration
# =============================================================================
# This script checks the Keycloak client configuration using the Keycloak Admin API.

set -e

echo "=========================================="
echo "Keycloak Client Configuration Check"
echo "=========================================="

# Configuration
NAMESPACE="nekazari"
KEYCLOAK_URL="https://nekazari.robotika.cloud/auth"
KEYCLOAK_REALM="nekazari"
CLIENT_ID="nekazari-frontend"
EXPECTED_REDIRECT_URI="https://nekazari.robotika.cloud/grafana/login/generic_oauth"

echo ""
echo "Configuration:"
echo "  Keycloak URL: ${KEYCLOAK_URL}"
echo "  Realm: ${KEYCLOAK_REALM}"
echo "  Client ID: ${CLIENT_ID}"
echo "  Expected Redirect URI: ${EXPECTED_REDIRECT_URI}"
echo ""

# Step 1: Get Keycloak admin credentials
echo "Step 1: Getting Keycloak admin credentials..."
echo "=========================================="
ADMIN_USER=$(kubectl get secret keycloak-secret -n ${NAMESPACE} -o jsonpath='{.data.admin-username}' 2>/dev/null | base64 -d || echo "admin")
ADMIN_PASS=$(kubectl get secret keycloak-secret -n ${NAMESPACE} -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d)

if [ -z "$ADMIN_PASS" ]; then
    echo "⚠ Error: Could not get Keycloak admin password from secret"
    echo "  Please check if keycloak-secret exists in namespace ${NAMESPACE}"
    exit 1
fi

echo "✓ Admin credentials retrieved"
echo ""

# Step 2: Get admin access token
echo "Step 2: Getting Keycloak admin access token..."
echo "=========================================="
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token' 2>/dev/null)

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
    echo "⚠ Error: Could not get Keycloak admin access token"
    echo "  Please check if Keycloak is accessible and credentials are correct"
    exit 1
fi

echo "✓ Admin access token retrieved"
echo ""

# Step 3: Check if client exists
echo "Step 3: Checking if client exists..."
echo "=========================================="
CLIENT_CONFIG=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=${CLIENT_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" | jq '.[0]' 2>/dev/null)

if [ -z "$CLIENT_CONFIG" ] || [ "$CLIENT_CONFIG" == "null" ]; then
    echo "✗ Error: Client '${CLIENT_ID}' not found in realm '${KEYCLOAK_REALM}'"
    echo ""
    echo "Solution:"
    echo "  1. Access Keycloak Admin Console: ${KEYCLOAK_URL}"
    echo "  2. Switch to realm '${KEYCLOAK_REALM}' (not 'master')"
    echo "  3. Go to Clients → Create client"
    echo "  4. Client ID: ${CLIENT_ID}"
    echo "  5. Client protocol: openid-connect"
    echo "  6. Click Save"
    echo ""
    exit 1
fi

CLIENT_UUID=$(echo "$CLIENT_CONFIG" | jq -r '.id')
echo "✓ Client found: ${CLIENT_ID} (ID: ${CLIENT_UUID})"
echo ""

# Step 4: Get full client configuration
echo "Step 4: Getting full client configuration..."
echo "=========================================="
FULL_CLIENT_CONFIG=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${CLIENT_UUID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" | jq '.' 2>/dev/null)

if [ -z "$FULL_CLIENT_CONFIG" ] || [ "$FULL_CLIENT_CONFIG" == "null" ]; then
    echo "⚠ Error: Could not get full client configuration"
    exit 1
fi

echo "✓ Client configuration retrieved"
echo ""

# Step 5: Check client settings
echo "Step 5: Checking client settings..."
echo "=========================================="
CLIENT_ENABLED=$(echo "$FULL_CLIENT_CONFIG" | jq -r '.enabled // true')
STANDARD_FLOW_ENABLED=$(echo "$FULL_CLIENT_CONFIG" | jq -r '.standardFlowEnabled // false')
CLIENT_PROTOCOL=$(echo "$FULL_CLIENT_CONFIG" | jq -r '.protocol // "unknown"')
PUBLIC_CLIENT=$(echo "$FULL_CLIENT_CONFIG" | jq -r '.publicClient // false')
REDIRECT_URIS=$(echo "$FULL_CLIENT_CONFIG" | jq -r '.redirectUris // [] | join(", ")')
WEB_ORIGINS=$(echo "$FULL_CLIENT_CONFIG" | jq -r '.webOrigins // [] | join(", ")')

echo "Client Settings:"
echo "  Enabled: ${CLIENT_ENABLED}"
echo "  Protocol: ${CLIENT_PROTOCOL}"
echo "  Public Client: ${PUBLIC_CLIENT}"
echo "  Standard Flow Enabled: ${STANDARD_FLOW_ENABLED}"
echo "  Redirect URIs: ${REDIRECT_URIS}"
echo "  Web Origins: ${WEB_ORIGINS}"
echo ""

# Step 6: Check if redirect URI is configured
echo "Step 6: Checking redirect URI configuration..."
echo "=========================================="
if echo "$REDIRECT_URIS" | grep -q "${EXPECTED_REDIRECT_URI}"; then
    echo "✓ Redirect URI '${EXPECTED_REDIRECT_URI}' is configured"
else
    echo "✗ Error: Redirect URI '${EXPECTED_REDIRECT_URI}' is NOT configured"
    echo ""
    echo "Current redirect URIs:"
    echo "$REDIRECT_URIS" | tr ',' '\n' | sed 's/^/  - /'
    echo ""
    echo "Solution:"
    echo "  1. Access Keycloak Admin Console: ${KEYCLOAK_URL}"
    echo "  2. Switch to realm '${KEYCLOAK_REALM}'"
    echo "  3. Go to Clients → ${CLIENT_ID}"
    echo "  4. Add to 'Valid Redirect URIs':"
    echo "     - ${EXPECTED_REDIRECT_URI}"
    echo "     - ${EXPECTED_REDIRECT_URI}/*"
    echo "  5. Click Save"
    echo ""
fi

# Step 7: Check if client is enabled
echo "Step 7: Checking if client is enabled..."
echo "=========================================="
if [ "$CLIENT_ENABLED" == "true" ]; then
    echo "✓ Client is enabled"
else
    echo "✗ Error: Client is disabled"
    echo ""
    echo "Solution:"
    echo "  1. Access Keycloak Admin Console: ${KEYCLOAK_URL}"
    echo "  2. Switch to realm '${KEYCLOAK_REALM}'"
    echo "  3. Go to Clients → ${CLIENT_ID}"
    echo "  4. Enable the client"
    echo "  5. Click Save"
    echo ""
fi

# Step 8: Check if standard flow is enabled
echo "Step 8: Checking if standard flow is enabled..."
echo "=========================================="
if [ "$STANDARD_FLOW_ENABLED" == "true" ]; then
    echo "✓ Standard Flow is enabled"
else
    echo "✗ Error: Standard Flow is disabled"
    echo ""
    echo "Solution:"
    echo "  1. Access Keycloak Admin Console: ${KEYCLOAK_URL}"
    echo "  2. Switch to realm '${KEYCLOAK_REALM}'"
    echo "  3. Go to Clients → ${CLIENT_ID}"
    echo "  4. Enable 'Standard Flow Enabled'"
    echo "  5. Click Save"
    echo ""
fi

# Step 9: Check client type
echo "Step 9: Checking client type..."
echo "=========================================="
if [ "$PUBLIC_CLIENT" == "true" ]; then
    echo "✓ Client is a public client (no client secret needed)"
    echo ""
    echo "Note: If Grafana is configured with a client secret, you should either:"
    echo "  1. Remove GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET from Grafana (recommended)"
    echo "  2. Or change client to confidential in Keycloak"
else
    echo "✓ Client is a confidential client (client secret required)"
    echo ""
    echo "Note: Make sure GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET is configured in Grafana"
fi

# Step 10: Summary
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
ISSUES=0

if [ "$CLIENT_ENABLED" != "true" ]; then
    echo "✗ Client is disabled"
    ISSUES=$((ISSUES + 1))
fi

if [ "$STANDARD_FLOW_ENABLED" != "true" ]; then
    echo "✗ Standard Flow is disabled"
    ISSUES=$((ISSUES + 1))
fi

if ! echo "$REDIRECT_URIS" | grep -q "${EXPECTED_REDIRECT_URI}"; then
    echo "✗ Redirect URI is not configured"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo "✓ All checks passed!"
    echo ""
    echo "If OAuth still doesn't work, check:"
    echo "  1. Grafana environment variables"
    echo "  2. Grafana logs for more details"
    echo "  3. Keycloak logs for error messages"
else
    echo "✗ Found ${ISSUES} issue(s) that need to be fixed"
    echo ""
    echo "Please fix the issues above and run this script again"
fi

echo ""

