#!/bin/bash
# =============================================================================
# Verify RLS Functions Script
# =============================================================================
# This script verifies that set_current_tenant and get_current_tenant functions
# exist and have correct permissions. Used for troubleshooting and verification.
# =============================================================================

set -e

NAMESPACE="${NAMESPACE:-nekazari}"
DB_POD=$(kubectl get pod -n "$NAMESPACE" -l app=postgresql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$DB_POD" ]; then
    echo "❌ ERROR: PostgreSQL pod not found in namespace $NAMESPACE"
    exit 1
fi

echo "============================================================================="
echo "Verifying RLS Functions"
echo "============================================================================="
echo "Namespace: $NAMESPACE"
echo "Database Pod: $DB_POD"
echo ""

# Check if set_current_tenant function exists
echo "1. Checking if set_current_tenant function exists..."
EXISTS=$(kubectl exec -n "$NAMESPACE" "$DB_POD" -- psql -U postgres -d nekazari -tAc "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'set_current_tenant');" 2>/dev/null || echo "false")

if [ "$EXISTS" = "t" ]; then
    echo "   ✅ Function exists"
    
    # Get function signature
    SIGNATURE=$(kubectl exec -n "$NAMESPACE" "$DB_POD" -- psql -U postgres -d nekazari -tAc "SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'set_current_tenant' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') LIMIT 1;" 2>/dev/null || echo "")
    
    if [ -n "$SIGNATURE" ]; then
        echo "   Signature: set_current_tenant($SIGNATURE)"
        if echo "$SIGNATURE" | grep -q "tenant text"; then
            echo "   ✅ Correct signature (tenant text)"
        else
            echo "   ⚠️  WARNING: Unexpected signature: $SIGNATURE"
            echo "   Expected: tenant text"
        fi
    else
        echo "   ⚠️  WARNING: Could not retrieve function signature"
    fi
else
    echo "   ❌ Function does NOT exist"
    echo "   → Run: ./scripts/apply-database-migrations.sh"
    echo "   → Or apply migration manually: kubectl exec -n $NAMESPACE $DB_POD -- psql -U postgres -d nekazari -f /path/to/020_ensure_set_current_tenant_function.sql"
    exit 1
fi

# Check if get_current_tenant function exists
echo ""
echo "2. Checking if get_current_tenant function exists..."
EXISTS=$(kubectl exec -n "$NAMESPACE" "$DB_POD" -- psql -U postgres -d nekazari -tAc "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_current_tenant');" 2>/dev/null || echo "false")

if [ "$EXISTS" = "t" ]; then
    echo "   ✅ Function exists"
else
    echo "   ❌ Function does NOT exist"
    echo "   → Run: ./scripts/apply-database-migrations.sh"
    exit 1
fi

# Check PUBLIC execute permissions
echo ""
echo "3. Checking PUBLIC execute permissions..."
PERMS=$(kubectl exec -n "$NAMESPACE" "$DB_POD" -- psql -U postgres -d nekazari -tAc "SELECT proacl::text FROM pg_proc WHERE proname = 'set_current_tenant' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') LIMIT 1;" 2>/dev/null || echo "")

if [ -z "$PERMS" ] || echo "$PERMS" | grep -q "=X" || [ "$PERMS" = "NULL" ] || [ "$PERMS" = "" ]; then
    echo "   ✅ Function has PUBLIC execute permissions (required for RLS)"
else
    echo "   ⚠️  WARNING: Function may not have PUBLIC execute permissions"
    echo "   Current permissions: $PERMS"
    echo "   → Fix: GRANT EXECUTE ON FUNCTION set_current_tenant(TEXT) TO PUBLIC;"
fi

# Test function execution
echo ""
echo "4. Testing function execution..."
TEST_RESULT=$(kubectl exec -n "$NAMESPACE" "$DB_POD" -- psql -U postgres -d nekazari -tAc "SELECT set_current_tenant('test-tenant'); SELECT get_current_tenant();" 2>&1 || echo "ERROR")

if echo "$TEST_RESULT" | grep -q "test-tenant"; then
    echo "   ✅ Function executes correctly"
    echo "   Test result: $TEST_RESULT"
else
    echo "   ❌ Function execution failed"
    echo "   Error: $TEST_RESULT"
    exit 1
fi

echo ""
echo "============================================================================="
echo "✅ All RLS function checks passed!"
echo "============================================================================="
echo ""
echo "If you're still experiencing 'function set_current_tenant(unknown) does not exist' errors:"
echo "1. Verify your application code is using: cursor.execute('SELECT set_current_tenant(%s)', (tenant_id,))"
echo "2. Check that migrations have been applied: ./scripts/apply-database-migrations.sh"
echo "3. Restart services that may have cached connection pools"
echo ""
