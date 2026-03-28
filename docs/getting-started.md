---
title: "Getting Started"
description: "How to run Nekazari Platform locally with Docker Compose in under 5 minutes."
---

# Getting Started

Run the full Nekazari platform locally for evaluation or development.

## Requirements

| Tool | Minimum version | Check |
|------|----------------|-------|
| **Docker** | 24.0+ | `docker --version` |
| **Docker Compose** | v2.20+ (plugin) | `docker compose version` |
| **RAM** | 8 GB free recommended | |
| **Disk** | ~5 GB for images | |

> **Windows/Mac**: Docker Desktop includes both Docker and Compose.
> **Linux**: Install Docker Engine + compose plugin (`apt install docker-compose-plugin`).

## Quick start

```bash
# 1. Clone the repository
git clone https://github.com/nkz-os/nkz.git
cd nkz

# 2. Create your environment file
cp .env.example .env

# 3. Build and start (first time: ~10 min for frontend build)
docker compose up -d

# 4. Wait for all services to be healthy (~2-3 min)
docker compose ps

# 5. Open the platform
#    http://localhost:3000
```

## Demo accounts

| User | Password | Role | Tenant |
|------|----------|------|--------|
| `demo@nekazari.local` | `Demo1234!` | Farmer | demo-farm |
| `admin@nekazari.local` | `Admin1234!` | PlatformAdmin | platformadmin |

> Passwords are defined in `.env` (`DEMO_PASSWORD`, `ADMIN_PASSWORD`). Change them if you like.

## What gets created automatically

On first start, init containers set up everything:

- **PostgreSQL**: schema migrations (60+ tables), demo weather and risk data
- **Keycloak**: `nekazari` realm with OIDC clients, roles, and demo users
- **Orion-LD**: two demo parcels (vineyard + olive grove in Olite, Navarra)
- **MinIO**: `nekazari-frontend` and `assets-3d` buckets

## Checking service health

```bash
# All services at a glance
docker compose ps

# Expected: all services show "healthy" or "Up"
# Keycloak takes the longest (~60-90s on first start)

# Check a specific service
docker compose logs api-gateway
docker compose logs keycloak
```

## Architecture overview (what's running)

```
http://localhost:3000
       |
    [nginx] ─── /       → React frontend (SPA)
       |    ─── /api/   → api-gateway (Flask)
       |    ─── /auth/  → Keycloak (OIDC)
       |
    [api-gateway]
       ├── entity-manager    (FIWARE entity management)
       ├── tenant-webhook    (tenant + user management)
       ├── tenant-user-api   (user CRUD)
       ├── timeseries-reader (TimescaleDB queries)
       ├── sdm-integration   (Smart Data Models)
       ├── risk-api          (risk assessment API)
       └── weather-worker    (weather data ingestion)

    [infrastructure]
       ├── PostgreSQL + TimescaleDB  (port 5432)
       ├── MongoDB                   (port 27017)
       ├── Redis                     (port 6379)
       ├── Orion-LD                  (port 1026)
       ├── MinIO                     (port 9000, console 9001)
       └── Mosquitto MQTT            (port 1883)
```

## Common operations

```bash
# Stop everything (keeps data)
docker compose stop

# Start again (fast, no rebuild)
docker compose start

# View logs for a service
docker compose logs -f api-gateway

# Rebuild after code changes
docker compose build api-gateway
docker compose up -d api-gateway

# Full cleanup (removes all data!)
docker compose down -v
```

## Troubleshooting

### "Keycloak takes forever to start"

Keycloak's first start imports the realm and builds caches. This can take 60-90 seconds. All services that depend on it (api-gateway, entity-manager, frontend) wait automatically.

```bash
# Check progress
docker compose logs -f keycloak
# Look for: "Keycloak 25.0.6 ... started in XXs"
```

### "Frontend shows 'Loading' but never finishes"

The frontend depends on both Keycloak and the API gateway. Wait until `docker compose ps` shows all services as healthy.

### "Port 3000 already in use"

Another process is using port 3000. Either stop it or change the port:

```bash
# Edit docker-compose.yml, change "3000:80" to "8080:80"
# Then access http://localhost:8080
```

### "Out of disk space"

Docker images accumulate over time. Clean unused images:

```bash
docker system prune -f
```

## Optional: CesiumJS 3D maps

The platform includes CesiumJS for 3D terrain visualization. It works without a token (basic maps), but for full terrain you need a free Cesium Ion token:

1. Sign up at [cesium.com/ion](https://cesium.com/ion/)
2. Create a token (default access)
3. Add to `.env`: `CESIUM_TOKEN=your_token_here`
4. Restart: `docker compose up -d frontend`

## Optional: Weather data

The weather worker uses [Open-Meteo](https://open-meteo.com/) (free, no API key needed) by default. For OpenWeather as an additional source:

1. Get an API key at [openweathermap.org](https://openweathermap.org/api)
2. Add to `.env`: `OPENWEATHER_API_KEY=your_key_here`
3. Restart: `docker compose up -d weather-worker`

## Next steps

- Explore the **map view** — the two demo parcels appear near Olite (Navarra)
- Check **weather data** — 7 days of synthetic hourly observations
- Try the **risk dashboard** — spray suitability, frost, wind spray, water stress
- Access **MinIO console** at `http://localhost:9001` (login: `minioadmin`/`minioadmin`)
- Access **Keycloak admin** at `http://localhost:3000/auth` (login: `admin`/`admin`)
