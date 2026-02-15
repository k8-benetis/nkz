#!/bin/bash
# =============================================================================
# Tenant Management Script - Simple and Robust
# =============================================================================
# This script provides a simple interface to manage tenants and users
# Usage: ./scripts/manage-tenants.sh [command] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="nekazari"
KEYCLOAK_POD=$(kubectl get pod -n $NAMESPACE -l app=keycloak -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
POSTGRES_POD=$(kubectl get pod -n $NAMESPACE -l app=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

# Functions
print_error() {
    echo -e "${RED}❌ Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

get_keycloak_token() {
    local ADMIN_USER=$(kubectl get secret -n $NAMESPACE keycloak-secret -o jsonpath='{.data.admin-username}' 2>/dev/null | base64 -d)
    local ADMIN_PASS=$(kubectl get secret -n $NAMESPACE keycloak-secret -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 -d)
    
    if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
        print_error "Failed to get admin credentials from secret"
        return 1
    fi
    
    local TOKEN_RESPONSE=$(curl -s -X POST "http://keycloak-service:8080/auth/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=${ADMIN_USER}&password=${ADMIN_PASS}&grant_type=password&client_id=admin-cli" 2>&1)
    
    # Check for errors
    if echo "$TOKEN_RESPONSE" | grep -q "error"; then
        print_error "Keycloak authentication failed"
        echo "$TOKEN_RESPONSE" | head -5
        return 1
    fi
    
    # Extract token
    echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4
}

# Commands
list_tenants() {
    echo "=== Tenants in PostgreSQL ==="
    kubectl exec -n $NAMESPACE $POSTGRES_POD -- psql -U nekazari -d nekazari -c \
        "SELECT tenant_id, tenant_name, email, status, created_at FROM tenants ORDER BY created_at DESC;" 2>/dev/null || print_error "Failed to list tenants"
    
    echo ""
    echo "=== Tenants in Kubernetes ==="
    kubectl get namespaces | grep "nekazari-tenant-" || echo "No tenant namespaces found"
}

list_users() {
    local TOKEN=$(get_keycloak_token)
    if [ -z "$TOKEN" ]; then
        print_error "Failed to get Keycloak token"
        return 1
    fi
    
    echo "=== Users in Keycloak ==="
    curl -s -H "Authorization: Bearer $TOKEN" \
        "http://keycloak-service:8080/auth/admin/realms/nekazari/users?max=100" \
        | jq -r '.[] | "\(.email // "no-email") | \(.username) | \(.enabled // false)"' \
        | column -t -s '|' || print_error "Failed to list users"
}

delete_tenant() {
    local TENANT_ID=$1
    if [ -z "$TENANT_ID" ]; then
        print_error "Tenant ID is required"
        echo "Usage: $0 delete-tenant <tenant_id>"
        return 1
    fi
    
    print_info "Deleting tenant: $TENANT_ID"
    
    # 1. Delete namespace
    local NAMESPACE_NAME="nekazari-tenant-${TENANT_ID#tenant-}"
    print_info "Deleting namespace: $NAMESPACE_NAME"
    kubectl delete namespace "$NAMESPACE_NAME" --ignore-not-found=true && \
        print_success "Namespace deleted" || print_error "Failed to delete namespace"
    
    # 2. Delete from PostgreSQL
    print_info "Deleting from PostgreSQL..."
    kubectl exec -n $NAMESPACE $POSTGRES_POD -- psql -U nekazari -d nekazari -c \
        "DELETE FROM tenants WHERE tenant_id = '$TENANT_ID';" 2>/dev/null && \
        print_success "Deleted from PostgreSQL" || print_error "Failed to delete from PostgreSQL"
    
    # 3. Delete users from Keycloak
    local TOKEN=$(get_keycloak_token)
    if [ -n "$TOKEN" ]; then
        print_info "Deleting users from Keycloak..."
        # Get users with this tenant_id
        USER_IDS=$(curl -s -H "Authorization: Bearer $TOKEN" \
            "http://keycloak-service:8080/auth/admin/realms/nekazari/users" \
            | jq -r ".[] | select(.attributes.tenant_id[]? == \"$TENANT_ID\") | .id")
        
        for USER_ID in $USER_IDS; do
            curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
                "http://keycloak-service:8080/auth/admin/realms/nekazari/users/$USER_ID" && \
                print_success "Deleted user: $USER_ID" || print_error "Failed to delete user: $USER_ID"
        done
    fi
    
    # 4. Delete group from Keycloak
    if [ -n "$TOKEN" ]; then
        print_info "Deleting group from Keycloak..."
        GROUP_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
            "http://keycloak-service:8080/auth/admin/realms/nekazari/groups?search=$TENANT_ID" \
            | jq -r ".[] | select(.name == \"$TENANT_ID\") | .id" | head -1)
        
        if [ -n "$GROUP_ID" ]; then
            curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
                "http://keycloak-service:8080/auth/admin/realms/nekazari/groups/$GROUP_ID" && \
                print_success "Deleted group: $TENANT_ID" || print_error "Failed to delete group"
        fi
    fi
    
    print_success "Tenant $TENANT_ID deleted completely"
}

create_user() {
    local EMAIL=$1
    local PASSWORD=$2
    local TENANT_ID=$3
    
    if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ] || [ -z "$TENANT_ID" ]; then
        print_error "Email, password, and tenant_id are required"
        echo "Usage: $0 create-user <email> <password> <tenant_id>"
        return 1
    fi
    
    local TOKEN=$(get_keycloak_token)
    if [ -z "$TOKEN" ]; then
        print_error "Failed to get Keycloak token"
        return 1
    fi
    
    print_info "Creating user: $EMAIL for tenant: $TENANT_ID"
    
    # Create user
    USER_DATA=$(cat <<EOF
{
    "username": "$EMAIL",
    "email": "$EMAIL",
    "enabled": true,
    "emailVerified": true,
    "attributes": {
        "tenant_id": ["$TENANT_ID"]
    },
    "credentials": [{
        "type": "password",
        "value": "$PASSWORD",
        "temporary": false
    }]
}
EOF
)
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$USER_DATA" \
        "http://keycloak-service:8080/auth/admin/realms/nekazari/users")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    
    if [ "$HTTP_CODE" = "201" ]; then
        print_success "User created successfully"
        
        # Get user ID and assign to group
        USER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
            "http://keycloak-service:8080/auth/admin/realms/nekazari/users?email=$EMAIL&exact=true" \
            | jq -r '.[0].id')
        
        if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
            # Assign to tenant group
            GROUP_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
                "http://keycloak-service:8080/auth/admin/realms/nekazari/groups?search=$TENANT_ID" \
                | jq -r ".[] | select(.name == \"$TENANT_ID\") | .id" | head -1)
            
            if [ -n "$GROUP_ID" ]; then
                curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
                    "http://keycloak-service:8080/auth/admin/realms/nekazari/users/$USER_ID/groups/$GROUP_ID" && \
                    print_success "User assigned to tenant group"
            fi
        fi
    else
        print_error "Failed to create user (HTTP $HTTP_CODE)"
        echo "$RESPONSE" | head -5
    fi
}

show_help() {
    cat <<EOF
Tenant Management Script

Usage: $0 [command] [options]

Commands:
  list-tenants              List all tenants
  list-users                List all users in Keycloak
  delete-tenant <id>        Delete a tenant completely
  create-user <email> <password> <tenant_id>  Create a user in Keycloak
  help                      Show this help message

Examples:
  $0 list-tenants
  $0 list-users
  $0 delete-tenant tenant-test
  $0 create-user user@example.com Password123! tenant-test
EOF
}

# Main
case "$1" in
    list-tenants)
        list_tenants
        ;;
    list-users)
        list_users
        ;;
    delete-tenant)
        delete_tenant "$2"
        ;;
    create-user)
        create_user "$2" "$3" "$4"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac

