#!/bin/sh
set -e

NGINX_HTML_DIR="/usr/share/nginx/html"
INDEX_HTML="${NGINX_HTML_DIR}/index.html"

echo "🚀 Nekazari Frontend - Generando configuración de runtime..."

VITE_API_URL="${VITE_API_URL:-https://nkz.robotika.cloud}"
VITE_KEYCLOAK_URL="${VITE_KEYCLOAK_URL:-https://auth.robotika.cloud}"
VITE_KEYCLOAK_REALM="${VITE_KEYCLOAK_REALM:-nekazari}"
VITE_KEYCLOAK_CLIENT_ID="${VITE_KEYCLOAK_CLIENT_ID:-nekazari-frontend}"
VITE_CESIUM_TOKEN="${VITE_CESIUM_TOKEN:-}"
VITE_ENABLE_NDVI="${VITE_ENABLE_NDVI:-true}"
VITE_ENABLE_WEATHER="${VITE_ENABLE_WEATHER:-true}"
VITE_ENABLE_RISK="${VITE_ENABLE_RISK:-true}"
VITE_MODULES_CDN_URL="${VITE_MODULES_CDN_URL:-/modules}"

CESIUM_SCRIPT=""
if [ -d "${NGINX_HTML_DIR}/cesium" ]; then
    CESIUM_SCRIPT="<script src=\"/cesium/Cesium.js\"></script>"
fi

ENV_SCRIPT="<script id=\"runtime-config\">window.__ENV__ = { VITE_API_URL: \"${VITE_API_URL}\", VITE_KEYCLOAK_URL: \"${VITE_KEYCLOAK_URL}\", VITE_KEYCLOAK_REALM: \"${VITE_KEYCLOAK_REALM}\", VITE_KEYCLOAK_CLIENT_ID: \"${VITE_KEYCLOAK_CLIENT_ID}\", VITE_CESIUM_TOKEN: \"${VITE_CESIUM_TOKEN}\", VITE_ENABLE_NDVI: ${VITE_ENABLE_NDVI}, VITE_ENABLE_WEATHER: ${VITE_ENABLE_WEATHER}, VITE_ENABLE_RISK: ${VITE_ENABLE_RISK}, VITE_MODULES_CDN_URL: \"${VITE_MODULES_CDN_URL}\" }; console.log('[Nekazari] Runtime config injected');</script>"

if [ -f "${INDEX_HTML}" ]; then
    sed -i '/<script id="runtime-config">/,/<\/script>/d' "${INDEX_HTML}"
    sed -i '/<script src="\/cesium\/Cesium.js"><\/script>/d' "${INDEX_HTML}"
    
    # Inserción con saltos de línea literales para BusyBox sed (Alpine)
    # Importante poner la etiqueta de cierre en una línea nueva para evitar borrados accidentales
    sed -i "s|<\/head>|${CESIUM_SCRIPT}\n${ENV_SCRIPT}\n<\/head>|" "${INDEX_HTML}"
    echo "✅ Configuración y dependencias inyectadas en index.html"
else
    echo "⚠️  Archivo index.html no encontrado"
fi

echo "   - API URL: ${VITE_API_URL}"
echo "   - Keycloak URL: ${VITE_KEYCLOAK_URL}"

echo "🌐 Iniciando Nginx..."
exec nginx -g 'daemon off;'
