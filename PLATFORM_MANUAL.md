# Nekazari Platform Manual

## Chapter 1: Introduction & Architecture

The Nekazari Platform is a comprehensive agricultural management system built on microservices and the FIWARE ecosystem. It integrates IoT data ingestion, geospatial analysis, and robotics management into a unified interface.

### Architecture Overview
The platform runs on Kubernetes and is composed of several functional layers:
- **Infrastructure Layer**: Databases and message brokers.
- **Core Layer**: Identity management and Context Broker (Orion-LD).
- **Service Layer**: Specialized microservices for business logic.
- **Ingestion Layer**: Handling data from sensors, robots, and external APIs.
- **Presentation Layer**: Web frontend and API gateways.

---

## Chapter 2: Core Infrastructure

### Databases
- **PostgreSQL + TimescaleDB**: The primary relational database, enhanced with TimescaleDB for efficient storage of time-series data (telemetry).
- **MongoDB**: Used by the Orion-LD Context Broker to store NGSI-LD entities.
- **Redis**: Provides caching and task queue capabilities for background workers.

### Identity & Access Management
- **Keycloak**: The central authentication server. It handles:
  - Single Sign-On (SSO).
  - User federation.
  - Role-Based Access Control (RBAC).
  - OAuth2/OIDC flows for all services.

### FIWARE Core
- **Orion-LD (Context Broker)**: The heart of the platform. It manages the current state of all entities (Digital Twins) using the NGSI-LD standard. All data updates flow through Orion-LD.

---

## Chapter 3: Data Ingestion & IoT

### Sensor Ingestion
- **Sensor Ingestor**: The main entry point for IoT data. It receives telemetry from devices and translates it into NGSI-LD format for the Context Broker.
- **IoT Agent JSON**: Acts as a backend for the Sensor Ingestor to handle MQTT/HTTP translation.
- **Mosquitto**: An MQTT broker that allows field devices to publish data asynchronously.

### Robotics Integration
- **ROS2-FIWARE Bridge**: Connects ROS2-based robots to the platform. It subscribes to ROS2 topics and updates the corresponding Digital Twins in Orion-LD.
- **WireGuard VPN**: Provides a secure network tunnel for robots deployed in the field to communicate with the platform.

---

## Chapter 4: Business Logic Services

### Entity Management
- **Entity Manager**: Provides a simplified API for creating, updating, and deleting agricultural entities (Parcels, Sensors, Tractors, etc.).
- **API Gateway**: The single entry point for external clients, handling routing, authentication, and rate limiting.

### Tenant & User Management
- **Tenant User API**: Manages multi-tenancy. It allows creating organizations (tenants) and assigning users to them.
- **Tenant Webhook**: Automates the setup of new tenants, including creating dedicated database schemas and Grafana organizations.

---

## Chapter 5: Advanced Modules

### Vegetation & Geospatial
Vegetation indices (NDVI) and satellite imagery are provided by external modules such as `nekazari-module-vegetation-health`. The platform architecture supports pluggable geospatial addons.

### Weather Module
- **Weather Worker**: Continuously fetches meteorological data from providers like AEMET and OpenMeteo, storing it in TimescaleDB for historical analysis and forecasting.

### Risk Management
- **Risk Orchestrator & Worker**: A system for evaluating agricultural risks based on telemetry and weather data. It runs automated workflows to alert farmers of potential issues (e.g., frost, pests).

---

## Chapter 6: Monitoring & Observability

### System Monitoring
- **Prometheus**: Collects metrics from all microservices and Kubernetes nodes.
- **Grafana**: Provides visualization dashboards. It is integrated with Keycloak for authentication and supports multi-tenancy, allowing each organization to see only their own data.

### API Validation
- **API Validator**: A sidecar service that ensures all requests to the platform APIs are authenticated and authorized against Keycloak.
