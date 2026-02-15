#!/usr/bin/env python3
"""
Script to populate catalog_municipalities from AEMET/INE data
This script fetches municipality data from multiple sources and populates the database
Sources (in order of preference):
1. AEMET API (if API key available)
2. Complete INE dataset from codeforspain GitHub
3. Geocoding via Nominatim for missing coordinates
4. Fallback to common municipalities list
"""

import os
import sys
import requests
import psycopg2
from psycopg2.extras import RealDictCursor
import json
import time
from typing import List, Dict, Optional

# Add common to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'services', 'common'))

# Database connection
POSTGRES_URL = os.environ['POSTGRES_URL']

# AEMET API configuration
AEMET_API_KEY = os.getenv('AEMET_API_KEY', '')
AEMET_BASE_URL = 'https://opendata.aemet.es/opendata/api'

# Nominatim geocoding (OpenStreetMap)
NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search'
NOMINATIM_DELAY = 1.0  # Respect rate limits (1 request per second)

def get_aemet_municipalities() -> List[Dict]:
    """
    Fetch municipalities from AEMET API
    Falls back to INE dataset if API is not available
    """
    if not AEMET_API_KEY:
        print("⚠️  AEMET_API_KEY not set, using INE dataset instead")
        return get_ine_municipalities()
    
    try:
        # AEMET endpoint for municipalities
        url = f"{AEMET_BASE_URL}/maestro/municipios"
        headers = {'api_key': AEMET_API_KEY}
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        data_url = response.json().get('datos')
        if not data_url:
            print("⚠️  No data URL in AEMET response, using INE dataset instead")
            return get_ine_municipalities()
        
        # Fetch actual data
        data_response = requests.get(data_url, timeout=30)
        data_response.raise_for_status()
        municipalities = data_response.json()
        
        print(f"✅ Fetched {len(municipalities)} municipalities from AEMET")
        return municipalities
        
    except Exception as e:
        print(f"⚠️  Error fetching from AEMET: {e}")
        print("   Using INE dataset instead")
        return get_ine_municipalities()

def get_ine_municipalities() -> List[Dict]:
    """
    Fetch complete list of Spanish municipalities from codeforspain GitHub dataset
    This includes ALL municipalities (rural and urban) with INE codes
    """
    try:
        # Use raw GitHub content URL for the JSON file
        url = 'https://raw.githubusercontent.com/codeforspain/ds-organizacion-administrativa/master/data/municipios.json'
        
        print(f"📥 Downloading complete INE municipalities dataset from GitHub...")
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        
        municipalities = response.json()
        print(f"✅ Downloaded {len(municipalities)} municipalities from INE dataset")
        
        # Convert to our format
        result = []
        for mun in municipalities:
            if 'municipio_id' in mun and 'nombre' in mun:
                result.append({
                    'ine_code': str(mun['municipio_id']),
                    'name': mun['nombre'],
                    'province': None,  # Will be extracted from INE code if needed
                    'latitude': None,  # Will be geocoded
                    'longitude': None,  # Will be geocoded
                })
        
        return result
        
    except Exception as e:
        print(f"⚠️  Error downloading INE dataset: {e}")
        print("   Falling back to common municipalities list")
        return get_common_municipalities()

def geocode_municipality(name: str, province: Optional[str] = None, country: str = 'Spain') -> Optional[tuple]:
    """
    Geocode a municipality using Nominatim (OpenStreetMap)
    Returns (latitude, longitude) or None if not found
    """
    try:
        # Build query: "Municipality Name, Province, Spain"
        query_parts = [name]
        if province:
            query_parts.append(province)
        query_parts.append(country)
        query = ', '.join(query_parts)
        
        params = {
            'q': query,
            'format': 'json',
            'limit': 1,
            'countrycodes': 'es',  # Restrict to Spain
        }
        
        headers = {
            'User-Agent': 'Nekazari-Platform/1.0 (Weather Service)',  # Required by Nominatim
        }
        
        response = requests.get(NOMINATIM_BASE_URL, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        if data and len(data) > 0:
            result = data[0]
            lat = float(result.get('lat', 0))
            lon = float(result.get('lon', 0))
            if lat != 0 and lon != 0:
                return (lat, lon)
        
        return None
        
    except Exception as e:
        print(f"  ⚠️  Geocoding error for '{name}': {e}")
        return None

def geocode_municipalities_batch(municipalities: List[Dict], max_geocode: int = 1000) -> List[Dict]:
    """
    Geocode municipalities that don't have coordinates
    Limits geocoding to avoid rate limits (Nominatim allows 1 req/sec)
    """
    geocoded = 0
    skipped = 0
    
    print(f"\n🌍 Geocoding municipalities (max {max_geocode})...")
    print(f"   This may take a while due to rate limiting (1 req/sec)...")
    
    for i, mun in enumerate(municipalities):
        # Skip if already has coordinates
        if mun.get('latitude') and mun.get('longitude'):
            continue
        
        # Limit total geocoding requests
        if geocoded >= max_geocode:
            skipped = len(municipalities) - i
            print(f"   ⚠️  Reached geocoding limit ({max_geocode}), skipping {skipped} remaining")
            break
        
        # Extract province from INE code if not present
        province = mun.get('province')
        if not province and len(mun.get('ine_code', '')) >= 2:
            # First 2 digits of INE code are province code
            province_code = mun['ine_code'][:2]
            # Could map province codes to names, but for now just use code
        
        # Geocode
        coords = geocode_municipality(mun['name'], province)
        if coords:
            mun['latitude'] = coords[0]
            mun['longitude'] = coords[1]
            geocoded += 1
            
            if geocoded % 50 == 0:
                print(f"   Geocoded {geocoded} municipalities...")
        
        # Respect rate limit
        time.sleep(NOMINATIM_DELAY)
    
    print(f"✅ Geocoded {geocoded} municipalities")
    if skipped > 0:
        print(f"   ⚠️  {skipped} municipalities skipped (limit reached)")
    
    return municipalities

def get_common_municipalities() -> List[Dict]:
    """
    Return a curated list of common Spanish municipalities
    This includes major cities and agricultural regions
    """
    return [
        {'ine_code': '31001', 'name': 'Pamplona', 'province': 'Navarra', 'latitude': 42.8169, 'longitude': -1.6432},
        {'ine_code': '28079', 'name': 'Madrid', 'province': 'Madrid', 'latitude': 40.4168, 'longitude': -3.7038},
        {'ine_code': '08019', 'name': 'Barcelona', 'province': 'Barcelona', 'latitude': 41.3851, 'longitude': 2.1734},
        {'ine_code': '41091', 'name': 'Sevilla', 'province': 'Sevilla', 'latitude': 37.3891, 'longitude': -5.9845},
        {'ine_code': '46015', 'name': 'Valencia', 'province': 'Valencia', 'latitude': 39.4699, 'longitude': -0.3763},
        {'ine_code': '15030', 'name': 'A Coruña', 'province': 'A Coruña', 'latitude': 43.3623, 'longitude': -8.4115},
        {'ine_code': '29067', 'name': 'Málaga', 'province': 'Málaga', 'latitude': 36.7213, 'longitude': -4.4214},
        {'ine_code': '33044', 'name': 'Oviedo', 'province': 'Asturias', 'latitude': 43.3619, 'longitude': -5.8494},
        {'ine_code': '48020', 'name': 'Bilbao', 'province': 'Vizcaya', 'latitude': 43.2627, 'longitude': -2.9253},
        {'ine_code': '50059', 'name': 'Zaragoza', 'province': 'Zaragoza', 'latitude': 41.6488, 'longitude': -0.8891},
        {'ine_code': '18087', 'name': 'Granada', 'province': 'Granada', 'latitude': 37.1773, 'longitude': -3.5986},
        {'id': '12140', 'name': 'Castellón de la Plana', 'province': 'Castellón', 'latitude': 39.9864, 'longitude': -0.0513},
        {'ine_code': '23050', 'name': 'Jaén', 'province': 'Jaén', 'latitude': 37.7796, 'longitude': -3.7849},
        {'ine_code': '24089', 'name': 'León', 'province': 'León', 'latitude': 42.5987, 'longitude': -5.5671},
        {'ine_code': '25030', 'name': 'Barcelona', 'province': 'Barcelona', 'latitude': 41.3851, 'longitude': 2.1734},
        {'ine_code': '26089', 'name': 'Logroño', 'province': 'La Rioja', 'latitude': 42.4650, 'longitude': -2.4456},
        {'ine_code': '27028', 'name': 'Lugo', 'province': 'Lugo', 'latitude': 43.0123, 'longitude': -7.5562},
        {'ine_code': '30030', 'name': 'Murcia', 'province': 'Murcia', 'latitude': 37.9922, 'longitude': -1.1307},
        {'ine_code': '32054', 'name': 'Ourense', 'province': 'Ourense', 'latitude': 42.3360, 'longitude': -7.8642},
        {'ine_code': '35013', 'name': 'Las Palmas de Gran Canaria', 'province': 'Las Palmas', 'latitude': 28.1248, 'longitude': -15.4300},
        {'ine_code': '38038', 'name': 'Santa Cruz de Tenerife', 'province': 'Santa Cruz de Tenerife', 'latitude': 28.4636, 'longitude': -16.2518},
        {'ine_code': '39075', 'name': 'Santander', 'province': 'Cantabria', 'latitude': 43.4623, 'longitude': -3.8099},
        {'ine_code': '41020', 'name': 'Alcalá de Guadaíra', 'province': 'Sevilla', 'latitude': 37.3386, 'longitude': -5.8497},
        {'ine_code': '41041', 'name': 'Carmona', 'province': 'Sevilla', 'latitude': 37.4710, 'longitude': -5.6461},
        {'ine_code': '41059', 'name': 'Dos Hermanas', 'province': 'Sevilla', 'latitude': 37.2836, 'longitude': -5.9209},
        {'ine_code': '45080', 'name': 'Toledo', 'province': 'Toledo', 'latitude': 39.8628, 'longitude': -4.0273},
        {'ine_code': '47086', 'name': 'Valladolid', 'province': 'Valladolid', 'latitude': 41.6523, 'longitude': -4.7245},
        {'ine_code': '49035', 'name': 'Zamora', 'province': 'Zamora', 'latitude': 41.5035, 'longitude': -5.7438},
    ]

def normalize_municipality(mun: Dict) -> Optional[Dict]:
    """Normalize municipality data from different sources"""
    # Handle AEMET format
    if 'id' in mun and 'nombre' in mun:
        return {
            'ine_code': str(mun.get('id', '')),
            'name': mun.get('nombre', ''),
            'province': mun.get('provincia', ''),
            'aemet_id': mun.get('idAEMET', ''),
            'latitude': None,
            'longitude': None,
        }
    
    # Handle our common format
    if 'ine_code' in mun:
        return {
            'ine_code': str(mun['ine_code']),
            'name': mun.get('name', ''),
            'province': mun.get('province', ''),
            'aemet_id': mun.get('aemet_id', ''),
            'latitude': mun.get('latitude'),
            'longitude': mun.get('longitude'),
        }
    
    return None

def populate_database(municipalities: List[Dict]):
    """Insert municipalities into catalog_municipalities"""
    conn = psycopg2.connect(POSTGRES_URL)
    cur = conn.cursor()
    
    inserted = 0
    updated = 0
    errors = 0
    
    for mun_data in municipalities:
        try:
            mun = normalize_municipality(mun_data)
            if not mun or not mun['ine_code']:
                continue
            
            # Insert or update municipality
            cur.execute("""
                INSERT INTO catalog_municipalities 
                (ine_code, name, province, autonomous_community, aemet_id, latitude, longitude, geom)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 
                    CASE 
                        WHEN %s IS NOT NULL AND %s IS NOT NULL 
                        THEN ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                        ELSE NULL
                    END)
                ON CONFLICT (ine_code) 
                DO UPDATE SET
                    name = EXCLUDED.name,
                    province = COALESCE(EXCLUDED.province, catalog_municipalities.province),
                    aemet_id = COALESCE(EXCLUDED.aemet_id, catalog_municipalities.aemet_id),
                    latitude = COALESCE(EXCLUDED.latitude, catalog_municipalities.latitude),
                    longitude = COALESCE(EXCLUDED.longitude, catalog_municipalities.longitude),
                    geom = CASE 
                        WHEN EXCLUDED.longitude IS NOT NULL AND EXCLUDED.latitude IS NOT NULL 
                        THEN ST_SetSRID(ST_MakePoint(EXCLUDED.longitude, EXCLUDED.latitude), 4326)
                        ELSE catalog_municipalities.geom
                    END
            """, (
                mun['ine_code'],
                mun['name'],
                mun.get('province'),
                None,  # autonomous_community - would need mapping
                mun.get('aemet_id'),
                mun.get('latitude'),
                mun.get('longitude'),
                mun.get('longitude'),
                mun.get('latitude'),
                mun.get('longitude'),
                mun.get('latitude'),
            ))
            
            if cur.rowcount > 0:
                if 'INSERT' in str(cur.statusmessage):
                    inserted += 1
                else:
                    updated += 1
            
        except Exception as e:
            errors += 1
            print(f"  ⚠️  Error processing {mun_data.get('ine_code', 'unknown')}: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    
    print(f"\n✅ Population complete:")
    print(f"   - Inserted: {inserted}")
    print(f"   - Updated: {updated}")
    print(f"   - Errors: {errors}")

def main():
    print("=" * 60)
    print("Populating catalog_municipalities from AEMET/INE data")
    print("=" * 60)
    
    # Check if we should skip geocoding (for faster execution)
    skip_geocoding = os.getenv('SKIP_GEOCODING', 'false').lower() == 'true'
    max_geocode = int(os.getenv('MAX_GEOCODE', '500'))  # Limit geocoding to avoid long waits
    
    print("\n📥 Fetching municipalities...")
    municipalities = get_aemet_municipalities()
    
    if not municipalities:
        print("❌ No municipalities to insert")
        return 1
    
    # Geocode municipalities that don't have coordinates
    if not skip_geocoding:
        municipalities = geocode_municipalities_batch(municipalities, max_geocode=max_geocode)
    else:
        print("⚠️  Skipping geocoding (SKIP_GEOCODING=true)")
    
    print(f"\n💾 Inserting {len(municipalities)} municipalities into database...")
    populate_database(municipalities)
    
    print("\n✅ Done!")
    print("\n💡 Tip: Set SKIP_GEOCODING=true to skip geocoding for faster execution")
    print("   Set MAX_GEOCODE=N to limit geocoding requests (default: 500)")
    return 0

if __name__ == '__main__':
    sys.exit(main())


