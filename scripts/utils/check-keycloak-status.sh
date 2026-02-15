#!/bin/bash
# Check Keycloak status and logs

echo "Checking Keycloak pod status..."
kubectl get pods -n nekazari | grep keycloak

echo -e "\nChecking Keycloak logs (last 50 lines)..."
kubectl logs -n nekazari -l app=keycloak --tail=50

echo -e "\nChecking Keycloak deployment..."
kubectl get deployment keycloak -n nekazari

echo -e "\nChecking Keycloak service..."
kubectl get svc keycloak-service -n nekazari

