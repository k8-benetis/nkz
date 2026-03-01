#!/bin/sh
# =============================================================================
# Nekazari — Create demo users in Keycloak via Admin REST API
# =============================================================================
# Runs after Keycloak is healthy. Passwords come from environment variables.
set -e

KC_URL="http://keycloak:8080/auth"
REALM="nekazari"

echo "Waiting for Keycloak to be ready..."
until curl -sf "${KC_URL}/realms/${REALM}" > /dev/null 2>&1; do
  echo "  Keycloak not ready, retrying in 5s..."
  sleep 5
done
echo "Keycloak is ready."

# Get admin token
echo "Obtaining admin token..."
TOKEN=$(curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=${KEYCLOAK_ADMIN}" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  -d "grant_type=password" | sed 's/.*"access_token":"\([^"]*\)".*/\1/')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "" ]; then
  echo "ERROR: Failed to get admin token"
  exit 1
fi

AUTH="Authorization: Bearer ${TOKEN}"

# Helper: create user
create_user() {
  local username="$1" first="$2" last="$3" password="$4" group="$5" role="$6" tenant="$7"

  # Check if user already exists
  EXISTING=$(curl -sf -H "${AUTH}" "${KC_URL}/admin/realms/${REALM}/users?username=${username}&exact=true")
  if echo "$EXISTING" | grep -q '"id"'; then
    echo "  User ${username} already exists, skipping."
    return
  fi

  echo "  Creating user ${username}..."
  curl -sf -X POST "${KC_URL}/admin/realms/${REALM}/users" \
    -H "${AUTH}" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"${username}\",
      \"email\": \"${username}\",
      \"firstName\": \"${first}\",
      \"lastName\": \"${last}\",
      \"enabled\": true,
      \"emailVerified\": true,
      \"attributes\": {\"tenant_id\": [\"${tenant}\"]},
      \"credentials\": [{\"type\": \"password\", \"value\": \"${password}\", \"temporary\": false}],
      \"groups\": [\"/${group}\"],
      \"realmRoles\": [\"${role}\"]
    }"

  # Get user ID and assign role (realm import may not apply realmRoles from POST)
  USER_ID=$(curl -sf -H "${AUTH}" "${KC_URL}/admin/realms/${REALM}/users?username=${username}&exact=true" \
    | sed 's/.*"id":"\([^"]*\)".*/\1/')

  if [ -n "$USER_ID" ]; then
    # Get role ID
    ROLE_ID=$(curl -sf -H "${AUTH}" "${KC_URL}/admin/realms/${REALM}/roles/${role}" \
      | sed 's/.*"id":"\([^"]*\)".*/\1/')

    if [ -n "$ROLE_ID" ]; then
      curl -sf -X POST "${KC_URL}/admin/realms/${REALM}/users/${USER_ID}/role-mappings/realm" \
        -H "${AUTH}" \
        -H "Content-Type: application/json" \
        -d "[{\"id\": \"${ROLE_ID}\", \"name\": \"${role}\"}]"
      echo "    Role ${role} assigned."
    fi
  fi
}

echo "Creating demo users..."
create_user "demo@nekazari.local" "Demo" "Farmer" "${DEMO_PASSWORD}" "Demo Farm" "Farmer" "demo-farm"
create_user "admin@nekazari.local" "Admin" "Nekazari" "${ADMIN_PASSWORD}" "Platform Administrators" "PlatformAdmin" "platformadmin"

echo "Keycloak user initialization complete."
