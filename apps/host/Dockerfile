FROM node:20-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@10 tsup

# Copy workspace configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy ALL packages and apps (since it's a monorepo and UI-kit / SDK depend on it)
COPY packages/ ./packages/
COPY apps/host/ ./apps/host/

# Install everything
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Build SDK and UI-Kit
RUN pnpm --filter @nekazari/sdk build
RUN pnpm --filter @nekazari/ui-kit build

# Build Host
WORKDIR /app/apps/host
RUN pnpm build

FROM nginx:1.25-alpine AS production
RUN apk add --no-cache bash
COPY --from=builder /app/apps/host/dist /usr/share/nginx/html
COPY --from=builder /app/node_modules/cesium/Build/Cesium /usr/share/nginx/html/cesium
COPY apps/host/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
COPY apps/host/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]
