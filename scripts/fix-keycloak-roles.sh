#!/bin/bash
# =============================================================================
# Fix Keycloak Roles Script
# =============================================================================
# This script creates missing Keycloak realm roles and assigns TenantAdmin
# to a user. Based on existing code in realm-import-job.yaml
# =============================================================================

set -e

NAMESPACE="${NAMESPACE:-nekazari}"
# Use internal service name (works from within cluster or via port-forward)
# For external access, set KEYCLOAK_URL environment variable
KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak-service.nekazari.svc.cluster.local:8080}"
REALM="${REALM:-nekazari}"
USER_EMAIL="${1:-}"

# Get credentials from Kubernetes secret
ADMIN_USER=$(kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-username}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
ADMIN_PASS=$(kubectl get secret keycloak-secret -n "$NAMESPACE" -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d 2>/dev/null || echo "")

if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
    echo "ERROR: Could not get Keycloak admin credentials from secret"
    exit 1
fi

echo "============================================================================="
echo "Fixing Keycloak Roles"
echo "============================================================================="
echo "Realm: $REALM"
echo ""

# Get admin token
echo "Getting admin token..."
TOKEN_RESPONSE=$(curl -s --max-time 10 -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASS}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    "${KEYCLOAK_URL}/auth/realms/master/protocol/openid-connect/token" 2>&1)

if echo "$TOKEN_RESPONSE" | grep -q "access_token"; then
    TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null)
else
    echo "ERROR: Failed to get token. Response:"
    echo "$TOKEN_RESPONSE" | head -10
    exit 1
fi

if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to get admin token"
    echo "$TOKEN_RESPONSE" | head -5
    exit 1
fi

echo "✅ Admin token obtained"
echo ""

# Function to create role if it doesn't exist
create_role_if_missing() {
    local role_name=$1
    local description=$2
    
    echo "Checking role: $role_name"
    
    # Check if role exists
    ROLE_CHECK=$(curl -s -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/roles/${role_name}")
    
    if echo "$ROLE_CHECK" | grep -q '"error"'; then
        echo "  Creating role: $role_name"
        CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"name\":\"${role_name}\",\"description\":\"${description}\",\"composite\":false,\"clientRole\":false}" \
            "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/roles")
        
        HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -1)
        if [ "$HTTP_CODE" = "201" ]; then
            echo "  ✅ Role $role_name created"
        else
            echo "  ⚠️  Role $role_name creation returned HTTP $HTTP_CODE"
            echo "  Response: $(echo "$CREATE_RESPONSE" | head -1)"
        fi
    else
        echo "  ✅ Role $role_name already exists"
    fi
}

# Create required roles
create_role_if_missing "TenantAdmin" "Tenant administrator with tenant-level access"
create_role_if_missing "Farmer" "Farmer with basic access to their data"
create_role_if_missing "PlatformAdmin" "Platform administrator with full access"
create_role_if_missing "TechnicalConsultant" "Technical consultant with device management and data analysis permissions"
create_role_if_missing "DashboardViewer" "Dashboard viewer with read-only access"

echo ""

# If user email provided, assign TenantAdmin role
if [ -n "$USER_EMAIL" ]; then
    echo "Assigning TenantAdmin role to user: $USER_EMAIL"
    
    # Get user ID
    USER_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/users?email=${USER_EMAIL}&exact=true")
    
    USER_ID=$(echo "$USER_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$USER_ID" ]; then
        echo "  ❌ User not found: $USER_EMAIL"
        exit 1
    fi
    
    echo "  User ID: $USER_ID"
    
    # Get TenantAdmin role ID
    ROLE_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/roles/TenantAdmin")
    
    ROLE_ID=$(echo "$ROLE_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$ROLE_ID" ]; then
        echo "  ❌ TenantAdmin role not found (should have been created above)"
        exit 1
    fi
    
    echo "  Role ID: $ROLE_ID"
    
    # Assign role
    ASSIGN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "[{\"id\":\"${ROLE_ID}\",\"name\":\"TenantAdmin\"}]" \
        "${KEYCLOAK_URL}/auth/admin/realms/${REALM}/users/${USER_ID}/role-mappings/realm")
    
    HTTP_CODE=$(echo "$ASSIGN_RESPONSE" | tail -1)
    if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
        echo "  ✅ TenantAdmin role assigned to $USER_EMAIL"
    else
        echo "  ⚠️  Role assignment returned HTTP $HTTP_CODE"
        echo "  Response: $(echo "$ASSIGN_RESPONSE" | head -1)"
    fi
fi

echo ""
echo "============================================================================="
echo "✅ Keycloak roles fix completed"
echo "============================================================================="
