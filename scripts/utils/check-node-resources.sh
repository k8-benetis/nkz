#!/bin/bash

echo "=== Node Resources ==="
kubectl top nodes 2>/dev/null || echo "Metrics server not available"
echo ""

echo "=== Node Details ==="
kubectl describe nodes | grep -A 10 "Allocated resources:"
echo ""

echo "=== Pod Resource Usage (All namespaces) ==="
kubectl top pods --all-namespaces 2>/dev/null || echo "Metrics server not available"
echo ""

echo "=== Total Cluster Memory/Cpu ==="
kubectl get nodes -o custom-columns=NAME:.metadata.name,CPU:.status.capacity.cpu,MEMORY:.status.capacity.memory

