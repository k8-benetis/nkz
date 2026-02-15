#!/bin/bash
# Script para verificar configuración SMTP en el servidor
# Uso: ./scripts/check-smtp-config.sh

set -e

echo "=========================================="
echo "Verificación de Configuración SMTP"
echo "=========================================="
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Verificar Email Service SMTP Configuration
echo -e "${GREEN}1. Email Service - Configuración SMTP${NC}"
echo "----------------------------------------"
echo "Secret: smtp-credentials"
kubectl get secret smtp-credentials -n nekazari -o jsonpath='{.data}' 2>/dev/null | jq -r 'to_entries[] | "\(.key): \(.value | @base64d)"' || echo -e "${RED}❌ Secret no encontrado${NC}"
echo ""

# 2. Verificar ConfigMap del Email Service
echo -e "${GREEN}2. Email Service - ConfigMap${NC}"
echo "----------------------------------------"
kubectl get configmap email-service-config -n nekazari -o yaml 2>/dev/null || echo -e "${YELLOW}⚠️  ConfigMap no encontrado (puede estar en el deployment)${NC}"
echo ""

# 3. Verificar variables de entorno del Email Service
echo -e "${GREEN}3. Email Service - Variables de Entorno${NC}"
echo "----------------------------------------"
kubectl get deployment email-service -n nekazari -o jsonpath='{.spec.template.spec.containers[0].env[*]}' 2>/dev/null | jq -r '.' || echo -e "${YELLOW}⚠️  Deployment no encontrado${NC}"
echo ""

# 4. Verificar Keycloak SMTP Configuration (desde Realm)
echo -e "${GREEN}4. Keycloak - Configuración SMTP (desde Realm)${NC}"
echo "----------------------------------------"
echo "Para verificar SMTP en Keycloak, ejecuta:"
echo ""
echo "  kubectl exec -it -n nekazari deployment/keycloak -- /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password \$(kubectl get secret keycloak-secret -n nekazari -o jsonpath='{.data.admin-password}' | base64 -d)"
echo ""
echo "  kubectl exec -it -n nekazari deployment/keycloak -- /opt/keycloak/bin/kcadm.sh get realms/nekazari | grep -A 20 smtpServer"
echo ""
echo "O accede al Admin Console de Keycloak:"
echo "  https://nekazari.robotika.cloud/auth/admin/nekazari/console/"
echo "  Realm Settings → Email → SMTP Server"
echo ""

# 5. Verificar si hay variables SMTP en Keycloak deployment
echo -e "${GREEN}5. Keycloak - Variables de Entorno SMTP${NC}"
echo "----------------------------------------"
kubectl get deployment keycloak -n nekazari -o jsonpath='{.spec.template.spec.containers[0].env[*]}' 2>/dev/null | jq -r '.[] | select(.name | contains("SMTP") or contains("EMAIL")) | "\(.name): \(.value // .valueFrom)"' || echo -e "${YELLOW}⚠️  No se encontraron variables SMTP en el deployment${NC}"
echo ""

# 6. Verificar logs del Email Service (últimas líneas)
echo -e "${GREEN}6. Email Service - Últimos Logs${NC}"
echo "----------------------------------------"
kubectl logs -n nekazari deployment/email-service --tail=20 2>/dev/null | grep -i smtp || echo -e "${YELLOW}⚠️  No hay logs recientes relacionados con SMTP${NC}"
echo ""

# 7. Verificar conectividad SMTP (test básico)
echo -e "${GREEN}7. Test de Conectividad SMTP${NC}"
echo "----------------------------------------"
echo "Para probar conectividad SMTP, puedes ejecutar:"
echo ""
echo "  kubectl exec -it -n nekazari deployment/email-service -- python -c \""
echo "    import smtplib"
echo "    from email.mime.text import MIMEText"
echo "    # Obtener credenciales desde variables de entorno"
echo "    # y probar conexión"
echo "  \""
echo ""

# 8. Resumen de configuración recomendada
echo -e "${GREEN}8. Configuración SMTP Recomendada${NC}"
echo "----------------------------------------"
echo "Para Keycloak (configurar desde Admin Console):"
echo "  - Host: smtp.ionos.es (o tu proveedor SMTP)"
echo "  - Port: 587 (TLS) o 465 (SSL)"
echo "  - From: nekazari@robotika.cloud"
echo "  - Authentication: Enabled"
echo "  - Username: nekazari@robotika.cloud"
echo "  - Password: [tu contraseña SMTP]"
echo ""
echo "Para Email Service (ya configurado en secret):"
echo "  - Verificar secret 'smtp-credentials'"
echo "  - Variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD"
echo ""

echo "=========================================="
echo "Verificación completada"
echo "=========================================="


