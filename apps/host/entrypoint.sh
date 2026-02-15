#!/bin/sh
# =============================================================================
# Nekazari Frontend - Runtime Config Entrypoint
# =============================================================================
# Este script se ejecuta al arrancar el contenedor en K8s.
# Lee las variables de entorno y genera /usr/share/nginx/html/env-config.js
# para que el frontend React pueda acceder a la configuración en runtime.
#
# IMPORTANTE: Las variables VITE_* en build-time se "queman" en el bundle.
# Este script permite cambiar la configuración SIN rebuilds.
# =============================================================================

set -e

# Directorio donde se sirven los archivos estáticos
NGINX_HTML_DIR="/usr/share/nginx/html"
ENV_CONFIG_FILE="${NGINX_HTML_DIR}/env-config.js"

echo "🚀 Nekazari Frontend - Generando configuración de runtime..."

# =============================================================================
# Variables de entorno con valores por defecto
# =============================================================================
# API Backend
VITE_API_URL="${VITE_API_URL:-https://nkz.robotika.cloud}"

# Keycloak Authentication
VITE_KEYCLOAK_URL="${VITE_KEYCLOAK_URL:-https://auth.robotika.cloud}"
VITE_KEYCLOAK_REALM="${VITE_KEYCLOAK_REALM:-nekazari}"
VITE_KEYCLOAK_CLIENT_ID="${VITE_KEYCLOAK_CLIENT_ID:-nekazari-frontend}"

# Cesium 3D Maps
VITE_CESIUM_TOKEN="${VITE_CESIUM_TOKEN:-}"

# OpenWeather API
VITE_OPENWEATHER_API_KEY="${VITE_OPENWEATHER_API_KEY:-}"

# Mapbox (alternativo a Cesium)
VITE_MAPBOX_TOKEN="${VITE_MAPBOX_TOKEN:-}"

# Feature Flags
VITE_ENABLE_ROS2="${VITE_ENABLE_ROS2:-false}"
VITE_ENABLE_NDVI="${VITE_ENABLE_NDVI:-true}"
VITE_ENABLE_WEATHER="${VITE_ENABLE_WEATHER:-true}"
VITE_ENABLE_RISK="${VITE_ENABLE_RISK:-true}"

# Módulos Federation
VITE_MODULES_CDN_URL="${VITE_MODULES_CDN_URL:-/modules}"

# Debug
VITE_DEBUG="${VITE_DEBUG:-false}"

# =============================================================================
# Generar el contenido de env-config como script inline
# =============================================================================
ENV_CONFIG_CONTENT="// =============================================================================
// Nekazari Frontend - Runtime Configuration
// =============================================================================
// Generado automáticamente por entrypoint.sh al arrancar el pod.
// NO EDITAR MANUALMENTE - Los cambios se perderán al reiniciar.
// Fecha: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
// =============================================================================

window.__ENV__ = {
  // API Backend
  VITE_API_URL: \"${VITE_API_URL}\",
  
  // Keycloak Authentication
  VITE_KEYCLOAK_URL: \"${VITE_KEYCLOAK_URL}\",
  VITE_KEYCLOAK_REALM: \"${VITE_KEYCLOAK_REALM}\",
  VITE_KEYCLOAK_CLIENT_ID: \"${VITE_KEYCLOAK_CLIENT_ID}\",
  
  // Cesium 3D Maps
  VITE_CESIUM_TOKEN: \"${VITE_CESIUM_TOKEN}\",
  
  // OpenWeather API
  VITE_OPENWEATHER_API_KEY: \"${VITE_OPENWEATHER_API_KEY}\",
  
  // Mapbox
  VITE_MAPBOX_TOKEN: \"${VITE_MAPBOX_TOKEN}\",
  
  // Feature Flags
  VITE_ENABLE_ROS2: ${VITE_ENABLE_ROS2},
  VITE_ENABLE_NDVI: ${VITE_ENABLE_NDVI},
  VITE_ENABLE_WEATHER: ${VITE_ENABLE_WEATHER},
  VITE_ENABLE_RISK: ${VITE_ENABLE_RISK},
  
  // Módulos Federation
  VITE_MODULES_CDN_URL: \"${VITE_MODULES_CDN_URL}\",
  
  // Debug
  VITE_DEBUG: ${VITE_DEBUG}
};

// Helper function para acceder a las variables
window.getEnvVar = function(key, defaultValue) {
  if (window.__ENV__ && window.__ENV__[key] !== undefined && window.__ENV__[key] !== \"\") {
    return window.__ENV__[key];
  }
  return defaultValue;
};

console.log('[Nekazari] Runtime config loaded:', {
  apiUrl: window.__ENV__.VITE_API_URL,
  keycloakUrl: window.__ENV__.VITE_KEYCLOAK_URL,
  modulesUrl: window.__ENV__.VITE_MODULES_CDN_URL
});"

# =============================================================================
# Inyectar env-config directamente en index.html
# =============================================================================
INDEX_HTML="${NGINX_HTML_DIR}/index.html"
if [ -f "${INDEX_HTML}" ]; then
  # Crear un archivo temporal con el script completo
  TEMP_SCRIPT=$(mktemp)
  cat > "${TEMP_SCRIPT}" << 'SCRIPTEOF'
<script>
SCRIPTEOF
  echo "${ENV_CONFIG_CONTENT}" >> "${TEMP_SCRIPT}"
  echo "</script>" >> "${TEMP_SCRIPT}"
  
  # Usar awk para insertar ANTES de </head> (más robusto que sed)
  awk -v script="$(cat "${TEMP_SCRIPT}")" '
    /<\/head>/ {
      print script
      print
      next
    }
    { print }
  ' "${INDEX_HTML}" > "${INDEX_HTML}.tmp" && mv "${INDEX_HTML}.tmp" "${INDEX_HTML}"
  
  # Limpiar archivo temporal
  rm -f "${TEMP_SCRIPT}"
  
  echo "✅ Configuración inyectada en ${INDEX_HTML}"
else
  echo "⚠️  WARNING: ${INDEX_HTML} no encontrado, generando env-config.js como fallback"
  echo "${ENV_CONFIG_CONTENT}" > "${ENV_CONFIG_FILE}"
  echo "✅ Configuración generada en ${ENV_CONFIG_FILE}"
fi
echo "   - API URL: ${VITE_API_URL}"
echo "   - Keycloak URL: ${VITE_KEYCLOAK_URL}"
echo "   - Modules CDN: ${VITE_MODULES_CDN_URL}"

# =============================================================================
# Iniciar Nginx
# =============================================================================
echo "🌐 Iniciando Nginx..."
exec nginx -g 'daemon off;'
