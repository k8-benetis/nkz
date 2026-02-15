#!/bin/bash
# =============================================================================
# Apply Database Migrations Script
# =============================================================================
# This script ensures all database migrations are applied
# It should be run as part of the deployment process
# =============================================================================

set -e

NAMESPACE="${NAMESPACE:-nekazari}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "============================================================================="
echo "Applying Database Migrations"
echo "============================================================================="
echo "Namespace: $NAMESPACE"
echo "Repository: $REPO_ROOT"
echo ""

# Check if we're in the right directory
if [ ! -d "$REPO_ROOT/config/timescaledb/migrations" ]; then
    echo "ERROR: Migrations directory not found: $REPO_ROOT/config/timescaledb/migrations"
    exit 1
fi

# Update ConfigMap with all migrations
echo "Updating postgresql-migrations ConfigMap..."
echo "This ensures all migration files are available in the cluster..."
kubectl delete configmap postgresql-migrations -n "$NAMESPACE" --ignore-not-found=true
kubectl create configmap postgresql-migrations \
    --from-file="$REPO_ROOT/config/timescaledb/migrations/" \
    -n "$NAMESPACE"

echo "ConfigMap updated successfully!"
echo ""

# Delete old migration job if exists
echo "Cleaning up old migration jobs..."
kubectl delete job db-migration -n "$NAMESPACE" --ignore-not-found=true

# Wait a moment for cleanup
sleep 2

# Apply migration job
echo "Creating new migration job..."
if [ -f "$REPO_ROOT/k8s/core/bootstrap/migration-job.yaml" ]; then
    kubectl apply -f "$REPO_ROOT/k8s/core/bootstrap/migration-job.yaml"
elif [ -f "$REPO_ROOT/k8s/db/migration-job.yaml" ]; then
    kubectl apply -f "$REPO_ROOT/k8s/db/migration-job.yaml"
else
    echo "ERROR: migration-job.yaml not found!"
    exit 1
fi

echo ""
echo "Waiting for migration job to complete..."
echo ""

# Wait for job to start
sleep 5

# Wait for job to complete (with timeout)
TIMEOUT=300  # 5 minutes
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    STATUS=$(kubectl get job db-migration -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' 2>/dev/null || echo "")
    if [ "$STATUS" = "True" ]; then
        echo "✅ Migration job completed successfully!"
        kubectl logs -n "$NAMESPACE" job/db-migration --tail=50
        exit 0
    fi
    
    FAILED=$(kubectl get job db-migration -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || echo "")
    if [ "$FAILED" = "True" ]; then
        echo "❌ Migration job failed!"
        kubectl logs -n "$NAMESPACE" job/db-migration --tail=100
        exit 1
    fi
    
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo "Waiting... (${ELAPSED}s/${TIMEOUT}s)"
done

echo "⚠️  Migration job timed out after ${TIMEOUT}s"
kubectl logs -n "$NAMESPACE" job/db-migration --tail=100
exit 1
