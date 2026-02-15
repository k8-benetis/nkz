import os
import logging
import requests
import json
from tenacity import retry, stop_after_attempt, wait_fixed

logger = logging.getLogger(__name__)

ORION_URL = os.getenv("ORION_URL", "http://orion-ld-service:1026")
SERVICE_HOST = os.getenv("SERVICE_HOST", "telemetry-worker-service")
SERVICE_PORT = os.getenv("SERVICE_PORT", "8080")
NOTIFICATION_URL = f"http://{SERVICE_HOST}:{SERVICE_PORT}/notify"

SUBSCRIPTIONS = [
    {
        "description": "Notify Telemetry Worker of all Device measurements",
        "type": "Subscription",
        "entities": [{"type": "Device"}],
        "watchedAttributes": ["value", "observedAt", "batteryLevel", "rssi"],
        "notification": {
            "endpoint": {
                "uri": NOTIFICATION_URL,
                "accept": "application/json"
            }
        }
    },
    {
        "description": "Notify Telemetry Worker of AgriParcel updates",
        "type": "Subscription",
        "entities": [{"type": "AgriParcel"}],
        "watchedAttributes": ["soilMoisture", "leafWetness", "atmosphericPressure"],
        "notification": {
            "endpoint": {
                "uri": NOTIFICATION_URL,
                "accept": "application/json"
            }
        }
    }
]

@retry(stop=stop_after_attempt(5), wait=wait_fixed(5))
def check_or_create_subscription():
    """Checks if subscriptions exist in Orion and creates them if not."""
    logger.info(f"Checking subscriptions against Orion at {ORION_URL}...")
    
    try:
        # Get existing subs to avoid duplicates
        response = requests.get(f"{ORION_URL}/ngsi-ld/v1/subscriptions")
        response.raise_for_status()
        existing_subs = response.json()
        
        existing_descriptions = [sub.get("description") for sub in existing_subs] if existing_subs else []

        for sub in SUBSCRIPTIONS:
            if sub["description"] in existing_descriptions:
                logger.info(f"Subscription '{sub['description']}' already exists.")
            else:
                logger.info(f"Creating subscription: '{sub['description']}'...")
                headers = {
                    "Content-Type": "application/ld+json"
                }
                # NGSI-LD requires Link header or @context body. We send bare JSON-LD if we use application/ld+json 
                # but standard practice often includes Link header. For simplicity we assume Orion accepts this.
                # Actually, standard NGSI-LD POST subscription needs correct headers.
                # Using simple JSON format with explicit headers usually works best with Orion-LD.
                
                res = requests.post(
                    f"{ORION_URL}/ngsi-ld/v1/subscriptions", 
                    json=sub, 
                    headers={"Content-Type": "application/json"}
                )
                if res.status_code in [201, 200]:
                     logger.info(f"Successfully created subscription: {sub['description']}")
                else:
                    logger.error(f"Failed to create subscription {sub['description']}: {res.text}")

    except Exception as e:
        logger.error(f"Error communicating with Orion: {e}")
        raise e
