# Post-Deployment Configuration Steps

## Current Status (2025-12-22 11:25)

### Deployed Services ✅
- **QuantumLeap**: 1/1 Running (quantumleap-5d8957855f-rp99b)
- **GeoServer**: 1/1 Running (geoserver-d58789b6b-b7k9j)
- **Orion-LD**: 2/2 Running (orion-ld-6fcc6c47b8-7vnl8, orion-ld-6fcc6c47b8-xl8lj)

### Database State
- **PostgreSQL Pod**: postgresql-76b78d7d59-h6xjd
- **Existing Tables**: 58 tables (mostly n8n workflow tables)
- **Missing Tables**: 
  - `cadastral_parcels` (FIWARE)
  - `devices` (FIWARE)
  - `ndvi_rasters` (FIWARE)
  - `mtagriculturalrobot` (QuantumLeap - will be created on first notification)
  - `mtagrisensor` (QuantumLeap - will be created on first notification)

### Next Steps
1. Create Orion-LD subscriptions for QuantumLeap
2. Create test robot entity to trigger table creation
3. Verify QuantumLeap tables are created
4. Re-apply database migration for views
5. Configure GeoServer workspace and datastore

---

## Step 1: Create Orion-LD Subscription for QuantumLeap

### Manual Subscription Creation

Since the tenant-webhook ConfigMap doesn't exist in this deployment, we'll create subscriptions manually.

```bash
# Get Orion-LD service endpoint
ORION_URL="http://orion-ld-service:1026"
QUANTUMLEAP_URL="http://quantumleap-service:8668"

# Create subscription for AgriculturalRobot entities
curl -X POST "${ORION_URL}/ngsi-ld/v1/subscriptions" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: default" \
  -d '{
    "type": "Subscription",
    "name": "QuantumLeap subscription for AgriculturalRobot",
    "description": "Persist robot data to TimescaleDB via QuantumLeap",
    "entities": [{"type": "AgriculturalRobot"}],
    "watchedAttributes": ["location", "batteryLevel", "status", "speed"],
    "notification": {
      "endpoint": {
        "uri": "'"${QUANTUMLEAP_URL}"'/v2/notify",
        "accept": "application/json"
      },
      "format": "normalized"
    }
  }'
```

**Expected Response**: HTTP 201 with subscription ID

---

## Step 2: Create Test Robot Entity

```bash
# Create test robot in Orion-LD
curl -X POST "${ORION_URL}/ngsi-ld/v1/entities" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: default" \
  -d '{
    "id": "urn:ngsi-ld:AgriculturalRobot:test001",
    "type": "AgriculturalRobot",
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Point",
        "coordinates": [-1.6, 42.8]
      }
    },
    "batteryLevel": {
      "type": "Property",
      "value": 85
    },
    "status": {
      "type": "Property",
      "value": "working"
    },
    "speed": {
      "type": "Property",
      "value": 2.5,
      "unitCode": "MTS"
    }
  }'
```

**Expected Response**: HTTP 201 Created

---

## Step 3: Verify QuantumLeap Table Creation

Wait 5 seconds for QuantumLeap to process the notification, then check:

```bash
# Check if QuantumLeap table was created
PGPOD=$(sudo kubectl get pods -n nekazari | grep postgresql | grep Running | head -1 | awk '{print $1}')

sudo kubectl exec -n nekazari ${PGPOD} -- \
  psql -U postgres -d nekazari -c \
  "SELECT tablename FROM pg_tables WHERE tablename LIKE 'mt%' ORDER BY tablename;"
```

**Expected Output**:
```
         tablename          
----------------------------
 mtagriculturalrobot
```

---

## Step 4: Query QuantumLeap Data

```bash
# Verify data was persisted
sudo kubectl exec -n nekazari ${PGPOD} -- \
  psql -U postgres -d nekazari -c \
  "SELECT entity_id, time_index, location, batterylevel, status 
   FROM mtagriculturalrobot 
   ORDER BY time_index DESC 
   LIMIT 5;"
```

**Expected Output**: Row with test001 robot data

---

## Step 5: Re-apply Database Migration

Once QuantumLeap tables exist, re-apply the migration:

```bash
# Copy migration file
sudo kubectl cp ~/nekazari-public/config/timescaledb/migrations/030_geoserver_quantumleap_views.sql \
  nekazari/${PGPOD}:/tmp/030_geoserver_quantumleap_views.sql

# Execute migration
sudo kubectl exec -n nekazari ${PGPOD} -- \
  psql -U postgres -d nekazari -f /tmp/030_geoserver_quantumleap_views.sql
```

**Note**: Some views will still fail if base tables (cadastral_parcels, devices, ndvi_rasters) don't exist. This is expected - those views will be created when the base tables are created.

---

## Step 6: Configure GeoServer

### Access GeoServer UI

```bash
# Port-forward from local machine
ssh -L 8080:localhost:8080 user@your-server-ip

# On server
sudo kubectl port-forward -n nekazari svc/geoserver-service 8080:8080
```

**Access**: http://localhost:8080/geoserver  
**Login**:
- Username: `admin`
- Password: `YkY/FGtiBCAcJh6yGYaFbQL2JQMKf8hN210pr4HRtRI=`

### Create Workspace

1. Navigate to: **Workspaces** → **Add new workspace**
2. **Name**: `nekazari`
3. **Namespace URI**: `http://nekazari.com/gis`
4. **Default Workspace**: ✅
5. Click **Save**

### Create PostGIS Datastore

1. Navigate to: **Stores** → **Add new Store** → **PostGIS**
2. **Workspace**: `nekazari`
3. **Data Source Name**: `nekazari_postgis`
4. **Description**: `Nekazari PostgreSQL/PostGIS database`
5. **Connection Parameters**:
   - **host**: `postgresql-service`
   - **port**: `5432`
   - **database**: `nekazari`
   - **schema**: `public`
   - **user**: `postgres`
   - **passwd**: `NekazariStrongPass2025!`
6. **Validate connection**: Click to test
7. Click **Save**

### Publish First Layer (Robot Current Positions)

1. Navigate to: **Layers** → **Add a new layer**
2. **Choose data source**: `nekazari:nekazari_postgis`
3. **Find layer**: `geoserver_robots_current`
4. Click **Publish**
5. **Configure layer**:
   - **Title**: `Robot Current Positions`
   - **Abstract**: `Latest positions of agricultural robots from QuantumLeap`
   - **Native SRS**: `EPSG:4326`
   - **Declared SRS**: `EPSG:4326`
   - **SRS handling**: `Force declared`
   - **Bounding Boxes**: Click **Compute from data** and **Compute from native bounds**
6. Click **Save**

---

## Step 7: Test WMS Endpoint

```bash
# Test WMS GetCapabilities
curl "http://geoserver-service:8080/geoserver/nekazari/wms?service=WMS&version=1.3.0&request=GetCapabilities" | grep -i robot
```

**Expected**: Should see `Robot Current Positions` layer in capabilities

---

## Step 8: Update NDVI Worker (Optional)

Add GeoServer password to NDVI worker deployment:

```bash
# Edit deployment
sudo kubectl edit deployment ndvi-worker -n nekazari

# Add environment variable:
env:
- name: GEOSERVER_PASSWORD
  valueFrom:
    secretKeyRef:
      name: geoserver-secret
      key: admin-password
```

---

## Verification Checklist

- [ ] Orion-LD subscription created
- [ ] Test robot entity created
- [ ] QuantumLeap table `mtagriculturalrobot` exists
- [ ] Data visible in QuantumLeap table
- [ ] Database views created (at least robot views)
- [ ] GeoServer workspace created
- [ ] GeoServer datastore configured
- [ ] First layer published
- [ ] WMS endpoint responds

---

## Troubleshooting

### QuantumLeap not creating tables

**Check logs**:
```bash
sudo kubectl logs -n nekazari -l app=quantumleap --tail=50
```

**Check subscription**:
```bash
curl -X GET "http://orion-ld-service:1026/ngsi-ld/v1/subscriptions" \
  -H "Fiware-Service: default" | jq
```

### GeoServer connection fails

**Test PostgreSQL connection from GeoServer pod**:
```bash
GEOPOD=$(sudo kubectl get pods -n nekazari -l app=geoserver -o jsonpath='{.items[0].metadata.name}')

sudo kubectl exec -n nekazari ${GEOPOD} -- \
  psql -h postgresql-service -U postgres -d nekazari -c "SELECT version();"
```

---

## Next Steps After Configuration

1. Create subscriptions for other entity types (AgriSensor, WeatherObserved)
2. Create FIWARE base tables (cadastral_parcels, devices, ndvi_rasters)
3. Publish additional layers in GeoServer
4. Configure frontend to use GeoServer WMS
5. Test end-to-end flow

---

**Document Created**: 2025-12-22 11:25  
**Status**: Ready for execution
