#!/bin/sh
# =============================================================================
# Nekazari — MinIO bucket initialization for docker-compose
# =============================================================================
set -e

echo "Waiting for MinIO to be ready..."
until mc alias set minio http://minio:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" 2>/dev/null; do
  sleep 2
done

echo "Creating buckets..."
mc mb --ignore-existing minio/nekazari-frontend
mc mb --ignore-existing minio/assets-3d

# Allow anonymous read on frontend bucket (serves static files via nginx)
mc anonymous set download minio/nekazari-frontend

echo "MinIO initialization complete."
