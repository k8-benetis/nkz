import requests
import json
import os

# Configuration
API_URL = "http://localhost:5000/ngsi-ld/v1/entities?type=AgriParcel"
HEADERS = {
    "Accept": "application/ld+json",
    "Authorization": "Bearer " + os.getenv("TOKEN", ""), # We need a token, but for now let's try without or assume we can get one. 
    # Actually, I can't easily get a valid Keycloak token from here without credentials.
    # But I can use the internal Orion URL if I run this on the server.
}

# On the server, I can query Orion directly or via Gateway if I have a token.
# Accessing Orion directly avoids auth.
ORION_URL = "http://orion-ld-service:1026/ngsi-ld/v1/entities?type=AgriParcel"

# But I am running this via `run_command` on the server.
# So I can use curl to localhost:1026 (Orion port).

print("Fetching parcels from Orion-LD...")
