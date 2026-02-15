#!/bin/sh
# =============================================================================
# OAuth2 Proxy Role Validator Script
# =============================================================================
# This script validates that the user has one of the allowed roles before
# allowing access to n8n. It's used as a custom validation in OAuth2 Proxy.
# =============================================================================

ALLOWED_ROLES="PlatformAdmin TenantAdmin TechnicalConsultant DeviceManager"

# Extract roles from the token (passed via environment or header)
# This is a simplified example - in production, you'd parse the JWT token
# and extract the 'roles' claim

check_role() {
    user_roles="$1"
    for allowed_role in $ALLOWED_ROLES; do
        if echo "$user_roles" | grep -q "$allowed_role"; then
            return 0  # Role found, allow access
        fi
    done
    return 1  # No allowed role found, deny access
}

# Note: This is a placeholder script
# OAuth2 Proxy v7+ has built-in role checking via --allowed-role flag
# For multiple roles, you can use: --allowed-role=PlatformAdmin --allowed-role=TenantAdmin
# Or use a custom middleware/plugin


