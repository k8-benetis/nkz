#!/usr/bin/env python3
import os
import sys
import json
import requests
import argparse

# Configuration
API_URL = "https://nkz.robotika.cloud/entity-manager/api/assets/upload"
DEFAULTS_DIR = "./assets/defaults"
MANIFEST_FILE = "./apps/host/src/config/default-assets.json"

def upload_file(filepath, token):
    filename = os.path.basename(filepath)
    ext = filename.split('.')[-1].lower()
    
    asset_type = 'model' if ext in ['glb', 'gltf'] else 'icon'
    
    headers = {
        'Authorization': f'Bearer {token}'
    }
    
    with open(filepath, 'rb') as f:
        files = {'file': (filename, f)}
        data = {'asset_type': asset_type}
        
        print(f"  POST {API_URL} (type={asset_type})")
        response = requests.post(API_URL, headers=headers, files=files, data=data)
        return response

def main():
    parser = argparse.ArgumentParser(description="Upload default assets to Nekazari")
    parser.add_argument("token", help="JWT Authentication Token")
    args = parser.parse_args()

    if not os.path.exists(DEFAULTS_DIR):
        print(f"Directory {DEFAULTS_DIR} does not exist. Creating it.")
        os.makedirs(DEFAULTS_DIR)
        print("Please put .glb or .png files in it.")
        return

    # Create config directory if not exists
    os.makedirs(os.path.dirname(MANIFEST_FILE), exist_ok=True)

    # Load existing manifest
    current_manifest = {}
    if os.path.exists(MANIFEST_FILE):
        try:
            with open(MANIFEST_FILE, 'r') as f:
                current_manifest = json.load(f)
        except json.JSONDecodeError:
            pass
            
    # Iterate and upload
    updated = False
    files_found = False
    
    for filename in os.listdir(DEFAULTS_DIR):
        if filename.startswith('.'): continue
        
        filepath = os.path.join(DEFAULTS_DIR, filename)
        if not os.path.isfile(filepath): continue
        
        files_found = True
        key = os.path.splitext(filename)[0]
        
        print(f"Uploading {filename}...")
        try:
            resp = upload_file(filepath, args.token)
            if resp.status_code == 201:
                data = resp.json()
                url = data.get('url')
                print(f"  Success: {url}")
                current_manifest[key] = {
                    "url": url,
                    "type": data.get('content_type'),
                    "asset_id": data.get('asset_id'),
                    "category": "vegetation" if "tree" in key else "infrastructure" # Basic heuristic
                }
                updated = True
            else:
                print(f"  Failed: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"  Error: {e}")

    if not files_found:
        print(f"No files found in {DEFAULTS_DIR}. Please add some .glb or .png files.")

    if updated:
        with open(MANIFEST_FILE, 'w') as f:
            json.dump(current_manifest, f, indent=2)
        print(f"Manifest updated: {MANIFEST_FILE}")
    else:
        print("No changes made to manifest.")

if __name__ == "__main__":
    main()
