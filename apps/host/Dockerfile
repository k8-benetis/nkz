# =============================================================================
# Nekazari Host - Dockerfile Multistage para Monorepo
# =============================================================================
# Este Dockerfile debe ejecutarse desde la raíz del repositorio:
#   docker build -f apps/host/Dockerfile -t nekazari/host:latest .
#
# Contexto: La raíz del monorepo (para acceder a packages/ y pnpm-workspace.yaml)
#
# Features:
#   - Multistage build optimizado para caché de layers
#   - Runtime config via entrypoint.sh (no rebuild para cambiar URLs)
#   - Nginx optimizado para SPA con gzip
# =============================================================================

# Stage 1: Build dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Instalar pnpm globalmente
RUN npm install -g pnpm@10

# Copiar archivos de configuración del workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copiar package.json de cada workspace
COPY apps/host/package.json ./apps/host/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/ui-kit/package.json ./packages/ui-kit/

# Instalar dependencias con shamefully-hoist para que todas las deps estén accesibles
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Stage 2: Build packages (SDK y UI-Kit primero)
FROM node:20-alpine AS build-packages
WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm@10

# Copiar node_modules y archivos de configuración
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/host/node_modules ./apps/host/node_modules
COPY --from=deps /app/packages/sdk/node_modules ./packages/sdk/node_modules
COPY --from=deps /app/packages/ui-kit/node_modules ./packages/ui-kit/node_modules
COPY --from=deps /app/package.json ./
COPY --from=deps /app/pnpm-lock.yaml ./
COPY --from=deps /app/pnpm-workspace.yaml ./
COPY --from=deps /app/turbo.json ./

# Copiar código fuente de packages
COPY packages/sdk ./packages/sdk
COPY packages/ui-kit ./packages/ui-kit

# Instalar tsup globalmente para los builds
RUN npm install -g tsup

# Build packages (SDK y UI-Kit)
RUN pnpm --filter @nekazari/sdk build
RUN pnpm --filter @nekazari/ui-kit build

# Stage 3: Build host application
FROM node:20-alpine AS build-host
WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm@10

# Copiar node_modules y configuración
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=deps /app/pnpm-lock.yaml ./
COPY --from=deps /app/pnpm-workspace.yaml ./
COPY --from=deps /app/turbo.json ./

# Copiar packages construidos
COPY --from=build-packages /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=build-packages /app/packages/sdk/package.json ./packages/sdk/
COPY --from=build-packages /app/packages/ui-kit/dist ./packages/ui-kit/dist
COPY --from=build-packages /app/packages/ui-kit/package.json ./packages/ui-kit/

# Copiar código fuente del host
COPY apps/host ./apps/host

# Build host application
WORKDIR /app/apps/host
RUN pnpm build

# Stage 4: Production con Nginx + Runtime Config
FROM nginx:1.25-alpine AS production

# Instalar herramientas necesarias para el entrypoint
RUN apk add --no-cache bash

# Copiar archivos estáticos del build
COPY --from=build-host /app/apps/host/dist /usr/share/nginx/html

# Copiar script de entrypoint para runtime config
COPY apps/host/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copiar configuración de Nginx para SPA
COPY apps/host/nginx.conf /etc/nginx/conf.d/default.conf

# Exponer puerto
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Usar entrypoint para generar config en runtime
ENTRYPOINT ["/entrypoint.sh"]
