#!/bin/bash
# Script para encontrar qué usuario de DB se está usando realmente

echo "🔍 Analizando conexión de base de datos..."

# Ver URL completa (ocultando contraseña)
URL=$(sudo k3s kubectl -n nekazari get secret postgresql-secret -o jsonpath='{.data.postgres-url}' | base64 -d)
echo "URL completa (oculta): $(echo "$URL" | sed 's/:[^@]*@/:***@/')"
echo ""

# Intentar extraer usuario de diferentes formatos
if [[ "$URL" == postgresql://* ]]; then
    # Formato: postgresql://user:pass@host/db
    USER1=$(echo "$URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
    echo "Usuario extraído (formato 1): '$USER1'"
fi

if [[ "$URL" == *user=* ]]; then
    # Formato: postgresql://host/db?user=xxx
    USER2=$(echo "$URL" | grep -oP "user=\K[^&]*" || echo "no_encontrado")
    echo "Usuario extraído (formato 2): '$USER2'"
fi

# Ver variables de entorno del pod tenant-webhook
echo ""
echo "📋 Variables de entorno del pod tenant-webhook:"
WEBHOOK_POD=$(sudo k3s kubectl -n nekazari get pods -l app=tenant-webhook -o jsonpath='{.items[0].metadata.name}')
sudo k3s kubectl -n nekazari exec "$WEBHOOK_POD" -- env | grep -i postgres || echo "No hay variables POSTGRES*"

# Probar conexión como diferentes usuarios
echo ""
echo "🧪 Probando conexión desde PostgreSQL..."
PG_POD=$(sudo k3s kubectl -n nekazari get pods -l app=postgresql -o jsonpath='{.items[0].metadata.name}')

echo ""
echo "👥 Usuarios existentes en PostgreSQL:"
sudo k3s kubectl exec -i -n nekazari "$PG_POD" -- psql -U postgres -d nekazari <<'EOF'
SELECT usename, usecreatedb, usesuper 
FROM pg_user 
ORDER BY usename;
EOF

echo ""
echo "💡 El problema puede ser:"
echo "1. La URL no especifica usuario, usa el usuario por defecto del sistema"
echo "2. El usuario no existe en PostgreSQL"
echo "3. Necesitamos ver qué usuario se usa realmente al conectar"

