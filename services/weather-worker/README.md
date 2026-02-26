# Weather Worker Service

Worker service for ingesting weather data from multiple sources (Open-Meteo, AEMET) and calculating derived metrics for predictive models.

**Status:** ✅ Production-ready | **Last Updated:** 2026-02-26

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Open-Meteo     │     │  Weather Worker  │     │  TimescaleDB    │
│  (Primary API)  │────▶│  (FastAPI)       │────▶│  (Analytics)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │   Orion-LD   │
                        │ (Digital     │
                        │  Twins)      │
                        └──────────────┘
```

- **Sources**: Open-Meteo (primary), AEMET (secondary for alerts only)
- **Database**: PostgreSQL + TimescaleDB (weather_observations hypertable)
- **Dual-write**: TimescaleDB (analytics) + Orion-LD (WeatherObserved entities)
- **Processing**: Automatic ingestion every hour
- **Metrics**: GDD, ET₀, Delta-T, Water Balance, Soil Moisture, Solar Radiation (GHI/DNI)

## Features

### Current (Phase 1)
- ✅ **Multi-source support**:
  - **Open-Meteo** (primary): Cobertura global UE + UK + worldwide
  - **AEMET** (secondary): Solo España — alertas oficiales
- ✅ Historical data ingestion (yesterday to close real data)
- ✅ Forecast data ingestion (7-14 days for simulations)
- ✅ Critical metrics: Temperature, Humidity, Precipitation, Wind
- ✅ **Solar Radiation (GHI/DNI)** - For solar panel energy models
- ✅ **ET₀ (Evapotranspiration)** - For irrigation models
- ✅ **Soil Moisture** (0-10cm, 10-40cm) - For sensor validation
- ✅ **GDD (Growing Degree Days)** - For pest and flowering prediction
- ✅ AEMET official alerts ingestion (Spain only: yellow/orange/red)
- ✅ Multi-tenant support (RLS)
- ✅ Prometheus metrics

### Future (Phase 2+)
- ⏳ Integration with Simulation Engine
- ⏳ Real-time alert notifications (N8N)
- ⏳ Weather data validation against sensor readings
- ⏳ Additional alert providers for other EU countries (MeteoFrance, DWD, MetOffice)
- ⏳ Additional alert providers for other EU countries (MeteoFrance, DWD, MetOffice)

## Usage

### Manual Ingestion

```python
from weather_worker import WeatherWorker

worker = WeatherWorker()
# Ingest for specific tenant and municipality
result = worker.ingest_weather_data(
    tenant_id='tenant-123',
    municipality_code='31001',  # Pamplona INE code
    latitude=42.8167,
    longitude=-1.6433
)
```

### Automatic Ingestion (CronJob)

Worker automatically runs every hour and:
1. Fetches all active `tenant_weather_locations` (all EU + UK locations)
2. Ingests historical data (yesterday) from **Open-Meteo** (global coverage)
3. Ingests forecast data (7-14 days) from **Open-Meteo** (global coverage)
4. Fetches **AEMET alerts** (Spain-only municipalities, skips if no API key)
5. Calculates derived metrics (GDD, ET₀, Delta-T, Water Balance)
6. Dual-write: TimescaleDB + Orion-LD sync

> **Coverage**: Open-Meteo provides data for all EU + UK locations. AEMET alerts are only fetched for Spanish municipalities (INE codes).

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_URL` | ✅ | — | PostgreSQL connection string |
| `OPENMETEO_API_URL` | — | `https://api.open-meteo.com/v1` | Open-Meteo API (global UE+UK) |
| `AEMET_API_KEY` | — | — | AEMET API key (Spain alerts only) |
| `AEMET_API_URL` | — | `https://opendata.aemet.es/opendata/api` | AEMET API endpoint |
| `WEATHER_INGESTION_INTERVAL_HOURS` | — | `1` | Polling interval |
| `WEATHER_FORECAST_DAYS` | — | `14` | Forecast horizon (max 16) |
| `METRICS_HOST` | — | `0.0.0.0` | Prometheus metrics host |
| `METRICS_PORT` | — | `9106` | Prometheus metrics port |
| `ORION_URL` | — | `http://orion-ld-service:1026` | Orion-LD endpoint |
| `CONTEXT_URL` | — | — | NGSI-LD @context URL |

### Coverage

| Provider | Coverage | Use Case |
|----------|----------|----------|
| **Open-Meteo** | Global (UE + UK + worldwide) | Primary source for all locations |
| **AEMET** | Spain only | Official alerts (BOE state) |

> **Recommendation**: All tenants in UE + UK should work with Open-Meteo alone. AEMET is optional for Spanish tenants who want official BOE alerts.

## Deployment

```bash
# Build image
docker build -t nekazari/weather-worker:latest -f services/weather-worker/Dockerfile services/weather-worker

# Or use k8s deployment
kubectl apply -f k8s/services/weather-worker-deployment.yaml
```

## Monitoring

Health checks:
- Liveness: Process running
- Readiness: PostgreSQL connected

Metrics:
- Weather observations ingested (by source)
- Alerts ingested
- Processing time
- Success/failure rates
- Database connection status

## Data Model

### weather_observations
- Multi-source: `OPEN-METEO`, `AEMET`, `SENSOR_REAL`
- Data types: `FORECAST`, `HISTORY`
- Critical metrics: `solar_rad_w_m2`, `eto_mm`, `soil_moisture_*`, `gdd_accumulated`

### weather_alerts
- Alert types: `YELLOW`, `ORANGE`, `RED`
- Categories: `WIND`, `RAIN`, `SNOW`, `FROST`, `HEAT`, `COLD`, etc.

