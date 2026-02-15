#!/bin/bash

echo "=== PostgreSQL Status ==="
kubectl get pods -n nekazari | grep postgresql
echo ""

echo "=== PostgreSQL Events ==="
kubectl describe pod -n nekazari -l app=postgresql | grep -A 20 Events
echo ""

echo "=== PostgreSQL Logs (last 30 lines) ==="
kubectl logs -n nekazari -l app=postgresql --tail=30
echo ""

echo "=== PVC Status ==="
kubectl get pvc -n nekazari | grep postgresql

