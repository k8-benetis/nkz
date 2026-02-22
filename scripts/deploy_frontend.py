#!/usr/bin/env python3
import os
import sys
import boto3
import mimetypes
import subprocess
from botocore.exceptions import ClientError

# Configuration
DIST_DIR = os.path.join(os.path.dirname(__file__), '../apps/host/dist')
BUCKET_NAME = "nekazari-frontend"
BUCKET_PATH = "host"
# We will use port-forwarding to access MinIO
MINIO_ENDPOINT = "http://localhost:9000" 
# Fallback to env var if set
if os.getenv('S3_ENDPOINT_URL'):
    MINIO_ENDPOINT = os.getenv('S3_ENDPOINT_URL')

def build_frontend():
    print("📦 Building frontend...")
    try:
        # Run pnpm build from project root
        root_dir = os.path.join(os.path.dirname(__file__), '..')
        subprocess.run(["pnpm", "--filter", "nekazari-frontend", "build"], cwd=root_dir, check=True)
        print("✓ Build successful")
    except subprocess.CalledProcessError as e:
        print(f"❌ Build failed: {e}")
        sys.exit(1)

def generate_config():
    print("⚙️  Generating config.js...")
    config_path = os.path.join(DIST_DIR, "config.js")
    
    # Define production vars
    api_url = os.getenv("VITE_API_URL", "")
    keycloak_url = os.getenv("VITE_KEYCLOAK_URL", "")
    realm = os.getenv("VITE_KEYCLOAK_REALM", "nekazari")
    client_id = os.getenv("VITE_KEYCLOAK_CLIENT_ID", "nekazari-frontend")
    titiler_url = os.getenv("VITE_TITILER_URL", "")

    content = f"""
// Runtime configuration - generated at deploy time
window.__ENV__ = {{
  API_URL: "{api_url}",
  KEYCLOAK_URL: "{keycloak_url}",
  KEYCLOAK_REALM: "{realm}",
  KEYCLOAK_CLIENT_ID: "{client_id}",
  TITILER_URL: "{titiler_url}"
}};
"""
    with open(config_path, "w") as f:
        f.write(content)
    print(f"✓ config.js generated (API: {api_url})")

def upload_to_minio():
    print(f"☁️  Uploading to MinIO ({BUCKET_NAME}/{BUCKET_PATH})...")
    
    # Credentials from environment usually
    # If not set, we might need to ask user or assume they are in ~/.aws/credentials
    # For now, assume environment or default profile works.
    # Note: access keys are often in .env which we can't see, but shell usually has them if user runs it.
    
    s3 = boto3.client('s3', endpoint_url=MINIO_ENDPOINT)
    
    # Walk dist dir
    files_to_upload = []
    for root, dirs, files in os.walk(DIST_DIR):
        for file in files:
            local_path = os.path.join(root, file)
            rel_path = os.path.relpath(local_path, DIST_DIR)
            s3_key = f"{BUCKET_PATH}/{rel_path}"
            files_to_upload.append((local_path, s3_key))

    print(f"Found {len(files_to_upload)} files to upload.")

    for local_path, s3_key in files_to_upload:
        # Guess mime type
        content_type, _ = mimetypes.guess_type(local_path)
        if not content_type:
            content_type = 'application/octet-stream'
            
        try:
            with open(local_path, 'rb') as data:
                s3.put_object(
                    Bucket=BUCKET_NAME,
                    Key=s3_key,
                    Body=data,
                    ContentType=content_type
                )
            # print(f"  Uploaded {s3_key}") # Verbose
        except ClientError as e:
            print(f"❌ Failed to upload {s3_key}: {e}")
            sys.exit(1)

    print("✓ Upload complete")

if __name__ == "__main__":
    if not os.path.exists(DIST_DIR):
        print(f"Warning: {DIST_DIR} does not exist. Building first...")
    
    build_frontend()
    generate_config()
    
    if not os.getenv('AWS_ACCESS_KEY_ID'):
        print("❌ AWS_ACCESS_KEY_ID not set. Please export MinIO credentials.")
        print("Example: export AWS_ACCESS_KEY_ID=minio AWS_SECRET_ACCESS_KEY=minio123 S3_ENDPOINT_URL=https://minio.YOUR_DOMAIN")
        sys.exit(1)
        
    upload_to_minio()
