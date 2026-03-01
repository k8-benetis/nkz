# Getting Started

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+) and [Docker Compose](https://docs.docker.com/compose/) (v2+)
- 8 GB RAM minimum (16 GB recommended)
- 10 GB free disk space

## Quick Start with Docker Compose

```bash
git clone https://github.com/k8-benetis/nkz.git
cd nkz
cp .env.example .env
docker compose up -d
```

The first build takes approximately 10 minutes due to the frontend multistage Docker build. Subsequent starts are fast since images are cached.

### Wait for Services

All services include healthchecks. Wait ~3 minutes for everything to initialize:

```bash
# Watch services come up
docker compose ps

# Check logs if needed
docker compose logs -f keycloak
docker compose logs -f migrations
```

### Access the Platform

| URL | Description |
|-----|-------------|
| [http://localhost:3000](http://localhost:3000) | Nekazari Frontend |
| [http://localhost:3000/auth](http://localhost:3000/auth) | Keycloak Admin Console |
| [http://localhost:9001](http://localhost:9001) | MinIO Console |

### Demo Credentials

Passwords are defined in your `.env` file (`DEMO_PASSWORD` and `ADMIN_PASSWORD`):

| User | Env Variable | Role |
|------|-------------|------|
| `demo@nekazari.local` | `DEMO_PASSWORD` | Farmer (tenant: demo-farm) |
| `admin@nekazari.local` | `ADMIN_PASSWORD` | Platform Admin |

### What You'll See

After logging in as the demo farmer:

1. **Dashboard** — MetricCards, WeatherWidget, and RiskSummaryCard with 7 days of seeded data
2. **Command Center** — CesiumJS 3D map with 2 parcels in Olite, Navarra (vineyard + olive grove)
3. **Risks** — Daily risk evaluations (spray suitability, frost, wind, water stress)
4. **Modules** — Marketplace with DataHub, Vegetation Health, and LiDAR available

### Cleanup

```bash
docker compose down -v    # removes containers, networks, and volumes
```

## What's Included

The `docker-compose.yml` orchestrates the following services:

### Infrastructure
- **PostgreSQL/TimescaleDB** — structured data, time-series hypertables
- **MongoDB** — Orion-LD entity storage
- **Redis** — cache and job queues
- **MinIO** — S3-compatible object storage
- **Mosquitto** — MQTT broker

### Platform Core
- **Keycloak** — OIDC/OAuth2 authentication with tenant isolation
- **Orion-LD** — FIWARE NGSI-LD Context Broker
- **API Gateway** — JWT validation, rate limiting, FIWARE headers
- **Entity Manager** — NGSI-LD CRUD, module marketplace, asset management

### Application Services
- **Weather Worker** — OpenMeteo/AEMET meteorological data
- **Risk Engine** — API + Worker + Orchestrator for agronomic risk evaluation
- **SDM Integration** — Smart Data Models entity management
- **Timeseries Reader** — Historical data queries from TimescaleDB
- **Tenant services** — Webhook lifecycle events, user management

### Seed Data
- 1 demo tenant (premium plan)
- 2 agricultural parcels in Olite, Navarra (NGSI-LD entities)
- 7 days of hourly weather observations
- Daily risk evaluations for 4 risk models
- 3 marketplace modules pre-installed

## Environment Variables

Copy `.env.example` to `.env` and customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | `nekazari-dev-password` | PostgreSQL password |
| `REDIS_PASSWORD` | `nekazari-redis-dev` | Redis password |
| `MONGODB_ROOT_PASSWORD` | `nekazari-mongo-dev` | MongoDB password |
| `KEYCLOAK_ADMIN_PASSWORD` | `admin` | Keycloak admin console password |
| `CESIUM_TOKEN` | *(empty)* | CesiumJS ion token for terrain/imagery |

## Next Steps

- [API Getting Started](api/01-getting-started.md) — integrate devices and systems
- [Developer Guide](development/EXTERNAL_DEVELOPER_GUIDE.md) — build custom modules
- [Architecture](architecture/ARCHITECTURE.md) — understand the platform internals
- [Deployment Guide](DEPLOYMENT_GUIDE.md) — production Kubernetes deployment
