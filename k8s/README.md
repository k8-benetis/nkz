# Nekazari Platform - Kubernetes Manifests

This directory contains all Kubernetes manifests for the Nekazari Platform, organized following a **Core + Addons** architecture pattern.

## 📁 Directory Structure

```
k8s/
├── core/                    # 🟢 Essential platform components (always deploy)
│   ├── infrastructure/      # Databases, caches, storage
│   ├── auth/                # Keycloak authentication
│   ├── fiware/              # Orion-LD Context Broker
│   ├── services/            # Core microservices
│   ├── frontend/            # Frontend host & modules server
│   ├── networking/          # Ingress, certificates, CORS
│   ├── configmaps/          # Platform configuration
│   └── secrets/             # Secret templates
│
├── addons/                  # 🟡 Optional modules (deploy per tenant needs)
│   ├── analytics/           # Data analysis modules
│   │   ├── ndvi/            # Satellite imagery processing
│   │   └── risk/            # Risk assessment
│   ├── weather/             # Weather data integration
│   ├── robotics/            # ROS2 and ISOBUS integration
│   ├── visualization/       # GeoServer, 3D terrain
│   ├── simulation/          # Agricultural simulation
│   └── iot/                 # IoT automation (n8n, MQTT manager)
│
├── monitoring/              # 📊 Observability stack
│   ├── monitoring-deployments.yaml
│   ├── prometheus-ingress.yaml
│   └── alertmanager-config.yaml
│
├── common/                  # 🔧 Shared resources
│   ├── rbac/                # Role-based access control
│   ├── network-policies/    # Network security policies
│   └── secrets/             # Common secret templates
│
└── deprecated/              # 🔴 Legacy/deprecated manifests
```

## 🚀 Deployment Guide

### Prerequisites

1. K3s cluster running
2. `kubectl` configured
3. GitHub Container Registry access (ghcr-secret)
4. Required secrets configured

### Step 1: Deploy Core Platform

The core platform provides the minimum viable system for tenant authentication, entity management, and basic IoT operations.

```bash
# 1. Infrastructure (databases, caches)
kubectl apply -f k8s/core/infrastructure/

# 2. ConfigMaps and Secrets (configure first!)
kubectl apply -f k8s/core/configmaps/
kubectl apply -f k8s/core/secrets/  # After filling in values

# 3. Authentication (Keycloak)
kubectl apply -f k8s/core/auth/keycloak-deployment.yaml
kubectl apply -f k8s/core/auth/keycloak-ingress.yaml
kubectl apply -f k8s/core/auth/keycloak-rbac.yaml

# 4. FIWARE Context Broker
kubectl apply -f k8s/core/fiware/

# 5. Core Services
kubectl apply -f k8s/core/services/

# 6. Frontend
kubectl apply -f k8s/core/frontend/

# 7. Networking (Ingress, certificates)
kubectl apply -f k8s/core/networking/
```

### Step 2: Deploy Optional Addons

Deploy addons based on tenant requirements:

```bash
# Analytics - NDVI (Satellite imagery)
kubectl apply -f k8s/addons/analytics/ndvi/

# Analytics - Risk Assessment
kubectl apply -f k8s/addons/analytics/risk/

# Weather Integration
kubectl apply -f k8s/addons/weather/

# Robotics (ROS2, ISOBUS)
kubectl apply -f k8s/addons/robotics/

# Visualization (GeoServer)
kubectl apply -f k8s/addons/visualization/

# Simulation
kubectl apply -f k8s/addons/simulation/

# IoT Automation (n8n, MQTT)
kubectl apply -f k8s/addons/iot/
```

### Step 3: Deploy Monitoring (Recommended)

```bash
kubectl apply -f k8s/monitoring/
```

## 📦 Module Catalog

| Module | Category | Directory | Plan Required | Description |
|--------|----------|-----------|---------------|-------------|
| **NDVI** | Analytics | `addons/analytics/ndvi/` | Premium | Satellite imagery & vegetation indices |
| **Risk** | Analytics | `addons/analytics/risk/` | Premium | Agricultural risk assessment |
| **Weather** | Data | `addons/weather/` | Basic | Weather data integration (AEMET, OpenMeteo) |
| **ROS2 Bridge** | Robotics | `addons/robotics/` | Enterprise | Robot integration via ROS2 |
| **ISOBUS** | Robotics | `addons/robotics/` | Enterprise | Agricultural machinery integration |
| **GeoServer** | Visualization | `addons/visualization/` | Premium | WMS/WFS geospatial services |
| **Simulation** | Analytics | `addons/simulation/` | Premium | Agricultural simulations |
| **n8n** | Automation | `addons/iot/` | Premium | Workflow automation |

## 🔐 Secrets Configuration

Before deploying, configure secrets from templates:

```bash
# Core secrets (required)
cp k8s/core/secrets/bootstrap-secret-template.yaml k8s/core/secrets/bootstrap-secret.yaml
cp k8s/core/secrets/redis-secret-template.yaml k8s/core/secrets/redis-secret.yaml
cp k8s/core/infrastructure/postgresql-secret.template.yaml k8s/core/infrastructure/postgresql-secret.yaml

# Edit and apply
kubectl apply -f k8s/core/secrets/
kubectl apply -f k8s/core/infrastructure/postgresql-secret.yaml
```

## 🔄 GitOps Workflow

This platform follows a **manual GitOps** workflow:

1. **Local development**: Make changes in your local repository
2. **Push to GitHub**: `git push origin main`
3. **Pull on server**: `ssh user@server && cd ~/nekazari-public && git pull`
4. **Apply changes**: `kubectl apply -f k8s/...`

## 📋 Core Services Reference

| Service | Purpose | Port |
|---------|---------|------|
| `api-gateway` | API entry point, routing | 5000 |
| `entity-manager` | NGSI-LD entity management | 5000 |
| `sensor-ingestor` | IoT data ingestion | 80 |
| `tenant-user-api` | Tenant & user management | 5000 |
| `tenant-webhook` | Tenant automation | 8080 |
| `cadastral-api` | Spanish cadastre integration | 5000 |
| `email-service` | Email notifications | 5000 |
| `sdm-integration` | Smart Data Models | 5000 |

## ⚠️ Important Notes

1. **Never deploy `deprecated/`** - Contains legacy manifests for reference only
2. **Core is self-sufficient** - The platform can operate with only `core/` deployed
3. **Addons are independent** - Each addon can be deployed/removed without affecting core
4. **Secrets are templates** - Always copy and configure before applying

## 🏷️ Labels Convention

All resources use consistent labeling:

```yaml
labels:
  app: <service-name>
  layer: core | addons | monitoring
  component: api | frontend | database | cache
  addon-category: analytics | weather | robotics | iot  # For addons only
```

---

**Last updated:** December 2025  
**Platform version:** 1.0.0
