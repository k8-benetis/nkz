#!/bin/sh
set -e

NGINX_HTML_DIR="/usr/share/nginx/html"
INDEX_HTML="${NGINX_HTML_DIR}/index.html"

echo "🚀 Nekazari Frontend - Generando configuración de runtime..."

VITE_API_URL="${VITE_API_URL:-https://nkz.robotika.cloud}"
VITE_KEYCLOAK_URL="${VITE_KEYCLOAK_URL:-https://auth.robotika.cloud/auth}"
VITE_KEYCLOAK_REALM="${VITE_KEYCLOAK_REALM:-nekazari}"
VITE_KEYCLOAK_CLIENT_ID="${VITE_KEYCLOAK_CLIENT_ID:-nekazari-frontend}"
VITE_CESIUM_TOKEN="${VITE_CESIUM_TOKEN:-}"
VITE_ENABLE_NDVI="${VITE_ENABLE_NDVI:-true}"
VITE_ENABLE_WEATHER="${VITE_ENABLE_WEATHER:-true}"
VITE_ENABLE_RISK="${VITE_ENABLE_RISK:-true}"
VITE_MODULES_CDN_URL="${VITE_MODULES_CDN_URL:-/modules}"

# Commercial landing env vars (optional — only needed when landing_mode=commercial)
COMPANY_URL="${COMPANY_URL:-}"
COMPANY_NAME="${COMPANY_NAME:-}"
SUPPORT_EMAIL="${SUPPORT_EMAIL:-}"
SALES_EMAIL="${SALES_EMAIL:-}"
PARTNERS_JSON="${PARTNERS_JSON:-}"

CESIUM_SCRIPT=""
if [ -d "${NGINX_HTML_DIR}/cesium" ]; then
    CESIUM_SCRIPT="<script src=\"/cesium/Cesium.js\"></script>"
fi

# Write runtime config to a temp file, then inject into index.html.
# PARTNERS_JSON is written separately to avoid shell quoting issues with nested JSON.
RUNTIME_JS="${NGINX_HTML_DIR}/__nkz_runtime__.js"
cat > "${RUNTIME_JS}" <<JSEOF
window.__ENV__ = {
  VITE_API_URL: "${VITE_API_URL}",
  VITE_KEYCLOAK_URL: "${VITE_KEYCLOAK_URL}",
  VITE_KEYCLOAK_REALM: "${VITE_KEYCLOAK_REALM}",
  VITE_KEYCLOAK_CLIENT_ID: "${VITE_KEYCLOAK_CLIENT_ID}",
  VITE_CESIUM_TOKEN: "${VITE_CESIUM_TOKEN}",
  VITE_ENABLE_NDVI: ${VITE_ENABLE_NDVI},
  VITE_ENABLE_WEATHER: ${VITE_ENABLE_WEATHER},
  VITE_ENABLE_RISK: ${VITE_ENABLE_RISK},
  VITE_MODULES_CDN_URL: "${VITE_MODULES_CDN_URL}",
  COMPANY_URL: "${COMPANY_URL}",
  COMPANY_NAME: "${COMPANY_NAME}",
  SUPPORT_EMAIL: "${SUPPORT_EMAIL}",
  SALES_EMAIL: "${SALES_EMAIL}",
  PARTNERS_JSON: ${PARTNERS_JSON:-"\"\""}
};
console.log('[Nekazari] Runtime config injected');
JSEOF

if [ -f "${INDEX_HTML}" ]; then
    # Remove any previous runtime-config script (inline or external)
    sed -i '/<script id="runtime-config">/,/<\/script>/d' "${INDEX_HTML}"
    sed -i '/<script src="\/__nkz_runtime__\.js"><\/script>/d' "${INDEX_HTML}"
    sed -i '/<script src="\/cesium\/Cesium.js"><\/script>/d' "${INDEX_HTML}"

    # Inject external runtime script + optional Cesium
    sed -i "s|</head>|${CESIUM_SCRIPT}\n<script src=\"/__nkz_runtime__.js\"></script>\n</head>|" "${INDEX_HTML}"
    echo "✅ Configuración y dependencias inyectadas en index.html"
else
    echo "⚠️  Archivo index.html no encontrado"
fi

echo "   - API URL: ${VITE_API_URL}"
echo "   - Keycloak URL: ${VITE_KEYCLOAK_URL}"

echo "🌐 Iniciando Nginx..."
exec nginx -g 'daemon off;'
