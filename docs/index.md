---
layout: home

hero:
  name: Nekazari
  text: Open-source platform for precision agriculture
  tagline: FIWARE NGSI-LD standards, multi-tenant isolation, modular addon marketplace. From parcels to predictive analytics.
  actions:
    - theme: brand
      text: Quick Start
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/k8-benetis/nkz

features:
  - title: Digital Twins (NGSI-LD)
    details: Manage parcels, devices, and assets as interoperable entities via Orion-LD Context Broker.
  - title: Multi-Tenant Isolation
    details: Keycloak OIDC authentication with row-level security in PostgreSQL. Each organization gets its own isolated environment.
  - title: Agronomic Risk Engine
    details: Automated hourly evaluation of spray suitability, frost, wind, water stress, and GDD-based pest alerts.
  - title: 3D Geospatial Viewer
    details: CesiumJS-powered map with custom layers, LiDAR 3D tiles, and NDVI satellite overlays.
  - title: Module Marketplace
    details: Install and uninstall addons per tenant at runtime. No rebuild, no redeploy. Create your own with the SDK.
  - title: IoT & Telemetry
    details: MQTT and HTTP ingestion into TimescaleDB hypertables. Sub-second queries across millions of data points.
---
