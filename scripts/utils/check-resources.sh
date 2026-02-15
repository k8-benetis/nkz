#!/bin/bash
# Check cluster resource availability

NAMESPACE="nekazari"

echo "=== Cluster Resource Status ==="
echo ""
echo "Node resources:"
kubectl top node 2>/dev/null || echo "Metrics server not available"

echo ""
echo "Pods in namespace:"
kubectl get pods -n "$NAMESPACE" -o wide

echo ""
echo "Resource usage by pod:"
kubectl top pods -n "$NAMESPACE" 2>/dev/null || echo "Cannot get pod metrics"

echo ""
echo "All PVCs:"
kubectl get pvc -n "$NAMESPACE"

echo ""
echo "Services:"
kubectl get svc -n "$NAMESPACE"

