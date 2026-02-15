#!/bin/bash
# =============================================================================
# NUKE SCRIPT - ATOMIC WIPE
# =============================================================================
# Wipes all platform namespaces, PVs, and resources.
# USE WITH EXTREME CAUTION.
# =============================================================================

set -e

echo "⚠️  WARNING: This script will DELETE ALL DATA in namespaces: argocd, nekazari, nekazari-vpn"
echo "   PVs (Volumes) will be deleted."
# echo "   You have 5 seconds to CTRL+C..."
# sleep 5

echo "🔥 Terminating Application Controllers..."
# Scale down key deployments first to stop writing
kubectl scale deployment -n argocd --replicas=0 --all
kubectl scale statefulset -n argocd --replicas=0 --all
kubectl scale deployment -n nekazari --replicas=0 --all
kubectl scale statefulset -n nekazari --replicas=0 --all

echo "🔥 Deleting Namespaces (Async)..."
kubectl delete namespace argocd --wait=false || true
kubectl delete namespace nekazari --wait=false || true
kubectl delete namespace nekazari-vpn --wait=false || true

echo "🔥 Deleting orphaned PVs..."
# Clean up any persistent volumes that might hang around
kubectl get pv | grep -E 'nekazari|argocd' | awk '{print $1}' | xargs -r kubectl delete pv

echo "⏳ Waiting for namespaces to terminate..."
kubectl wait --for=delete namespace/argocd --timeout=300s || echo "Namespace argocd deletion timed out (check finalizers)"
kubectl wait --for=delete namespace/nekazari --timeout=300s || echo "Namespace nekazari deletion timed out (check finalizers)"
kubectl wait --for=delete namespace/nekazari-vpn --timeout=300s || echo "Namespace nekazari-vpn deletion timed out (check finalizers)"

# Handle stuck namespaces (force finalizing) if needed
# (Optional advanced step)

echo "✅ Cluster Wiped. Ready for bootstrap."
