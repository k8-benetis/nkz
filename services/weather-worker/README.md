# Weather Worker Service

Worker service for ingesting weather data from multiple sources (Open-Meteo, AEMET) and calculating derived metrics for predictive models.

## Architecture

- **Sources**: Open-Meteo (primary), AEMET (secondary for alerts only)
- **Database**: PostgreSQL + TimescaleDB (weather_observations hypertable)
- **Processing**: Automatic ingestion every hour via CronJob
- **Metrics**: GDD, ET₀, Solar Radiation (GHI/DNI) for predictive models

## Features

### Current (Phase 1)
- ✅ Multi-source support (Open-Meteo, AEMET)
- ✅ Historical data ingestion (yesterday to close real data)
- ✅ Forecast data ingestion (7-14 days for simulations)
- ✅ Critical metrics: Temperature, Humidity, Precipitation, Wind
- ✅ **Solar Radiation (GHI/DNI)** - For solar panel energy models
- ✅ **ET₀ (Evapotranspiration)** - For irrigation models
- ✅ **Soil Moisture** (0-10cm, 10-40cm) - For sensor validation
- ✅ **GDD (Growing Degree Days)** - For pest and flowering prediction
- ✅ AEMET official alerts ingestion (yellow/orange/red)
- ✅ Multi-tenant support (RLS)
- ✅ Prometheus metrics

### Future (Phase 2+)
- ⏳ Integration with Simulation Engine
- ⏳ Real-time alert notifications (N8N)
- ⏳ Weather data validation against sensor readings

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
1. Fetches all active `tenant_weather_locations`
2. Ingests historical data (yesterday) from Open-Meteo
3. Ingests forecast data (7-14 days) from Open-Meteo
4. Fetches AEMET alerts for each municipality
5. Calculates derived metrics (GDD, ET₀)
6. Stores everything in `weather_observations` and `weather_alerts`

## Configuration

Environment variables:
- `POSTGRES_URL`: PostgreSQL connection string
- `OPENMETEO_API_URL`: Open-Meteo API URL (default: https://api.open-meteo.com/v1)
- `AEMET_API_KEY`: AEMET OpenData API key (for alerts only)
- `AEMET_API_URL`: AEMET API URL (default: https://opendata.aemet.es/opendata/api)
- `WEATHER_INGESTION_INTERVAL_HOURS`: Ingestion interval (default: 1)
- `METRICS_HOST`: Prometheus metrics host (default: 0.0.0.0)
- `METRICS_PORT`: Prometheus metrics port (default: 9106)

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

