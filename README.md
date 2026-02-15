# Nekazari Platform

**Open-source, modular platform for precision agriculture, industry, and environmental sciences.**

Built on [FIWARE NGSI-LD](https://www.fiware.org/) standards, Nekazari provides a complete operating system for IoT-driven operations with digital twins, real-time telemetry, geospatial analysis, and a curated module marketplace.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

## Key Features

- **NGSI-LD Context Broker** — Digital twin management via Orion-LD
- **Multi-tenant architecture** — Keycloak OIDC, row-level security in PostgreSQL, tenant isolation
- **Time-series telemetry** — TimescaleDB for high-frequency sensor data
- **IoT ingestion** — MQTT, HTTP, with API-key and JWT authentication
- **3D geospatial visualization** — CesiumJS maps with custom layer system
- **Modular addon system** — Slot-based frontend integration with curated marketplace
- **Risk management** — Automated agronomic and energy risk evaluation
- **Weather integration** — OpenMeteo and AEMET data ingestion
- **Multi-language** — 6 languages (ES, EN, CA, EU, FR, PT)

## Architecture

```
                    ┌─────────────────────────────────┐
                    │         Traefik Ingress          │
                    └──────────┬──────────┬────────────┘
                               │          │
                    ┌──────────▼──┐  ┌────▼───────────┐
                    │  Frontend   │  │  API Gateway    │
                    │  (React/TS) │  │  (Flask/Python) │
                    └─────────────┘  └────┬────────────┘
                                          │
         ┌────────────┬───────────┬───────┴────┬──────────────┐
         │            │           │            │              │
    ┌────▼─────┐ ┌────▼────┐ ┌───▼─────┐ ┌───▼──────┐ ┌─────▼──────┐
    │ Entity   │ │ Weather │ │Telemetry│ │ Risk     │ │  Modules   │
    │ Manager  │ │ Worker  │ │ Worker  │ │ Engine   │ │ (Addons)   │
    └────┬─────┘ └────┬────┘ └───┬─────┘ └───┬──────┘ └────────────┘
         │            │          │            │
    ┌────▼────────────▼──────────▼────────────▼──┐
    │  Orion-LD  │  TimescaleDB  │  MongoDB      │
    │  (NGSI-LD) │  (PostgreSQL) │  (Documents)  │
    └─────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript 5, Vite 5, Tailwind CSS, CesiumJS |
| Backend | Python (Flask, FastAPI), Gunicorn |
| Data | FIWARE NGSI-LD (Orion-LD), PostgreSQL/TimescaleDB, MongoDB, Redis |
| Auth | Keycloak 26 (OIDC/OAuth2, RS256 JWKs, multi-tenant) |
| Messaging | MQTT (Mosquitto), Redis queues |
| Infrastructure | Kubernetes (K3s), Traefik, cert-manager, MinIO |
| Monitoring | Prometheus, Grafana (manifests ready, not yet deployed) |
| i18n | react-i18next (6 languages) |

## Repository Structure

| Directory | Description |
|-----------|-------------|
| `apps/` | Frontend applications (React, Cesium 3D maps) |
| `services/` | Backend microservices (Python/Flask, FastAPI) |
| `k8s/` | Kubernetes manifests and deployment configs |
| `config/` | TimescaleDB, Prometheus, Grafana configuration |
| `scripts/` | Deployment, build, and operations automation |
| `docs/` | Platform documentation |
| `module-template/` | Template for creating new addon modules |

## Module Ecosystem

Nekazari supports a modular addon architecture with predefined frontend slots:

| Module | Description | Status |
|--------|-------------|--------|
| **Vegetation Health** | NDVI/vegetation indices from satellite imagery | Active |
| **LiDAR Processing** | Point cloud analysis and terrain modeling | Active |
| **Intelligence** | AI/ML features for predictive analytics | Active |
| **Cadastral Data** | Spanish cadastral registry integration | Active |
| **Connectivity** | Cellular/network monitoring for IoT devices | Active |
| **Robotics** | ROS2 integration, ISOBUS for agricultural equipment | Active |
| **Odoo ERP** | Enterprise resource planning integration | Active |
| **n8n Workflows** | Automation and workflow orchestration | Active |

Modules are developed independently and installed through the Nekazari marketplace.

## Quick Start

```bash
git clone https://github.com/k8-benetis/nkz.git
cd nkz

# Copy and configure environment
cp env.example .env
# Edit .env with your configuration

# Deploy to Kubernetes
./scripts/deploy-platform.sh
```

See the [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) for detailed instructions.

## Documentation

- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) — Installation and operations
- [API Integration](docs/api/README.md) — Device and system API reference
- [External Developer Guide](docs/development/EXTERNAL_DEVELOPER_GUIDE.md) — Building modules
- [Module Installation](docs/modules/EXTERNAL_MODULE_INSTALLATION.md) — Installing addons

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
