#!/bin/bash
# =============================================================================
# Verificar Estado de Creación de Tenant
# =============================================================================

TENANT_ID=${1:-"tenant-test-1"}

echo "=== 1. Ver logs completos del tenant-webhook desde que inició ==="
sudo k3s kubectl logs -n nekazari -l app=tenant-webhook --tail=500 | grep -A 100 "Creating complete tenant infrastructure for: $TENANT_ID"

echo -e "\n=== 2. Ver si el script create-tenant.sh está ejecutándose ==="
sudo k3s kubectl exec -n nekazari -l app=tenant-webhook -- ps aux | grep -E "create-tenant|bash.*tenant" || echo "No hay procesos de creación de tenant ejecutándose"

echo -e "\n=== 3. Verificar si el tenant existe en la base de datos ==="
POSTGRES_POD=$(sudo k3s kubectl get pods -n nekazari -l app=postgresql -o jsonpath='{.items[0].metadata.name}')
sudo k3s kubectl exec -n nekazari $POSTGRES_POD -- psql -U postgres -d nekazari -c "SELECT tenant_id, email, created_at FROM tenants WHERE tenant_id = '$TENANT_ID';"

echo -e "\n=== 4. Verificar si se creó la base de datos del tenant ==="
sudo k3s kubectl exec -n nekazari $POSTGRES_POD -- psql -U postgres -c "\l" | grep "$TENANT_ID" || echo "Base de datos no encontrada"

echo -e "\n=== 5. Verificar si existe el namespace de Kubernetes ==="
sudo k3s kubectl get namespace | grep "$TENANT_ID" || echo "Namespace no encontrado"

echo -e "\n=== 6. Ver errores recientes del tenant-webhook ==="
sudo k3s kubectl logs -n nekazari -l app=tenant-webhook --tail=200 | grep -i -E "error|failed|timeout|exception" | tail -20

echo -e "\n=== 7. Verificar estado del pod tenant-webhook ==="
sudo k3s kubectl get pod -n nekazari -l app=tenant-webhook -o wide

echo -e "\n=== 8. Ver logs más recientes (últimas 30 líneas) ==="
sudo k3s kubectl logs -n nekazari -l app=tenant-webhook --tail=30

