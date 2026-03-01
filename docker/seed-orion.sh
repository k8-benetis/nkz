#!/bin/sh
# =============================================================================
# Nekazari — Seed Orion-LD with demo AgriParcel entities
# =============================================================================
set -e

ORION_URL="http://orion-ld:1026"
CONTEXT_URL="https://raw.githubusercontent.com/smart-data-models/dataModel.Agrifood/master/context.jsonld"

echo "Waiting for Orion-LD to be ready..."
until curl -sf "${ORION_URL}/ngsi-ld/v1/entities?type=AgriParcel&limit=1" \
  -H "NGSILD-Tenant: demo-farm" > /dev/null 2>&1; do
  echo "  Orion-LD not ready, retrying in 5s..."
  sleep 5
done
echo "Orion-LD is ready."

# Parcel 1: North vineyard in Olite
echo "Creating AgriParcel: olite-north..."
curl -sf -X POST "${ORION_URL}/ngsi-ld/v1/entities" \
  -H "Content-Type: application/ld+json" \
  -H "NGSILD-Tenant: demo-farm" \
  -d '{
    "@context": "'"${CONTEXT_URL}"'",
    "id": "urn:ngsi-ld:AgriParcel:demo-farm:olite-north",
    "type": "AgriParcel",
    "name": {"type": "Property", "value": "Olite North — Vineyard"},
    "description": {"type": "Property", "value": "Tempranillo vineyard, 12 ha, drip irrigation"},
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Polygon",
        "coordinates": [[
          [-1.6550, 42.6530],
          [-1.6480, 42.6530],
          [-1.6480, 42.6490],
          [-1.6550, 42.6490],
          [-1.6550, 42.6530]
        ]]
      }
    },
    "area": {"type": "Property", "value": 12.0, "unitCode": "HAR"},
    "category": {"type": "Property", "value": "vineyard"},
    "cropStatus": {"type": "Property", "value": "growing"},
    "hasAgriCrop": {
      "type": "Relationship",
      "object": "urn:ngsi-ld:AgriCrop:tempranillo"
    }
  }' || echo "  (may already exist)"

# Parcel 2: South olive grove in Olite
echo "Creating AgriParcel: olite-south..."
curl -sf -X POST "${ORION_URL}/ngsi-ld/v1/entities" \
  -H "Content-Type: application/ld+json" \
  -H "NGSILD-Tenant: demo-farm" \
  -d '{
    "@context": "'"${CONTEXT_URL}"'",
    "id": "urn:ngsi-ld:AgriParcel:demo-farm:olite-south",
    "type": "AgriParcel",
    "name": {"type": "Property", "value": "Olite South — Olive Grove"},
    "description": {"type": "Property", "value": "Arbequina olive grove, 8 ha, rainfed"},
    "location": {
      "type": "GeoProperty",
      "value": {
        "type": "Polygon",
        "coordinates": [[
          [-1.6530, 42.6460],
          [-1.6450, 42.6460],
          [-1.6450, 42.6420],
          [-1.6530, 42.6420],
          [-1.6530, 42.6460]
        ]]
      }
    },
    "area": {"type": "Property", "value": 8.0, "unitCode": "HAR"},
    "category": {"type": "Property", "value": "olive"},
    "cropStatus": {"type": "Property", "value": "growing"},
    "hasAgriCrop": {
      "type": "Relationship",
      "object": "urn:ngsi-ld:AgriCrop:arbequina"
    }
  }' || echo "  (may already exist)"

echo "Orion-LD seeding complete."
