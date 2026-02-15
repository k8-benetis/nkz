#!/bin/bash
# NKZ Professional Deployment Orchestrator (Smart Hybrid Mode + Resource & Security Checks)
# Usage: ./scripts/deploy-module.sh [module-directory]
set -e

# Configuration
NAMESPACE="nekazari"
SERVER_IP="${NKZ_SERVER_IP:?NKZ_SERVER_IP env var is required}"
# Registry for GHCR (override with NKZ_REGISTRY env var)
REGISTRY_BASE="${NKZ_REGISTRY:-ghcr.io/k8-benetis/nkz/}"
# Remove trailing slash if present
REGISTRY_BASE=${REGISTRY_BASE%/}

# Resource Gate Configuration
MIN_DISK_GB=2
MIN_RAM_MB=500

# Context Detection
if [ -z "$1" ]; then
    MODULE_DIR="."
    MODULE_NAME=$(basename "$PWD")
else
    MODULE_DIR="$1"
    MODULE_NAME=$(basename "$MODULE_DIR")
fi

echo "🔍 Iniciando orquestación Segura para módulo: $MODULE_NAME"
echo "🎯 Registry Base: $REGISTRY_BASE"

# 0. Safety Brake: Check Remote Resources
check_remote_resources() {
    echo "📊 Verificando salud del servidor remoto ($SERVER_IP)..."
    # Get available disk on root / (in GB usually, but df -h outputs G/M/K, so check free blocks or use -BG for GB)
    # Using df -BG for Gigabytes, getting number only.
    # Using free -m for Megabytes.
    
    # Logic: df output line 2, available col. free output line Mem, available col (column 7 usually in modern free, or simplified logic)
    # We execute a combined command to be efficient.
    
    stats=$(ssh g@$SERVER_IP "df -BG / --output=avail | tail -1 | sed 's/G//'; free -m | awk '/Mem:/ {print \$7}'")
    # Output looks like:
    # 15
    # 2400
    
    DISK_AVAIL_GB=$(echo "$stats" | head -n1)
    RAM_AVAIL_MB=$(echo "$stats" | tail -n1)
    
    # Handle cases where remote output might be empty or error
    if [ -z "$DISK_AVAIL_GB" ] || [ -z "$RAM_AVAIL_MB" ]; then
        echo "⚠️  No se pudieron obtener métricas del servidor. ¿Conexión SSH válida?"
        read -p "    ¿Ignorar y continuar? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
        return
    fi
    
    echo "   🔹 Disco Disponible: ${DISK_AVAIL_GB} GB (Mínimo: $MIN_DISK_GB GB)"
    echo "   🔹 RAM Disponible:   ${RAM_AVAIL_MB} MB (Mínimo: $MIN_RAM_MB MB)"

    if [ "$DISK_AVAIL_GB" -lt "$MIN_DISK_GB" ]; then
        echo "❌ ERROR CRÍTICO: Espacio en disco insuficiente en servidor."
        exit 1
    fi
    
    if [ "$RAM_AVAIL_MB" -lt "$MIN_RAM_MB" ]; then
        echo "❌ ERROR CRÍTICO: Memoria RAM insuficiente en servidor."
        exit 1
    fi
    
    echo "✅ Servidor Saludable. Procediendo."
}

check_remote_resources

# 1. Comprobación de Git
if [[ -n $(git status -s) ]]; then
    echo "⚠️  ADVERTENCIA: Tienes cambios sin commitear."
    read -p "    ¿Quieres continuar de todos modos? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Function to build and push
build_and_push() {
    local SERVICE_SUFFIX=$1
    local DOCKERFILE=$2
    local IMAGE_TAG="latest" 
    
    local FULL_IMAGE_NAME="$REGISTRY_BASE/$MODULE_NAME$SERVICE_SUFFIX:$IMAGE_TAG"
    
    if [ -f "$DOCKERFILE" ]; then
        echo "📦 Construyendo imagen ($SERVICE_SUFFIX) desde $DOCKERFILE..."
        docker build -t "$FULL_IMAGE_NAME" -f "$DOCKERFILE" .
        echo "📤 Subiendo a GHCR..."
        docker push "$FULL_IMAGE_NAME"
        return 0
    else
        return 1
    fi
}

# 2. Smart Build Strategy
BUILD_COUNT=0

# Check for Backend
if build_and_push "-backend" "backend/Dockerfile"; then
    BUILD_COUNT=$((BUILD_COUNT+1))
fi

# Check for Frontend
if build_and_push "-frontend" "frontend.Dockerfile"; then
    BUILD_COUNT=$((BUILD_COUNT+1))
elif build_and_push "-frontend" "frontend/Dockerfile"; then
    BUILD_COUNT=$((BUILD_COUNT+1))
fi

# Fallback
if [ $BUILD_COUNT -eq 0 ]; then
    if build_and_push "" "Dockerfile"; then
        BUILD_COUNT=$((BUILD_COUNT+1))
    else
        echo "❌ Error: No se encontraron Dockerfiles (backend/Dockerfile, frontend.Dockerfile, Dockerfile)."
        exit 1
    fi
fi

# 3. Orquestación Remota
echo "🌐 Conectando con $SERVER_IP para rollout..."
ssh g@$SERVER_IP "bash -s" << EOF
    echo "   🚀 Reiniciando deployments para $MODULE_NAME en namespace $NAMESPACE..."
    
    if kubectl get deployment $MODULE_NAME-backend -n $NAMESPACE >/dev/null 2>&1; then
        kubectl rollout restart deployment/$MODULE_NAME-backend -n $NAMESPACE
        kubectl rollout status deployment/$MODULE_NAME-backend -n $NAMESPACE
    fi
    
    if kubectl get deployment $MODULE_NAME-frontend -n $NAMESPACE >/dev/null 2>&1; then
        kubectl rollout restart deployment/$MODULE_NAME-frontend -n $NAMESPACE
        kubectl rollout status deployment/$MODULE_NAME-frontend -n $NAMESPACE
    fi
    
    if kubectl get deployment $MODULE_NAME -n $NAMESPACE >/dev/null 2>&1; then
        kubectl rollout restart deployment/$MODULE_NAME -n $NAMESPACE
        kubectl rollout status deployment/$MODULE_NAME -n $NAMESPACE
    fi
EOF

echo "✅ Despliegue completado con éxito."
