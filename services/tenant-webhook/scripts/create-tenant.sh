#!/bin/bash
# =============================================================================
# Tenant Bootstrap Script - Automated Tenant Creation
# =============================================================================
# This script creates a complete tenant environment with proper network policies
# Usage: ./create-tenant.sh <tenant-id> [namespace]

set -euo pipefail

# Configuration
TENANT_ID="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Deployment domain — must be set in the environment before running this script
PRODUCTION_DOMAIN="${PRODUCTION_DOMAIN:-}"
if [[ -z "${PRODUCTION_DOMAIN}" ]]; then
    echo "ERROR: PRODUCTION_DOMAIN environment variable is required." >&2
    echo "  export PRODUCTION_DOMAIN=nkz.example.com" >&2
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Normalize tenant_id: ensure it doesn't already have 'nekazari-' prefix
# This prevents issues like 'nekazari-nekazari-tenant-test-1'
if [[ "${TENANT_ID}" == nekazari-* ]]; then
    log_warning "Tenant ID '${TENANT_ID}' already has 'nekazari-' prefix, removing it"
    TENANT_ID="${TENANT_ID#nekazari-}"
fi
# Ensure tenant_id doesn't already have 'nekazari-tenant-' prefix
if [[ "${TENANT_ID}" == nekazari-tenant-* ]]; then
    log_warning "Tenant ID '${TENANT_ID}' already has 'nekazari-tenant-' prefix, removing it"
    TENANT_ID="${TENANT_ID#nekazari-tenant-}"
fi
# Construct namespace with proper prefix
NAMESPACE="${2:-nekazari-tenant-${TENANT_ID}}"

# Validation
if [[ -z "${TENANT_ID}" ]]; then
    log_error "Tenant ID is required"
    echo "Usage: $0 <tenant-id> [namespace]"
    echo "Example: $0 tenant-test-1"
    echo "Note: tenant-id should NOT include 'nekazari-' prefix (it will be added automatically)"
    exit 1
fi

if [[ ! "${TENANT_ID}" =~ ^[a-z0-9-]+$ ]]; then
    log_error "Tenant ID must contain only lowercase letters, numbers, and hyphens"
    exit 1
fi

# Log normalized tenant_id and namespace for debugging
log_info "Tenant ID (normalized): ${TENANT_ID}"
log_info "Namespace: ${NAMESPACE}"
log_info "Creating tenant: ${TENANT_ID} in namespace: ${NAMESPACE}"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    log_error "kubectl is not installed or not in PATH"
    exit 1
fi

# Check if we can connect to cluster
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster"
    exit 1
fi

# Create namespace
log_info "Creating namespace: ${NAMESPACE}"
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

# Add tenant label to namespace
kubectl label namespace "${NAMESPACE}" tenant-id="${TENANT_ID}" --overwrite

# Create tenant-specific network policies
log_info "Creating network policies for tenant: ${TENANT_ID}"

# Default deny policy for tenant namespace
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: ${NAMESPACE}
  labels:
    tenant-id: ${TENANT_ID}
    policy-type: security
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
EOF

# Essential services access for tenant
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: essential-services-access
  namespace: ${NAMESPACE}
  labels:
    tenant-id: ${TENANT_ID}
    policy-type: infrastructure
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 80
    - protocol: TCP
      port: 443
  
  egress:
  # DNS resolution
  - to: []
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
  # PostgreSQL access (needed for database provisioning)
  - to:
    - namespaceSelector:
        matchLabels:
          name: nekazari
    ports:
    - protocol: TCP
      port: 5432
  # Allow all egress to nekazari namespace (for essential services)
  - to:
    - namespaceSelector:
        matchLabels:
          name: nekazari
EOF

# Create tenant-specific secrets (secure)
log_info "Creating tenant-specific secrets"
TENANT_DB_PASSWORD=$(openssl rand -base64 16)
TENANT_DB_URL="postgresql://${TENANT_ID}:${TENANT_DB_PASSWORD}@timescaledb:5432/${TENANT_ID}"

kubectl create secret generic "${TENANT_ID}-secrets" \
    --namespace="${NAMESPACE}" \
    --from-literal=tenant-id="${TENANT_ID}" \
    --from-literal=database-url="${TENANT_DB_URL}" \
    --from-literal=database-password="${TENANT_DB_PASSWORD}" \
    --dry-run=client -o yaml | kubectl apply -f -

# Copy postgresql-secret to tenant namespace (needed for DB provisioning job)
log_info "Copying postgresql-secret to tenant namespace"
POSTGRES_PASSWORD=$(kubectl get secret postgresql-secret -n nekazari -o jsonpath='{.data.password}' | base64 -d 2>/dev/null || echo "")
if [ -n "${POSTGRES_PASSWORD}" ]; then
    kubectl create secret generic postgresql-secret \
        --namespace="${NAMESPACE}" \
        --from-literal=password="${POSTGRES_PASSWORD}" \
        --dry-run=client -o yaml | kubectl apply -f -
    log_success "PostgreSQL secret copied to tenant namespace"
else
    log_warning "Could not read postgresql-secret from nekazari namespace, job may fail"
fi

# Create tenant-specific service account
log_info "Creating service account for tenant: ${TENANT_ID}"
kubectl create serviceaccount "${TENANT_ID}-sa" \
    --namespace="${NAMESPACE}" \
    --dry-run=client -o yaml | kubectl apply -f -

# Create tenant-specific role binding (basic permissions)
log_info "Creating role binding for tenant: ${TENANT_ID}"
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: ${NAMESPACE}
  name: ${TENANT_ID}-role
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${TENANT_ID}-rolebinding
  namespace: ${NAMESPACE}
subjects:
- kind: ServiceAccount
  name: ${TENANT_ID}-sa
  namespace: ${NAMESPACE}
roleRef:
  kind: Role
  name: ${TENANT_ID}-role
  apiGroup: rbac.authorization.k8s.io
EOF

# Create tenant-specific ingress template
log_info "Creating ingress template for tenant: ${TENANT_ID}"
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${TENANT_ID}-ingress
  namespace: ${NAMESPACE}
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: ${TENANT_ID}.${PRODUCTION_DOMAIN}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${TENANT_ID}-frontend-service
            port:
              number: 80
EOF

# Create database provisioning job
log_info "Creating database provisioning job for tenant: ${TENANT_ID}"
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: tenant-db-provision-${TENANT_ID}
  namespace: ${NAMESPACE}
  labels:
    tenant-id: ${TENANT_ID}
    app: tenant-db-provision
spec:
  backoffLimit: 3
  template:
    metadata:
      labels:
        tenant-id: ${TENANT_ID}
        app: tenant-db-provision
    spec:
      restartPolicy: OnFailure
      containers:
      - name: db-provision
        image: postgres:15-alpine
        env:
        - name: PGHOST
          value: "postgresql-service.nekazari.svc.cluster.local"
        - name: PGPORT
          value: "5432"
        - name: PGUSER
          value: "postgres"
        - name: PGPASSWORD
          valueFrom:
            secretKeyRef:
              name: postgresql-secret
              key: password
        - name: TENANT_ID
          value: "${TENANT_ID}"
        - name: TENANT_DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: "${TENANT_ID}-secrets"
              key: database-password
        command:
        - /bin/sh
        - -c
        - |
          set -euo pipefail
          
          echo "Creating database and user for tenant: \$TENANT_ID"
          
          # Create database
          psql -c "CREATE DATABASE \"\$TENANT_ID\";" || echo "Database \$TENANT_ID may already exist"
          
          # Create user
          psql -c "CREATE USER \"\$TENANT_ID\" WITH PASSWORD '\$TENANT_DB_PASSWORD';" || echo "User \$TENANT_ID may already exist"
          
          # Grant privileges
          psql -c "GRANT ALL PRIVILEGES ON DATABASE \"\$TENANT_ID\" TO \"\$TENANT_ID\";"
          
          echo "Database provisioning completed for tenant: \$TENANT_ID"
EOF

# Wait for database provisioning to complete (with error handling and reduced timeout)
log_info "Waiting for database provisioning to complete..."
# Check if job exists first
if kubectl get job tenant-db-provision-${TENANT_ID} -n ${NAMESPACE} &>/dev/null; then
    # Use shorter timeout and check both complete and failed conditions
    if kubectl wait --for=condition=complete job/tenant-db-provision-${TENANT_ID} -n ${NAMESPACE} --timeout=120s 2>/dev/null; then
        log_success "Database provisioning completed successfully"
    elif kubectl wait --for=condition=failed job/tenant-db-provision-${TENANT_ID} -n ${NAMESPACE} --timeout=5s 2>/dev/null; then
        log_warning "Database provisioning job failed, checking logs..."
        kubectl logs -n ${NAMESPACE} -l app=tenant-db-provision --tail=50 || true
        log_warning "Continuing tenant creation despite DB provisioning failure (tenant can use shared database)"
    else
        log_warning "Database provisioning job is taking longer than expected or may be stuck"
        kubectl get job tenant-db-provision-${TENANT_ID} -n ${NAMESPACE} -o wide
        # Don't wait forever - continue after 2 minutes
        log_warning "Continuing tenant creation (DB provisioning can complete asynchronously)"
    fi
else
    log_warning "Database provisioning job not found - tenant will use shared database"
fi

# Create tenant-specific deployment template
log_info "Creating deployment template for tenant: ${TENANT_ID}"
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${TENANT_ID}-frontend
  namespace: ${NAMESPACE}
  labels:
    app: ${TENANT_ID}-frontend
    tenant-id: ${TENANT_ID}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${TENANT_ID}-frontend
      tenant-id: ${TENANT_ID}
  template:
    metadata:
      labels:
        app: ${TENANT_ID}-frontend
        tenant-id: ${TENANT_ID}
    spec:
      serviceAccountName: ${TENANT_ID}-sa
      containers:
      - name: frontend
        image: nginx:alpine
        ports:
        - containerPort: 80
        env:
        - name: TENANT_ID
          value: ${TENANT_ID}
        volumeMounts:
        - name: tenant-config
          mountPath: /etc/nginx/conf.d
      volumes:
      - name: tenant-config
        configMap:
          name: ${TENANT_ID}-config
---
apiVersion: v1
kind: Service
metadata:
  name: ${TENANT_ID}-frontend-service
  namespace: ${NAMESPACE}
  labels:
    tenant-id: ${TENANT_ID}
spec:
  selector:
    app: ${TENANT_ID}-frontend
    tenant-id: ${TENANT_ID}
  ports:
  - port: 80
    targetPort: 80
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${TENANT_ID}-config
  namespace: ${NAMESPACE}
  labels:
    tenant-id: ${TENANT_ID}
data:
  nginx.conf: |
    server {
        listen 80;
        server_name ${TENANT_ID}.${PRODUCTION_DOMAIN};
        
        location / {
            return 200 'Tenant ${TENANT_ID} - Coming Soon';
            add_header Content-Type text/plain;
        }
    }
EOF

# Verify tenant creation
log_info "Verifying tenant creation..."
kubectl get namespace "${NAMESPACE}" -o wide
kubectl get pods -n "${NAMESPACE}" -l tenant-id="${TENANT_ID}"
kubectl get services -n "${NAMESPACE}" -l tenant-id="${TENANT_ID}"
kubectl get networkpolicies -n "${NAMESPACE}"

log_success "Tenant ${TENANT_ID} created successfully!"
log_info "Namespace: ${NAMESPACE}"
log_info "Access URL: https://${TENANT_ID}.${PRODUCTION_DOMAIN}"
log_info "Service Account: ${TENANT_ID}-sa"
log_info "Secrets: ${TENANT_ID}-secrets"

# Create cleanup script
log_info "Creating cleanup script for tenant: ${TENANT_ID}"
cat > "${PROJECT_ROOT}/scripts/cleanup-tenant-${TENANT_ID}.sh" <<EOF
#!/bin/bash
# Cleanup script for tenant: ${TENANT_ID}
# Usage: ./cleanup-tenant-${TENANT_ID}.sh

set -euo pipefail

echo "Cleaning up tenant: ${TENANT_ID}"
kubectl delete namespace "${NAMESPACE}" --ignore-not-found=true
rm -f "${PROJECT_ROOT}/scripts/cleanup-tenant-${TENANT_ID}.sh"
echo "Tenant ${TENANT_ID} cleanup completed"
EOF

chmod +x "${PROJECT_ROOT}/scripts/cleanup-tenant-${TENANT_ID}.sh"

log_success "Tenant bootstrap completed!"
log_info "To clean up this tenant, run: ./scripts/cleanup-tenant-${TENANT_ID}.sh"

# Optional: crear suscripciones de QuantumLeap de forma automática (idempotente)
ENABLE_QL_SUBSCRIPTIONS="${ENABLE_QL_SUBSCRIPTIONS:-true}"
if [ "${ENABLE_QL_SUBSCRIPTIONS}" = "true" ]; then
    log_info "Creando suscripciones de QuantumLeap para el tenant ${TENANT_ID} (idempotente)"
    if [ -x "${PROJECT_ROOT}/scripts/setup-quantumleap-subscriptions.sh" ]; then
        if "${PROJECT_ROOT}/scripts/setup-quantumleap-subscriptions.sh" "${TENANT_ID}"; then
            log_success "Suscripciones de QuantumLeap creadas/verificadas para ${TENANT_ID}"
        else
            log_warning "No se pudieron crear/verificar suscripciones de QuantumLeap para ${TENANT_ID}. Puedes reintentar manualmente: scripts/setup-quantumleap-subscriptions.sh ${TENANT_ID}"
        fi
    else
        log_warning "scripts/setup-quantumleap-subscriptions.sh no encontrado o no es ejecutable"
    fi
else
    log_info "ENABLE_QL_SUBSCRIPTIONS=false: Omitiendo creación automática de suscripciones de QuantumLeap"
fi
