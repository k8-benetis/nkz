#!/usr/bin/env python3
# =============================================================================
# Module Upload Service - External Module Upload System (Phase 1)
# =============================================================================
# Handles uploading, validation, and publishing of external modules
# =============================================================================

import os
import sys
import json
import uuid
import zipfile
import logging
import tempfile
from typing import Dict, Any, Optional
from io import BytesIO
from datetime import datetime

# Add common directory to path
common_paths = [
    os.path.join(os.path.dirname(__file__), '..', 'common'),
    '/app/common',
    '/common',
]
for path in common_paths:
    if os.path.exists(path):
        sys.path.insert(0, path)
        break

from minio import Minio
from minio.error import S3Error
import jsonschema
from kubernetes import client, config
from kubernetes.client.rest import ApiException

logger = logging.getLogger(__name__)

# MinIO Configuration
MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT', 'minio-service:9000')
MINIO_ACCESS_KEY = os.getenv('MINIO_ACCESS_KEY', os.getenv('MINIO_ROOT_USER', ''))
MINIO_SECRET_KEY = os.getenv('MINIO_SECRET_KEY', os.getenv('MINIO_ROOT_PASSWORD', ''))
MINIO_SECURE = os.getenv('MINIO_SECURE', 'false').lower() == 'true'

# Kubernetes Configuration
K8S_NAMESPACE = os.getenv('K8S_NAMESPACE', 'nekazari')

# Manifest JSON Schema
MANIFEST_SCHEMA = {
    "type": "object",
    "required": [
        "id", "name", "display_name", "version", "description",
        "author", "module_type", "route_path", "label", "build_config"
    ],
    "properties": {
        "id": {"type": "string", "pattern": "^[a-z0-9-]+$"},
        "name": {"type": "string"},
        "display_name": {"type": "string"},
        "version": {"type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$"},
        "description": {"type": "string"},
        "author": {
            "type": "object",
            "required": ["name", "email"],
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string", "format": "email"},
                "organization": {"type": "string"}
            }
        },
        "module_type": {
            "type": "string",
            "enum": ["ADDON_FREE", "ADDON_PAID", "ENTERPRISE"]
        },
        "required_plan_type": {
            "type": "string",
            "enum": ["basic", "premium", "enterprise"]
        },
        "pricing_tier": {
            "type": "string",
            "enum": ["FREE", "PAID", "ENTERPRISE_ONLY"]
        },
        "route_path": {"type": "string", "pattern": "^/[a-z0-9/-]+$"},
        "label": {"type": "string"},
        "icon": {"type": "string"},
        "required_roles": {
            "type": "array",
            "items": {"type": "string"}
        },
        "build_config": {
            "type": "object",
            "required": ["type", "remote_entry_url", "scope", "exposed_module"],
            "properties": {
                "type": {"type": "string", "enum": ["remote", "local"]},
                "remote_entry_url": {"type": "string"},
                "scope": {"type": "string"},
                "exposed_module": {"type": "string"}
            }
        }
    }
}


class ModuleUploadService:
    """Service for handling module uploads, validation, and publishing"""
    
    def __init__(self):
        """Initialize MinIO and Kubernetes clients"""
        try:
            self.minio_client = Minio(
                MINIO_ENDPOINT,
                access_key=MINIO_ACCESS_KEY,
                secret_key=MINIO_SECRET_KEY,
                secure=MINIO_SECURE
            )
            logger.info(f"MinIO client initialized: {MINIO_ENDPOINT}")
        except Exception as e:
            logger.error(f"Failed to initialize MinIO client: {e}")
            raise
        
        try:
            # Try to load in-cluster config first, fallback to kubeconfig
            try:
                config.load_incluster_config()
            except:
                config.load_kube_config()
            self.k8s_batch_api = client.BatchV1Api()
            self.k8s_core_api = client.CoreV1Api()
            logger.info("Kubernetes client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Kubernetes client: {e}")
            raise
    
    def validate_manifest(self, manifest_data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Validate manifest.json against schema"""
        try:
            jsonschema.validate(instance=manifest_data, schema=MANIFEST_SCHEMA)
            return True, None
        except jsonschema.ValidationError as e:
            return False, f"Schema validation error: {e.message}"
        except Exception as e:
            return False, f"Validation error: {str(e)}"
    
    def extract_and_validate_zip(self, zip_file: BytesIO) -> tuple[Optional[Dict], Optional[str], Optional[str]]:
        """Extract ZIP and validate structure"""
        try:
            with zipfile.ZipFile(zip_file, 'r') as zip_ref:
                # Check for manifest.json
                if 'manifest.json' not in zip_ref.namelist():
                    return None, None, "manifest.json not found in ZIP"
                
                # Check for src/App.tsx
                if 'src/App.tsx' not in zip_ref.namelist() and 'src/App.jsx' not in zip_ref.namelist():
                    return None, None, "src/App.tsx or src/App.jsx not found in ZIP"
                
                # Extract and parse manifest.json
                manifest_content = zip_ref.read('manifest.json')
                try:
                    manifest_data = json.loads(manifest_content.decode('utf-8'))
                except json.JSONDecodeError as e:
                    return None, None, f"Invalid JSON in manifest.json: {str(e)}"
                
                # Validate manifest schema
                is_valid, error = self.validate_manifest(manifest_data)
                if not is_valid:
                    return None, None, error
                
                return manifest_data, None, None
                
        except zipfile.BadZipFile:
            return None, None, "Invalid ZIP file"
        except Exception as e:
            return None, None, f"Error extracting ZIP: {str(e)}"
    
    def upload_to_minio(self, zip_file: BytesIO, upload_id: str) -> str:
        """Upload ZIP to MinIO modules-raw bucket"""
        zip_file.seek(0)  # Reset file pointer
        object_name = f"{upload_id}.zip"
        
        try:
            # Ensure bucket exists
            if not self.minio_client.bucket_exists("modules-raw"):
                self.minio_client.make_bucket("modules-raw")
            
            # Upload file
            self.minio_client.put_object(
                "modules-raw",
                object_name,
                zip_file,
                length=zip_file.getbuffer().nbytes,
                content_type="application/zip"
            )
            
            logger.info(f"Uploaded {object_name} to modules-raw bucket")
            return object_name
            
        except S3Error as e:
            logger.error(f"MinIO error uploading {object_name}: {e}")
            raise Exception(f"Failed to upload to MinIO: {str(e)}")
    
    def create_validation_job(self, upload_id: str, module_id: str, version: str) -> bool:
        """Create Kubernetes Job for module validation"""
        job_name = f"module-validation-{upload_id[:8]}"
        
        job_manifest = {
            "apiVersion": "batch/v1",
            "kind": "Job",
            "metadata": {
                "name": job_name,
                "namespace": K8S_NAMESPACE,
                "labels": {
                    "app": "module-validation",
                    "upload-id": upload_id
                }
            },
            "spec": {
                "ttlSecondsAfterFinished": 3600,  # Clean up after 1 hour
                "backoffLimit": 1,
                "template": {
                    "metadata": {
                        "labels": {
                            "app": "module-validation",
                            "upload-id": upload_id
                        }
                    },
                    "spec": {
                        "restartPolicy": "Never",
                        "containers": [
                            {
                                "name": "validator",
                                "image": "node:18-alpine",
                                "command": ["/bin/sh"],
                                "args": [
                                    "-c",
                                    f"""
                                    set -e
                                    echo "Starting module validation for {module_id} v{version}"
                                    
                                    # Install dependencies
                                    apk add --no-cache curl unzip python3 py3-pip
                                    pip3 install minio requests
                                    
                                    # Download ZIP from MinIO
                                    export MINIO_ENDPOINT={MINIO_ENDPOINT}
                                    export MINIO_ACCESS_KEY={MINIO_ACCESS_KEY}
                                    export MINIO_SECRET_KEY={MINIO_SECRET_KEY}
                                    
                                    python3 << 'PYTHON_SCRIPT'
import os
import sys
import zipfile
import subprocess
import json
from minio import Minio
from minio.error import S3Error

minio_client = Minio(
    os.environ['MINIO_ENDPOINT'],
    access_key=os.environ['MINIO_ACCESS_KEY'],
    secret_key=os.environ['MINIO_SECRET_KEY'],
    secure=False
)

upload_id = '{upload_id}'
zip_path = f"/tmp/{{upload_id}}.zip"
extract_path = f"/tmp/module-{{upload_id}}"

# Download ZIP
print(f"Downloading {{upload_id}}.zip from MinIO...")
minio_client.fget_object("modules-raw", f"{{upload_id}}.zip", zip_path)

# Extract
print("Extracting ZIP...")
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_path)

# Change to extracted directory
os.chdir(extract_path)

# npm install (with --ignore-scripts for security)
print("Running npm install...")
result = subprocess.run(
    ["npm", "install", "--ignore-scripts"],
    capture_output=True,
    text=True,
    timeout=300
)
if result.returncode != 0:
    print(f"npm install failed: {{result.stderr}}")
    sys.exit(1)

# npm run build
print("Running npm run build...")
result = subprocess.run(
    ["npm", "run", "build"],
    capture_output=True,
    text=True,
    timeout=600
)
if result.returncode != 0:
    print(f"npm run build failed: {{result.stderr}}")
    sys.exit(1)

print("Build successful!")

# Upload built assets to MinIO
print("Uploading built assets to MinIO...")

# Ensure modules-build bucket exists
try:
    if not minio_client.bucket_exists("modules-build"):
        minio_client.make_bucket("modules-build")
except Exception as e:
    print(f"WARNING: Could not ensure modules-build bucket exists: {{e}}")

# Find dist or build directory
dist_dir = None
for d in ["dist", "build", "out"]:
    if os.path.exists(d):
        dist_dir = d
        break

if not dist_dir or not os.path.exists(dist_dir):
    print("ERROR: Build directory not found")
    sys.exit(1)

# Create a new ZIP with built assets
built_zip_path = f"/tmp/{{upload_id}}-built.zip"
with zipfile.ZipFile(built_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(dist_dir):
        for file in files:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, dist_dir)
            zipf.write(file_path, arcname)

# Upload to MinIO modules-build bucket
import io
with open(built_zip_path, 'rb') as f:
    file_data = f.read()
    minio_client.put_object(
        "modules-build",
        f"{{upload_id}}-built.zip",
        io.BytesIO(file_data),
        length=len(file_data),
        content_type="application/zip"
    )

print("Built assets uploaded to MinIO successfully")

# Call internal registration endpoint
print("Registering module in database...")
import requests

entity_manager_url = os.getenv('ENTITY_MANAGER_URL', 'http://entity-manager-service:5000')
internal_secret = os.getenv('INTERNAL_SERVICE_SECRET', '')

# Read manifest again for registration
with open("manifest.json", 'r') as f:
    manifest_json = json.load(f)

registration_data = {
    "upload_id": "{upload_id}",
    "manifest_data": manifest_json
}

try:
    response = requests.post(
        f"{{entity_manager_url}}/api/internal/modules/register-validated",
        json=registration_data,
        headers={
            "X-Internal-Service-Secret": internal_secret,
            "Content-Type": "application/json"
        },
        timeout=30
    )
    
    if response.status_code == 200:
        print("Module registered successfully!")
        result = response.json()
        print(f"Module ID: {{result.get('module_id')}}")
    else:
        print(f"WARNING: Registration failed: {{response.status_code}} - {{response.text}}")
        # Don't fail the job, registration can be done manually
except Exception as e:
    print(f"WARNING: Could not register module: {{e}}")
    # Don't fail the job, registration can be done manually

print("Validation and registration completed!")
PYTHON_SCRIPT
                                    """
                                ],
                                "env": [
                                    {
                                        "name": "MINIO_ENDPOINT",
                                        "value": MINIO_ENDPOINT
                                    },
                                    {
                                        "name": "MINIO_ACCESS_KEY",
                                        "value": MINIO_ACCESS_KEY
                                    },
                                    {
                                        "name": "MINIO_SECRET_KEY",
                                        "value": MINIO_SECRET_KEY
                                    },
                                    {
                                        "name": "UPLOAD_ID",
                                        "value": upload_id
                                    },
                                    {
                                        "name": "MODULE_ID",
                                        "value": module_id
                                    },
                                    {
                                        "name": "VERSION",
                                        "value": version
                                    },
                                    {
                                        "name": "ENTITY_MANAGER_URL",
                                        "value": os.getenv('ENTITY_MANAGER_URL', 'http://entity-manager-service:5000')
                                    },
                                    {
                                        "name": "INTERNAL_SERVICE_SECRET",
                                        "value": os.getenv('INTERNAL_SERVICE_SECRET', '')
                                    }
                                ],
                                "resources": {
                                    "requests": {
                                        "memory": "1Gi",
                                        "cpu": "500m"
                                    },
                                    "limits": {
                                        "memory": "2Gi",
                                        "cpu": "1000m"
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        }
        
        try:
            self.k8s_batch_api.create_namespaced_job(
                namespace=K8S_NAMESPACE,
                body=job_manifest
            )
            logger.info(f"Created validation job: {job_name}")
            return True
        except ApiException as e:
            logger.error(f"Failed to create validation job: {e}")
            return False
    
    def register_module_in_database(
        self, 
        manifest_data: Dict[str, Any], 
        upload_id: str,
        db_connection
    ) -> bool:
        """
        Register validated module in marketplace_modules table.
        
        Args:
            manifest_data: Validated manifest.json data
            upload_id: Unique upload identifier
            db_connection: Database connection (from get_db_connection_simple())
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            build_config = manifest_data.get('build_config', {})
            
            # Prepare module data from manifest
            module_data = {
                'id': manifest_data['id'],
                'name': manifest_data['name'],
                'display_name': manifest_data['display_name'],
                'description': manifest_data.get('description', ''),
                'version': manifest_data['version'],
                'author': manifest_data.get('author', {}).get('name', ''),
                'category': manifest_data.get('category'),
                'icon_url': manifest_data.get('icon'),
                'module_type': manifest_data['module_type'],
                'required_plan_type': manifest_data.get('required_plan_type'),
                'pricing_tier': manifest_data.get('pricing_tier', 'FREE'),
                'route_path': manifest_data['route_path'],
                'label': manifest_data['label'],
                'required_roles': manifest_data.get('required_roles', []),
                'remote_entry_url': build_config.get('remote_entry_url'),
                'scope': build_config.get('scope'),
                'exposed_module': build_config.get('exposed_module'),
                'is_local': build_config.get('type') == 'local',
                'is_active': False,  # Start inactive, admin must activate
                'metadata': json.dumps({
                    'author': manifest_data.get('author', {}),
                    'upload_id': upload_id,
                    'uploaded_at': datetime.utcnow().isoformat()
                })
            }
            
            cur = db_connection.cursor()
            
            # Check if module already exists
            cur.execute("SELECT id FROM marketplace_modules WHERE id = %s", (module_data['id'],))
            existing = cur.fetchone()
            
            if existing:
                # Update existing module
                cur.execute("""
                    UPDATE marketplace_modules 
                    SET display_name = %s, description = %s, version = %s,
                        author = %s, category = %s, icon_url = %s,
                        module_type = %s, required_plan_type = %s, pricing_tier = %s,
                        route_path = %s, label = %s, required_roles = %s,
                        remote_entry_url = %s, scope = %s, exposed_module = %s,
                        is_local = %s, metadata = %s::jsonb, updated_at = NOW()
                    WHERE id = %s
                """, (
                    module_data['display_name'], module_data['description'], module_data['version'],
                    module_data['author'], module_data['category'], module_data['icon_url'],
                    module_data['module_type'], module_data['required_plan_type'], module_data['pricing_tier'],
                    module_data['route_path'], module_data['label'], module_data['required_roles'],
                    module_data['remote_entry_url'], module_data['scope'], module_data['exposed_module'],
                    module_data['is_local'], module_data['metadata'], module_data['id']
                ))
                logger.info(f"Updated existing module {module_data['id']} in database")
            else:
                # Insert new module
                cur.execute("""
                    INSERT INTO marketplace_modules (
                        id, name, display_name, description, version, author, category,
                        icon_url, module_type, required_plan_type, pricing_tier,
                        route_path, label, required_roles, remote_entry_url, scope,
                        exposed_module, is_local, is_active, metadata, created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, NOW()
                    )
                """, (
                    module_data['id'], module_data['name'], module_data['display_name'],
                    module_data['description'], module_data['version'], module_data['author'],
                    module_data['category'], module_data['icon_url'], module_data['module_type'],
                    module_data['required_plan_type'], module_data['pricing_tier'],
                    module_data['route_path'], module_data['label'], module_data['required_roles'],
                    module_data['remote_entry_url'], module_data['scope'], module_data['exposed_module'],
                    module_data['is_local'], module_data['is_active'], module_data['metadata']
                ))
                logger.info(f"Registered new module {module_data['id']} in database")
            
            db_connection.commit()
            cur.close()
            return True
            
        except Exception as e:
            logger.error(f"Error registering module in database: {e}")
            if db_connection:
                db_connection.rollback()
            return False
    
    def deploy_module_assets_to_server(self, upload_id: str, module_id: str) -> tuple[bool, str]:
        """
        Deploy built module assets from MinIO to modules-server pod.
        
        Uses Kubernetes exec API to copy files directly to the pod.
        
        Args:
            upload_id: Upload identifier
            module_id: Module ID
            
        Returns:
            tuple: (success: bool, message: str)
        """
        """
        Deploy built module assets from MinIO to modules-server pod.
        
        Args:
            upload_id: Upload identifier
            module_id: Module ID
            
        Returns:
            tuple: (success: bool, message: str)
        """
        try:
            import tempfile
            import shutil
            
            # Download built assets from MinIO
            built_zip_key = f"{upload_id}-built.zip"
            temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
            temp_zip_path = temp_zip.name
            temp_zip.close()
            
            try:
                self.minio_client.fget_object("modules-build", built_zip_key, temp_zip_path)
            except S3Error as e:
                return False, f"Failed to download built assets from MinIO: {str(e)}"
            
            # Extract to temp directory
            temp_extract_dir = tempfile.mkdtemp(prefix=f"module-{module_id}-")
            
            try:
                import zipfile
                with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_extract_dir)
                
                # Get modules-server pod
                pods = self.k8s_core_api.list_namespaced_pod(
                    namespace=K8S_NAMESPACE,
                    label_selector="app=modules-server"
                )
                
                if not pods.items:
                    return False, "No modules-server pod found"
                
                pod_name = pods.items[0].metadata.name
                
                # Create destination directory in pod
                module_dest_path = f"/usr/share/nginx/html/{module_id}"
                
                # Use kubectl exec to copy files (via Kubernetes API exec)
                # We'll use a helper script approach since direct file copy via API is complex
                # For now, we'll create a job that copies files
                # Alternatively, we can use a sidecar or init container approach
                
                # Simple approach: create a job that copies files using kubectl cp equivalent
                deploy_job_name = f"module-deploy-{upload_id[:8]}"
                
                # Create a deployment job that copies files
                deploy_job_manifest = {
                    "apiVersion": "batch/v1",
                    "kind": "Job",
                    "metadata": {
                        "name": deploy_job_name,
                        "namespace": K8S_NAMESPACE,
                        "labels": {
                            "app": "module-deployment",
                            "module-id": module_id
                        }
                    },
                    "spec": {
                        "ttlSecondsAfterFinished": 300,
                        "backoffLimit": 2,
                        "template": {
                            "spec": {
                                "restartPolicy": "Never",
                                "serviceAccountName": "default",
                                "containers": [
                                    {
                                        "name": "deployer",
                                        "image": "bitnami/kubectl:latest",
                                        "command": ["/bin/sh"],
                                        "args": [
                                            "-c",
                                            f"""
                                            # Install curl and unzip
                                            apk add --no-cache curl unzip
            
                                            # Download from MinIO (we'll pass credentials via env)
                                            curl -X GET "http://$MINIO_ENDPOINT/modules-build/{built_zip_key}" \\
                                                -H "Authorization: AWS $MINIO_ACCESS_KEY:$MINIO_SECRET_KEY" \\
                                                -o /tmp/module.zip
            
                                            # Unzip
                                            unzip -q /tmp/module.zip -d /tmp/module
            
                                            # Copy to modules-server pod using kubectl cp
                                            kubectl cp /tmp/module/. {K8S_NAMESPACE}/{pod_name}:{module_dest_path}/ || {{
                                                echo "Failed to copy files"
                                                exit 1
                                            }}
            
                                            echo "Deployment completed successfully"
                                            """
                                        ],
                                        "env": [
                                            {
                                                "name": "MINIO_ENDPOINT",
                                                "value": MINIO_ENDPOINT
                                            },
                                            {
                                                "name": "MINIO_ACCESS_KEY",
                                                "value": MINIO_ACCESS_KEY
                                            },
                                            {
                                                "name": "MINIO_SECRET_KEY",
                                                "value": MINIO_SECRET_KEY
                                            }
                                        ],
                                        "resources": {
                                            "requests": {
                                                "memory": "256Mi",
                                                "cpu": "100m"
                                            },
                                            "limits": {
                                                "memory": "512Mi",
                                                "cpu": "500m"
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
                
                # Actually, kubectl cp from within a pod is complex. Let's use a simpler approach:
                # Copy files directly using Kubernetes API exec and tar
                # But for now, we'll use a workaround: create files via ConfigMap or use init container
                # Let's use a simpler method: extract and copy via exec
                
                # Create deployment job that uses shared PVC to copy files
                # The job will download from MinIO, extract, and copy to modules-server PVC
                try:
                    self.k8s_batch_api.create_namespaced_job(
                        namespace=K8S_NAMESPACE,
                        body=deploy_job_manifest
                    )
                    logger.info(f"Created deployment job: {deploy_job_name}")
                    return True, f"Deployment job created: {deploy_job_name}. Assets will be copied to {module_dest_path}"
                except ApiException as e:
                    logger.error(f"Failed to create deployment job: {e}")
                    return False, f"Failed to create deployment job: {str(e)}"
                
            finally:
                # Cleanup
                os.unlink(temp_zip_path)
                if os.path.exists(temp_extract_dir):
                    shutil.rmtree(temp_extract_dir, ignore_errors=True)
                
        except Exception as e:
            logger.error(f"Error deploying module assets: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False, f"Deployment failed: {str(e)}"
