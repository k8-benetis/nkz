#!/bin/bash
set -e

# Define namespace
NAMESPACE="nekazari"

echo "🔐 Generating SDM Secrets for Namespace: $NAMESPACE"

# 1. SDM Secrets (MongoDB & HMAC)
# We prompt for sensitive values or generate random ones if you prefer for dev
# For this script we will generate random for dev/demo or allow env override

DB_PASSWORD=${MONGODB_PASSWORD:-$(openssl rand -base64 24)}
# Connection string template: mongodb://admin:<PASSWORD>@mongodb-service:27017/orion?authSource=admin
# We encode the FULL connection string or just the parts. The Code expects MONGODB_URL full string.
# Constructing safe URL
MONGODB_URL="mongodb://admin:${DB_PASSWORD}@mongodb-service:27017/orion?authSource=admin"

HMAC=$(openssl rand -base64 32)

echo "   -> Creating sdm-secrets..."
kubectl create secret generic sdm-secrets \
  --from-literal=mongodb-url="$MONGODB_URL" \
  --from-literal=mongodb-password="$DB_PASSWORD" \
  --from-literal=hmac-secret="$HMAC" \
  --namespace $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secrets generated and applied successfully."
echo "⚠️  IMPORTANT: If your MongoDB admin password is NOT the one generated above, the service will fail."
echo "   Please manually update the secret if you have a fixed DB password:"
echo "   kubectl create secret generic sdm-secrets --from-literal=mongodb-url='mongodb://admin:YOUR_REAL_PASS@mongodb-service:27017/orion?authSource=admin' --dry-run=client -o yaml | kubectl apply -f -"
