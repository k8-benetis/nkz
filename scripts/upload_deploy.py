import boto3
import os
import mimetypes
from botocore.config import Config
from botocore.exceptions import ClientError

# Configuration
MINIO_URL = "http://localhost:9000"
ACCESS_KEY = "minioadmin"
SECRET_KEY = "minioadmin"
BUCKET_NAME = "nekazari-frontend"

# Paths
HOST_DIST = os.path.expanduser("~/nkz/apps/host/dist")
MODULE_FILE = os.path.expanduser("~/nkz-module-cadastrial.js")
MODULE_KEY = "modules/catastro-spain/nkz-module.js"

def get_s3_client():
    return boto3.client("s3",
        endpoint_url=MINIO_URL,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1"
    )

def upload_file(s3, file_path, object_name, content_type=None):
    if content_type is None:
        content_type, _ = mimetypes.guess_type(file_path)
        if content_type is None:
            content_type = "application/octet-stream"
    
    try:
        with open(file_path, "rb") as f:
            file_data = f.read()
            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=object_name,
                Body=file_data,
                ContentType=content_type
            )
        print(f"✅ Uploaded: {object_name}")
        return True
    except ClientError as e:
        print(f"❌ Failed to upload {object_name}: {e}")
        return False
    except Exception as e:
        print(f"❌ Error reading {file_path}: {e}")
        return False

def main():
    print("Starting S3 deployment...")
    s3 = get_s3_client()

    # 1. Upload Host Assets
    print(f"\nScanning {HOST_DIST}...")
    success_count = 0
    fail_count = 0

    for root, _, files in os.walk(HOST_DIST):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, HOST_DIST)
            key = f"host/{rel_path}"
            
            if upload_file(s3, full_path, key):
                success_count += 1
            else:
                fail_count += 1

    print(f"\nHost Deployment: {success_count} succeeded, {fail_count} failed.")

    # 2. Upload Module Bundle
    print("\nUploading Cadastral Module...")
    if os.path.exists(MODULE_FILE):
        if upload_file(s3, MODULE_FILE, MODULE_KEY, "application/javascript"):
             print("✅ Module uploaded successfully.")
        else:
             print("❌ Module upload failed.")
    else:
        print(f"❌ Module file not found: {MODULE_FILE}")

    print("\nDeployment finished.")

if __name__ == "__main__":
    main()
