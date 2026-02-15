#!/bin/bash
# Script para verificar estructura de la BD

DB_POD=$(kubectl get pods -n nekazari --selector=app=postgresql -o jsonpath='{.items[0].metadata.name}')

echo "=== TABLAS EXISTENTES ==="
kubectl exec -n nekazari ${DB_POD} -- psql -U postgres -d nekazari -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
"

echo ""
echo "=== ESTRUCTURA DE TENANTS ==="
kubectl exec -n nekazari ${DB_POD} -- psql -U postgres -d nekazari -c "\d tenants" 2>/dev/null || echo "No se puede describir tenants"

echo ""
echo "=== ESTRUCTURA DE ACTIVATION_CODES ==="
kubectl exec -n nekazari ${DB_POD} -- psql -U postgres -d nekazari -c "\d activation_codes" 2>/dev/null || echo "No se puede describir activation_codes"

echo ""
echo "=== ESTRUCTURA DE API_KEYS ==="
kubectl exec -n nekazari ${DB_POD} -- psql -U postgres -d nekazari -c "\d api_keys" 2>/dev/null || echo "No se puede describir api_keys"

