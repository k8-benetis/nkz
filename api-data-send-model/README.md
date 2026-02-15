# Nekazari Sensor Data Sender

This package provides an opinionated client for forwarding telemetry from
edge devices (industrial PCs, dataloggers, ESP32, etc.) towards the Nekazari
platform using API key authentication. The goal is to offer a reproducible
deployment recipe while keeping the payload aligned with the Smart Data Model
entities consumed by the backend ingestor.

## Features

- YAML driven configuration (`config.yaml`)
- API key + tenant header injection compatible with the API Gateway
- Local durability via SQLite queue when the uplink is unavailable
- Pluggable payload builders to map device channels to SDM attributes
- CLI for ad–hoc testing and a long–running daemon mode suitable for
  `systemd`/cron integration

## Layout

```
api-data-send-model/
├── README.md
├── requirements.txt
├── config.yaml              # sample config copied per device
├── main.py                  # CLI entry point
└── sender/
    ├── __init__.py
    ├── config.py            # config loader + validation
    ├── queue.py             # SQLite-backed retry queue
    ├── client.py            # HTTP client with retry/backoff
    ├── payloads.py          # helpers to build SDM-compliant payloads
    └── runner.py            # orchestrator (daemon loop / single-shot)
```

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.yaml config.local.yaml  # edit with your API key and tenant
python main.py send --config config.local.yaml --input examples/sample_payload.json
```

### Daemon mode

```bash
python main.py daemon --config /opt/nekazari/config.yaml
```

Create a systemd service (`/etc/systemd/system/nekazari-sender.service`):

```
[Unit]
Description=Nekazari Sensor Sender
After=network-online.target
Wants=network-online.target

[Service]
User=nekazari
Group=nekazari
WorkingDirectory=/opt/nekazari/api-data-send-model
Environment="CONFIG_FILE=/opt/nekazari/config.yaml"
ExecStart=/opt/nekazari/api-data-send-model/.venv/bin/python main.py daemon --config ${CONFIG_FILE}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nekazari-sender.service
```

## Configuration

```yaml
endpoint:
  base_url: "https://api.nekazari.com"
  path: "/api/telemetry"
  timeout: 10

auth:
  api_key: "nek_xxx"
  tenant: "gabrego"

device:
  id: "logger-01"
  profile: "soil_v1"

queue:
  enabled: true
  db_path: "queue.db"

payload:
  builder: "sdm_agri_sensor"  # maps to sender.payloads.SDM_BUILDERS
  meta:
    parcelId: "urn:ngsi-ld:AgriParcel:gabrego:parcel-1"
```

## Supported payload builders

- `sdm_agri_sensor`: Generates NGSI-LD `AgriSensor` measurements where each
  reading is posted as:

  ```json
  {
    "tenant": "gabrego",
    "deviceId": "logger-01",
    "profile": "soil_v1",
    "measurements": [
      {
        "type": "soilTemperature",
        "value": 19.4,
        "unit": "CEL",
        "observedAt": "2025-11-10T09:31:00Z"
      }
    ],
    "metadata": {
      "parcelId": "urn:ngsi-ld:AgriParcel:gabrego:parcel-1"
    }
  }
  ```

You can extend `sender/payloads.py` to add mappings for other Smart Data
Model entity types (`WeatherObserved`, `AirQualityObserved`, etc.).

## Samples

The `examples/` folder will include minimal JSON snippets for manual testing
once the backend ingestion contract is finalised.

## Next steps

1. Wire the backend ingestion endpoint (`/api/telemetry`) so it validates the
   payloads produced here and dispatches them to the SDM digester.
2. Add additional payload builders for the sensor types required by the tenants.
3. Package the runner as a Python wheel once the interface stabilises.

