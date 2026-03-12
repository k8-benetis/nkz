import json
import logging
import requests
import os
from common.db_helper import get_db_connection_simple, return_db_connection

logger = logging.getLogger(__name__)

class ParcelSync:
    def __init__(self):
        self.orion_url = os.getenv('ORION_URL', 'http://orion-ld-service:1026')
        self.context_url = os.getenv('CONTEXT_URL', 'https://nkz.robotika.cloud/ngsi-ld-context.json')

    def sync_all_tenant_parcels(self, tenant_id: str):
        """Fetch all active parcels for a tenant and push them to Orion-LD"""
        logger.info(f"🔄 Starting full parcel sync for tenant: {tenant_id}")
        conn = get_db_connection_simple()
        if not conn:
            return False
            
        try:
            cur = conn.cursor()
            cur.execute(\"\"\"
                SELECT 
                    cadastral_reference, 
                    municipality, 
                    province, 
                    ST_AsGeoJSON(geometry)::json as geo,
                    cadastral_data->>'ine_code' as ine_code,
                    ndvi_enabled,
                    name
                FROM cadastral_parcels 
                WHERE tenant_id = %s AND is_active = true
            \"\"\", (tenant_id,))
            
            parcels = cur.fetchall()
            success_count = 0
            
            for p in parcels:
                if self.upsert_parcel(tenant_id, p):
                    success_count += 1
            
            logger.info(f"✅ Sync completed: {success_count}/{len(parcels)} parcels updated in Orion-LD")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to sync parcels for tenant {tenant_id}: {e}")
            return False
        finally:
            return_db_connection(conn)

    def upsert_parcel(self, tenant_id: str, p_data: dict):
        \"\"\"Push a single parcel to Orion-LD\"\"\"
        entity_id = f"urn:ngsi-ld:AgriParcel:{tenant_id}:{p_data['cadastral_reference']}"
        
        entity = {
            "id": entity_id,
            "type": "AgriParcel",
            "cadastralReference": {
                "type": "Property",
                "value": p_data['cadastral_reference']
            },
            "municipality_code": {
                "type": "Property",
                "value": p_data['ine_code'] or ""
            },
            "address": {
                "type": "Property",
                "value": {
                    "addressLocality": p_data['municipality'],
                    "addressRegion": p_data['province']
                }
            },
            "location": {
                "type": "GeoProperty",
                "value": p_data['geo']
            },
            "ndviEnabled": {
                "type": "Property",
                "value": p_data.get('ndvi_enabled', True)
            },
            "name": {
                "type": "Property",
                "value": p_data.get('name') or p_data['cadastral_reference']
            },
            "@context": self.context_url
        }

        headers = {
            'Content-Type': 'application/ld+json',
            'Fiware-Service': tenant_id,
            'Fiware-ServicePath': '/'
        }

        try:
            # SOTA: Try to update first, if 404 then create
            resp = requests.post(f"{self.orion_url}/ngsi-ld/v1/entities", 
                               json=entity, headers=headers, timeout=5)
            if resp.status_code in [201, 204]:
                return True
            elif resp.status_code == 409: # Already exists
                # PATCH attributes
                del entity['id']
                del entity['type']
                resp = requests.patch(f"{self.orion_url}/ngsi-ld/v1/entities/{entity_id}/attrs", 
                                    json=entity, headers=headers, timeout=5)
                return resp.status_code in [200, 204]
            else:
                logger.warning(f"⚠️ Orion returned {resp.status_code} for {entity_id}: {resp.text}")
                return False
        except Exception as e:
            logger.error(f"❌ Error communicating with Orion-LD: {e}")
            return False

parcel_sync = ParcelSync()
