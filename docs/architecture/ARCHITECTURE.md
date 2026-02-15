# Nekazari Platform Architecture

## Overview

Nekazari runs as a set of microservices on a **Kubernetes (K3s)** cluster, following a layered architecture with clear separation of concerns.

```
                        Internet
                           │
                    ┌──────▼──────┐
                    │   Traefik   │  Ingress controller
                    │  (TLS/ACME) │  cert-manager + Let's Encrypt
                    └──┬───┬───┬──┘
                       │   │   │
         ┌─────────────┘   │   └─────────────┐
         │                 │                 │
  ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼──────┐
  │  Frontend   │  │ API Gateway │  │   Keycloak   │
  │  (React/TS) │  │   (Flask)   │  │  (OIDC/JWT)  │
  │  :80        │  │  :5000      │  │  :8080       │
  └─────────────┘  └──────┬──────┘  └──────────────┘
                          │
        ┌─────────┬───────┼────────┬──────────┐
        │         │       │        │          │
  ┌─────▼───┐ ┌───▼───┐ ┌▼──────┐ ┌▼────────┐ ┌▼──────────┐
  │ Entity  │ │Weather│ │Telem. │ │ Risk    │ │ Tenant    │
  │ Manager │ │Worker │ │Worker │ │ Engine  │ │ Webhook   │
  └────┬────┘ └───┬───┘ └──┬───┘ └───┬─────┘ └─────┬─────┘
       │          │        │         │              │
  ┌────▼──────────▼────────▼─────────▼──────────────▼───┐
  │                    Data Layer                         │
  │  ┌──────────┐  ┌──────────┐  ┌───────┐  ┌───────┐  │
  │  │TimescaleDB│  │ MongoDB  │  │ Redis │  │ MinIO │  │
  │  │(Postgres) │  │ (Orion)  │  │(Cache)│  │(Files)│  │
  │  └──────────┘  └──────────┘  └───────┘  └───────┘  │
  └─────────────────────────────────────────────────────┘
```

## Architecture Layers

### 1. Ingress Layer

**Traefik** serves as the Kubernetes ingress controller, handling:
- TLS termination with automatic Let's Encrypt certificates via cert-manager
- Host-based routing to services
- CORS middleware
- Load balancing

| Domain | Routes to |
|--------|-----------|
| `nekazari.robotika.cloud` | Frontend (React app) |
| `nkz.robotika.cloud` | API Gateway + backend services |
| `auth.robotika.cloud` | Keycloak authentication |

### 2. Authentication Layer

**Keycloak 26** provides multi-tenant identity management:
- OIDC/OAuth2 with RS256 asymmetric JWT signing
- Multi-tenant isolation via `tenant_id` user attribute
- Realm: `nekazari`
- JWKS endpoint for token verification by all services

All backend services validate JWT tokens independently using Keycloak's public keys. No shared symmetric secrets.

### 3. API Layer

#### Core Services

| Service | Framework | Purpose |
|---------|-----------|---------|
| **API Gateway** | Flask | Central entry point — JWT validation, FIWARE header injection, rate limiting (60 req/min), security headers |
| **Entity Manager** | Flask | NGSI-LD entity CRUD, digital twin management, asset management, module health |
| **Tenant User API** | Flask | Multi-tenant user management, role assignment |
| **Tenant Webhook** | Flask | Tenant lifecycle events, activation codes |
| **Email Service** | Flask | SMTP notification delivery |
| **SDM Integration** | FastAPI | External Smart Data Models integration |

#### Worker Services

| Service | Framework | Purpose |
|---------|-----------|---------|
| **Weather Worker** | FastAPI | Meteorological data ingestion (OpenMeteo, AEMET) |
| **Telemetry Worker** | FastAPI | IoT sensor data processing, MQTT integration |
| **Timeseries Reader** | Flask | Historical data retrieval from TimescaleDB |
| **Risk API** | Flask | Risk query and management |
| **Risk Orchestrator** | Python | Risk event coordination and scheduling |

#### FIWARE Components

| Service | Purpose |
|---------|---------|
| **Orion-LD** | NGSI-LD Context Broker — entity storage and subscription management |
| **IoT Agent JSON** | Protocol translation for IoT devices |
| **Mosquitto** | MQTT broker for device communication |

### 4. Data Layer

| Service | Purpose | Storage |
|---------|---------|---------|
| **PostgreSQL/TimescaleDB** | Primary structured data, time-series hypertables, tenant RLS | hostPath PV |
| **MongoDB** | Orion-LD entity registry | hostPath PV |
| **Redis** | Cache, job queues, rate limiting state | in-memory |
| **MinIO** | Object storage (frontend assets, user uploads) | hostPath PV |

### 5. Monitoring Layer (Not yet deployed)

Monitoring infrastructure manifests and configuration are prepared in `k8s/monitoring/` and `config/` but are **not currently deployed** in production. Services expose Prometheus-compatible metrics endpoints for when monitoring is enabled.

| Service | Purpose | Status |
|---------|---------|--------|
| **Prometheus** | Metrics collection and alerting | Manifests ready, not deployed |
| **Grafana** | Dashboards (with Keycloak SSO) | Manifests ready, not deployed |

## Multi-Tenancy

Tenant isolation is enforced at multiple levels:

1. **JWT claims** — `tenant_id` attribute in Keycloak tokens
2. **API Gateway** — Injects `Fiware-Service` header from JWT
3. **PostgreSQL** — Row-Level Security (RLS) policies per tenant
4. **Orion-LD** — `Fiware-Service` header for entity partitioning

```
Request → API Gateway → Validate JWT → Extract tenant_id
                      → Inject Fiware-Service header
                      → Forward to backend service
```

## Module System

Modules extend the platform through a slot-based frontend architecture:

```
┌─────────────────────────────────────────────┐
│                Host Application              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │entity-   │ │map-layer │ │context-  │    │
│  │tree slot │ │  slot    │ │panel slot│    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘    │
│       │             │            │           │
│  ┌────▼─────────────▼────────────▼─────┐    │
│  │         Module Registry              │    │
│  └────┬─────────────┬──────────────┬───┘    │
│       │             │              │         │
│  ┌────▼───┐  ┌──────▼────┐  ┌─────▼────┐   │
│  │ LiDAR  │  │Vegetation │  │  Odoo    │   │
│  │ Module  │  │  Module   │  │  Module  │   │
│  └────────┘  └───────────┘  └──────────┘   │
└─────────────────────────────────────────────┘
```

Available frontend slots: `entity-tree`, `map-layer`, `context-panel`, `bottom-panel`, `layer-toggle`

Each module is an independent repository with its own:
- Backend service(s) deployed as K8s Deployments
- Frontend components loaded via dynamic imports
- Database schema with tenant-scoped migrations
- Ingress rules for API routing

## Deployment

### GitOps Workflow

```bash
# 1. Develop locally
git checkout -b feature/my-change

# 2. Push and create PR
git push && gh pr create

# 3. CI builds and publishes container images to GHCR

# 4. On server: pull and apply
cd ~/nkz && git pull
sudo kubectl apply -f k8s/...
```

### Container Images

All core service images are published to `ghcr.io/k8-benetis/nkz/<service>:latest`.

Build locally with:
```bash
./scripts/build-images.sh
```

### Namespace

All resources run in the `nekazari` Kubernetes namespace:
```bash
sudo kubectl get pods -n nekazari
```

## Security Model

| Layer | Mechanism |
|-------|-----------|
| Network | UFW firewall (ports 22, 80, 443 only) |
| Transport | TLS everywhere (Let's Encrypt, auto-renewal) |
| Authentication | Keycloak OIDC, RS256 JWT, JWKS verification |
| Authorization | RBAC via Keycloak roles + PostgreSQL RLS |
| API | Rate limiting (60 req/min per tenant), security headers (CSP, HSTS, X-Frame-Options) |
| CORS | Explicit origin whitelist |
| Secrets | Kubernetes Secrets, no hardcoded credentials |
