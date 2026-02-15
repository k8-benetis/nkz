#!/bin/bash
# =============================================================================
# Script de Auditoría de Producción - Nekazari Platform
# =============================================================================
# Ejecutar en el servidor para conocer estado real del sistema desplegado
#
# Uso: ./scripts/audit-produccion.sh
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_header() { echo -e "\n${CYAN}========================================\n$1\n========================================${NC}\n"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[⚠]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

OUTPUT_DIR="audit-results-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

log_header "Auditoría de Producción - Nekazari Platform"
log_info "Resultados se guardarán en: $OUTPUT_DIR"

# =============================================================================
# ÁREA 1: Infraestructura Kubernetes
# =============================================================================
log_header "ÁREA 1: Infraestructura Kubernetes"

log_info "Obteniendo estado general..."
kubectl get all -A > "$OUTPUT_DIR/01-all-resources.txt"
log_success "Guardado: 01-all-resources.txt"

log_info "Pods en todos los namespaces..."
kubectl get pods -A -o wide > "$OUTPUT_DIR/02-pods-all.txt"
log_success "Guardado: 02-pods-all.txt"

log_info "Servicios desplegados..."
kubectl get svc -A > "$OUTPUT_DIR/03-services-all.txt"
log_success "Guardado: 03-services-all.txt"

log_info "Deployments y StatefulSets..."
kubectl get deployments -A > "$OUTPUT_DIR/04-deployments.txt"
kubectl get statefulsets -A > "$OUTPUT_DIR/05-statefulsets.txt"
log_success "Guardado: deployments y statefulsets"

log_info "Jobs y CronJobs..."
kubectl get jobs -A > "$OUTPUT_DIR/06-jobs.txt"
kubectl get cronjobs -A > "$OUTPUT_DIR/07-cronjobs.txt"
log_success "Guardado: jobs y cronjobs"

log_info "ConfigMaps y Secrets..."
kubectl get configmaps -A > "$OUTPUT_DIR/08-configmaps.txt"
kubectl get secrets -A > "$OUTPUT_DIR/09-secrets.txt"
log_success "Guardado: configmaps y secrets"

log_info "Persistent Volumes..."
kubectl get pv > "$OUTPUT_DIR/10-persistent-volumes.txt"
kubectl get pvc -A > "$OUTPUT_DIR/11-persistent-volume-claims.txt"
log_success "Guardado: persistent volumes"

log_info "Ingress y NetworkPolicies..."
kubectl get ingress -A > "$OUTPUT_DIR/12-ingress.txt"
kubectl get networkpolicies -A > "$OUTPUT_DIR/13-networkpolicies.txt"
log_success "Guardado: ingress y networkpolicies"

# =============================================================================
# ÁREA 2: Bases de Datos
# =============================================================================
log_header "ÁREA 2: Bases de Datos"

log_info "Buscando servicios de BBDD..."
kubectl get svc -A | grep -iE "(postgres|crate|mongo|timescale)" > "$OUTPUT_DIR/20-db-services.txt" || log_warning "No se encontraron services de BBDD"
log_success "Guardado: 20-db-services.txt"

log_info "Verificando PostgreSQL..."
if kubectl get statefulset -n nekazari 2>/dev/null | grep -q postgres; then
    kubectl get statefulset -n nekazari | grep postgres > "$OUTPUT_DIR/21-postgres-statefulset.txt"
    kubectl get pods -n nekazari | grep postgres > "$OUTPUT_DIR/22-postgres-pods.txt"
    POSTGRES_POD=$(kubectl get pods -n nekazari | grep postgres | head -1 | awk '{print $1}')
    
    if [ -n "$POSTGRES_POD" ]; then
        log_info "Conectando a PostgreSQL: $POSTGRES_POD"
        kubectl exec -i "$POSTGRES_POD" -n nekazari -- psql -U postgres -c "\l" > "$OUTPUT_DIR/23-postgres-databases.txt" 2>&1 || log_warning "No se pudo conectar a PostgreSQL"
        kubectl exec -i "$POSTGRES_POD" -n nekazari -- psql -U postgres -d nekazari -c "\dt" > "$OUTPUT_DIR/24-postgres-tables.txt" 2>&1 || log_warning "No se pudo listar tablas"
        kubectl exec -i "$POSTGRES_POD" -n nekazari -- psql -U postgres -d nekazari -c "SELECT table_name, pg_size_pretty(pg_total_relation_size('\"'||table_name||'\"')) FROM information_schema.tables WHERE table_schema='public';" > "$OUTPUT_DIR/25-postgres-table-sizes.txt" 2>&1 || log_warning "No se pudo obtener tamaños"
    fi
    log_success "PostgreSQL auditado"
else
    log_warning "PostgreSQL no encontrado"
    echo "No PostgreSQL found" > "$OUTPUT_DIR/21-postgres-not-found.txt"
fi

log_info "Verificando MongoDB..."
if kubectl get statefulset -n nekazari 2>/dev/null | grep -q mongo; then
    kubectl get statefulset -n nekazari | grep mongo > "$OUTPUT_DIR/26-mongo-statefulset.txt"
    kubectl get pods -n nekazari | grep mongo > "$OUTPUT_DIR/27-mongo-pods.txt"
    log_success "MongoDB encontrado"
else
    log_warning "MongoDB no encontrado"
    echo "No MongoDB found" > "$OUTPUT_DIR/26-mongo-not-found.txt"
fi

log_info "Verificando CrateDB..."
if kubectl get statefulset -n nekazari 2>/dev/null | grep -q crate; then
    kubectl get statefulset -n nekazari | grep crate > "$OUTPUT_DIR/28-crate-statefulset.txt"
    kubectl get pods -n nekazari | grep crate > "$OUTPUT_DIR/29-crate-pods.txt"
    log_success "CrateDB encontrado"
else
    log_warning "CrateDB no encontrado"
    echo "No CrateDB found" > "$OUTPUT_DIR/28-crate-not-found.txt"
fi

log_info "Verificando QuantumLeap..."
if kubectl get deployments -n nekazari 2>/dev/null | grep -q quantum; then
    kubectl get deployments -n nekazari | grep quantum > "$OUTPUT_DIR/30-quantum-deployment.txt"
    kubectl get pods -n nekazari | grep quantum > "$OUTPUT_DIR/31-quantum-pods.txt"
    log_success "QuantumLeap encontrado"
else
    log_warning "QuantumLeap no encontrado"
    echo "No QuantumLeap found" > "$OUTPUT_DIR/30-quantum-not-found.txt"
fi

# =============================================================================
# ÁREA 3: Keycloak
# =============================================================================
log_header "ÁREA 3: Keycloak y Autenticación"

if kubectl get deployment keycloak -n nekazari &>/dev/null; then
    log_info "Auditando Keycloak..."
    kubectl get deployment keycloak -n nekazari > "$OUTPUT_DIR/40-keycloak-deployment.txt"
    kubectl get pod -n nekazari | grep keycloak > "$OUTPUT_DIR/41-keycloak-pods.txt"
    
    KEYCLOAK_POD=$(kubectl get pods -n nekazari | grep keycloak | head -1 | awk '{print $1}')
    if [ -n "$KEYCLOAK_POD" ]; then
        kubectl logs "$KEYCLOAK_POD" -n nekazari --tail=50 > "$OUTPUT_DIR/42-keycloak-logs.txt" 2>&1
        kubectl exec "$KEYCLOAK_POD" -n nekazari -- env | grep -E "(KEYCLOAK|DB|ADMIN)" > "$OUTPUT_DIR/43-keycloak-env.txt" 2>&1
    fi
    
    log_info "Obteniendo configuración OpenID..."
    curl -s https://nekazari.robotika.cloud/auth/realms/nekazari/.well-known/openid-configuration > "$OUTPUT_DIR/44-keycloak-openid-config.json" 2>&1
    curl -s https://nekazari.robotika.cloud/auth/realms/nekazari/protocol/openid-connect/certs > "$OUTPUT_DIR/45-keycloak-jwks.json" 2>&1
    
    log_success "Keycloak auditado"
else
    log_warning "Keycloak no encontrado"
    echo "No Keycloak found" > "$OUTPUT_DIR/40-keycloak-not-found.txt"
fi

# =============================================================================
# ÁREA 4: Backend Services
# =============================================================================
log_header "ÁREA 4: Servicios Backend"

log_info "Listando deployments de servicios..."
kubectl get deployments -n nekazari > "$OUTPUT_DIR/50-backend-deployments.txt"

log_info "Auditando servicios individuales..."
for service in api-gateway entity-manager tenant-user-api farmer-auth-api sdm-integration email-service tenant-webhook api-validator; do
    if kubectl get deployment "$service" -n nekazari &>/dev/null; then
        POD=$(kubectl get pods -n nekazari | grep "$service" | head -1 | awk '{print $1}')
        if [ -n "$POD" ]; then
            kubectl logs "$POD" -n nekazari --tail=30 > "$OUTPUT_DIR/51-$service-logs.txt" 2>&1
            kubectl exec "$POD" -n nekazari -- env | grep -E "(JWT|KEYCLOAK|ORION)" > "$OUTPUT_DIR/52-$service-env.txt" 2>&1 || echo "No relevant env vars" > "$OUTPUT_DIR/52-$service-env.txt"
            log_info "  ✓ $service auditado"
        fi
    else
        log_warning "  ⚠ $service no encontrado"
    fi
done

# =============================================================================
# ÁREA 5: Orion-LD y FIWARE
# =============================================================================
log_header "ÁREA 5: Orion-LD y FIWARE"

if kubectl get deployment orion-ld -n nekazari &>/dev/null; then
    log_info "Auditando Orion-LD..."
    kubectl get deployment orion-ld -n nekazari > "$OUTPUT_DIR/60-orion-deployment.txt"
    
    ORION_POD=$(kubectl get pods -n nekazari | grep orion | head -1 | awk '{print $1}')
    if [ -n "$ORION_POD" ]; then
        kubectl logs "$ORION_POD" -n nekazari --tail=50 > "$OUTPUT_DIR/61-orion-logs.txt" 2>&1
    fi
    
    log_success "Orion-LD auditado"
else
    log_warning "Orion-LD no encontrado"
fi

# =============================================================================
# ÁREA 6: Frontend
# =============================================================================
log_header "ÁREA 6: Frontend"

if kubectl get deployment frontend -n nekazari &>/dev/null; then
    log_info "Auditando Frontend..."
    kubectl get deployment frontend -n nekazari > "$OUTPUT_DIR/70-frontend-deployment.txt"
    
    FRONTEND_POD=$(kubectl get pods -n nekazari | grep -E "^(frontend|nekazari-frontend)" | head -1 | awk '{print $1}')
    if [ -n "$FRONTEND_POD" ]; then
        kubectl logs "$FRONTEND_POD" -n nekazari --tail=30 > "$OUTPUT_DIR/71-frontend-logs.txt" 2>&1
    fi
    
    log_success "Frontend auditado"
else
    log_warning "Frontend no encontrado"
fi

# =============================================================================
# ÁREA 7: Mosquitto
# =============================================================================
log_header "ÁREA 7: Mosquitto MQTT"

if kubectl get deployment mosquitto -n nekazari &>/dev/null; then
    log_info "Auditando Mosquitto..."
    kubectl get deployment mosquitto -n nekazari > "$OUTPUT_DIR/80-mosquitto-deployment.txt"
    
    MOSQUITTO_POD=$(kubectl get pods -n nekazari | grep mosquitto | head -1 | awk '{print $1}')
    if [ -n "$MOSQUITTO_POD" ]; then
        kubectl logs "$MOSQUITTO_POD" -n nekazari --tail=30 > "$OUTPUT_DIR/81-mosquitto-logs.txt" 2>&1
    fi
    
    log_success "Mosquitto auditado"
else
    log_warning "Mosquitto no encontrado"
fi

# =============================================================================
# ÁREA 8: Monitoring
# =============================================================================
log_header "ÁREA 8: Monitoring"

log_info "Auditando stack de monitoring..."
kubectl get deployment prometheus -n nekazari > "$OUTPUT_DIR/90-prometheus-deployment.txt" 2>&1 || log_warning "Prometheus no encontrado"
kubectl get deployment grafana -n nekazari > "$OUTPUT_DIR/91-grafana-deployment.txt" 2>&1 || log_warning "Grafana no encontrado"
kubectl top pods -n nekazari > "$OUTPUT_DIR/92-pod-metrics.txt" 2>&1 || log_warning "No se pudieron obtener métricas"

# =============================================================================
# RESUMEN
# =============================================================================
log_header "RESUMEN DE AUDITORÍA"

log_info "Archivos generados en: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR" | tail -20

echo ""
log_success "Auditoría completada"
log_info "Revisar archivos en: $OUTPUT_DIR"
echo ""
log_warning "IMPORTANTE: Revisar archivos con 'not-found.txt' para identificar faltantes"
echo ""

# Crear resumen
cat > "$OUTPUT_DIR/SUMMARY.md" << 'EOF'
# Resumen de Auditoría de Producción

## Comandos de Resumen Rápido

```bash
# Ver pods no running
kubectl get pods -A | grep -v Running | grep -v Completed

# Ver servicios de BBDD
kubectl get svc -A | grep -iE "(postgres|crate|mongo)"

# Ver deployments
kubectl get deployments -A

# Ver logs de errores
kubectl logs -A --all-containers=true --since=24h | grep -i error | head -100

# Métricas de uso
kubectl top nodes
kubectl top pods -A
```

## Checklist de Verificación

- [ ] PostgreSQL desplegado y funcional
- [ ] MongoDB desplegado (Orion)
- [ ] CrateDB desplegado (si existe)
- [ ] QuantumLeap desplegado (si existe)
- [ ] Keycloak configurado con tenant-id
- [ ] Backend services validando JWT
- [ ] Frontend accesible
- [ ] Monitoring funcionando

## Preguntas Críticas

1. ¿CrateDB existe? → Ver: 28-crate-statefulset.txt
2. ¿QuantumLeap existe? → Ver: 30-quantum-deployment.txt
3. ¿PostgreSQL usa TimescaleDB? → Ver: 23-postgres-databases.txt
4. ¿Backend valida JWT con Keycloak? → Ver: 52-*-env.txt
5. ¿Qué volúmenes de datos hay? → Ver: 25-postgres-table-sizes.txt
EOF

cat "$OUTPUT_DIR/SUMMARY.md"
log_info "Resumen guardado en: $OUTPUT_DIR/SUMMARY.md"

log_header "SIGUIENTE PASO"
log_info "1. Revisar archivos generados en: $OUTPUT_DIR"
log_info "2. Identificar componentes faltantes"
log_info "3. Documentar hallazgos"
log_info "4. Ajustar roadmap según realidad"

