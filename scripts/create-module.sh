#!/bin/bash
# NKZ Module Generator (Standardized Scaffold)
# Usage: ./scripts/create-module.sh <module-name>

MODULE_NAME=$1

if [ -z "$MODULE_NAME" ]; then
    echo "❌ Error: Debes especificar el nombre del módulo."
    echo "   Uso: ./scripts/create-module.sh nombre-del-modulo"
    exit 1
fi

TARGET_DIR="modules/nekazari-module-$MODULE_NAME"

# Check if module already exists (prevent overwrite)
if [ -d "$TARGET_DIR" ]; then
    echo "❌ Error: El directorio '$TARGET_DIR' ya existe."
    exit 1
fi

echo "🚀 Creando módulo estándar NKZ en: $TARGET_DIR"

# 1. Directory Structure
mkdir -p "$TARGET_DIR"/{frontend,backend,specs,i18n,k8s}
mkdir -p "$TARGET_DIR"/frontend/{src,public}
mkdir -p "$TARGET_DIR"/backend/{app,tests}

# 2. Manifest (Contract Compliance)
cat <<EOF > "$TARGET_DIR/manifest.json"
{
  "id": "nkz-$MODULE_NAME",
  "version": "0.1.0",
  "name": "Nekazari $(echo $MODULE_NAME | tr '[:lower:]' '[:upper:]' | cut -c1)$(echo $MODULE_NAME | cut -c2-)",
  "author": "Nekazari Team",
  "entryPoint": "/$MODULE_NAME",
  "icon": "default.svg",
  "requiredScopes": ["user"]
}
EOF

# 3. Data Model Spec (Contract Compliance)
cat <<EOF > "$TARGET_DIR/specs/datamodel.json"
{
  "type": "EntityModel",
  "description": "Modelado de datos para $MODULE_NAME",
  "context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "entities": []
}
EOF

# 4. i18n Boilerplate (Contract Compliance)
cat <<EOF > "$TARGET_DIR/i18n/es.json"
{
  "module": {
    "title": "Módulo $MODULE_NAME",
    "description": "Descripción del módulo $MODULE_NAME"
  }
}
EOF

cat <<EOF > "$TARGET_DIR/i18n/en.json"
{
  "module": {
    "title": "$MODULE_NAME Module",
    "description": "Description of $MODULE_NAME module"
  }
}
EOF

# 5. Dockerfiles (Deployment Ready)
# Backend
cat <<EOF > "$TARGET_DIR/backend/Dockerfile"
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF

# Root Frontend Dockerfile (Standard Pattern)
cat <<EOF > "$TARGET_DIR/frontend.Dockerfile"
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY manifest.json /usr/share/nginx/html/manifest.json
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF

echo "✅ Módulo $MODULE_NAME creado exitosamente."
echo "👉 Siguientes pasos:"
echo "   1. cd $TARGET_DIR"
echo "   2. Definir entidades en specs/datamodel.json"
echo "   3. Iniciar desarrollo en frontend/ y backend/"
