#!/bin/bash
# =============================================================================
# Verificar uso de recursos en el cluster
# =============================================================================

echo "=== Top 10 Pods por CPU ==="
sudo k3s kubectl top pods -n nekazari --sort-by=cpu 2>/dev/null | head -11 || echo "kubectl top no disponible, usando describe nodes"

echo -e "\n=== Top 10 Pods por Memoria ==="
sudo k3s kubectl top pods -n nekazari --sort-by=memory 2>/dev/null | head -11 || echo "kubectl top no disponible"

echo -e "\n=== Recursos solicitados por deployment ==="
for deployment in $(sudo k3s kubectl get deployments -n nekazari -o name | cut -d/ -f2); do
  echo "--- $deployment ---"
  sudo k3s kubectl get deployment $deployment -n nekazari -o jsonpath='{.spec.template.spec.containers[*].resources}' | jq '.' 2>/dev/null || echo "Sin recursos definidos"
done

echo -e "\n=== Recursos totales del nodo ==="
sudo k3s kubectl describe nodes | grep -A 10 "Allocated resources"

