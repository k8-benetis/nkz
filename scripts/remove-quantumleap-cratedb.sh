#!/bin/bash
# =============================================================================
# Script para eliminar QuantumLeap y CrateDB de forma segura
# =============================================================================
# Verificación previa realizada:
# - ✅ CrateDB tiene 0 tablas (sin datos)
# - ✅ No hay suscripciones activas en Orion-LD
# - ✅ No hay consultas recientes a QuantumLeap
# =============================================================================

set -e

NAMESPACE="nekazari"

echo "🗑️  Eliminando QuantumLeap y CrateDB..."
echo ""

# 1. Escalar a 0 replicas primero (más seguro)
echo "📉 Escalando deployments a 0 replicas..."
kubectl scale deployment quantumleap -n $NAMESPACE --replicas=0 2>/dev/null || echo "  ⚠️  Deployment quantumleap ya eliminado o no existe"
kubectl scale statefulset cratedb -n $NAMESPACE --replicas=0 2>/dev/null || echo "  ⚠️  StatefulSet cratedb ya eliminado o no existe"

# 2. Esperar a que los pods terminen
echo ""
echo "⏳ Esperando a que los pods terminen..."
sleep 10

# 3. Eliminar deployments y services
echo ""
echo "🗑️  Eliminando deployments y services..."
kubectl delete deployment quantumleap -n $NAMESPACE 2>/dev/null || echo "  ✅ Deployment quantumleap ya eliminado"
kubectl delete service quantumleap-service -n $NAMESPACE 2>/dev/null || echo "  ✅ Service quantumleap-service ya eliminado"
kubectl delete statefulset cratedb -n $NAMESPACE 2>/dev/null || echo "  ✅ StatefulSet cratedb ya eliminado"
kubectl delete service cratedb-service -n $NAMESPACE 2>/dev/null || echo "  ✅ Service cratedb-service ya eliminado"

# 4. Eliminar suscripciones de Orion-LD a QuantumLeap (si existen)
echo ""
echo "🔍 Verificando suscripciones en Orion-LD..."
SUBS=$(kubectl exec -n $NAMESPACE deployment/orion-ld -- curl -s http://localhost:1026/ngsi-ld/v1/subscriptions 2>/dev/null | jq -r '.[] | select(.notification.endpoint.uri | contains("quantumleap")) | .id' 2>/dev/null || echo "")

if [ -n "$SUBS" ]; then
    echo "  ⚠️  Encontradas suscripciones a QuantumLeap, eliminándolas..."
    for sub_id in $SUBS; do
        echo "    🗑️  Eliminando suscripción: $sub_id"
        kubectl exec -n $NAMESPACE deployment/orion-ld -- curl -s -X DELETE "http://localhost:1026/ngsi-ld/v1/subscriptions/$sub_id" > /dev/null 2>&1 || true
    done
    echo "  ✅ Suscripciones eliminadas"
else
    echo "  ✅ No hay suscripciones a eliminar"
fi

# 5. Verificar que se eliminaron
echo ""
echo "🔍 Verificando eliminación..."
REMAINING=$(kubectl get deployments,statefulsets,services -n $NAMESPACE 2>/dev/null | grep -E "quantumleap|cratedb" || echo "")

if [ -z "$REMAINING" ]; then
    echo "  ✅ Todo eliminado correctamente"
else
    echo "  ⚠️  Aún quedan recursos:"
    echo "$REMAINING"
fi

# 6. Mostrar recursos liberados
echo ""
echo "📊 Recursos liberados:"
echo "  - QuantumLeap: ~91Mi memoria, ~4m CPU"
echo "  - CrateDB: ~561Mi memoria, ~5m CPU"
echo "  - Total: ~652Mi memoria, ~9m CPU"
echo ""

# 7. Ver recursos actuales del nodo
echo "📈 Recursos actuales del nodo:"
kubectl top nodes 2>/dev/null || echo "  ⚠️  No se puede obtener métricas (metrics-server puede no estar disponible)"
kubectl describe node $(kubectl get nodes -o jsonpath='{.items[0].metadata.name}') 2>/dev/null | grep -A 5 "Allocated resources" || echo ""

echo ""
echo "✅ Proceso completado!"
echo ""
echo "📝 Nota: Los deployments de CrateDB y QuantumLeap han sido eliminados del repositorio"
echo "   para evitar que se vuelvan a desplegar automáticamente en futuros despliegues."
echo ""
echo "   Si en el futuro se necesita QuantumLeap, se puede implementar con:"
echo "   - QuantumLeap + TimescaleDB (más simple, recomendado)"
echo "   - QuantumLeap + CrateDB (escalado horizontal, para miles de tenants)"
