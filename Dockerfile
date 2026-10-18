# syntax=docker/dockerfile:1
# =============================================================================
# Stellora — multi-stage Docker build
#
# Three runtime targets (used by docker-compose):
#   docker build --target api   -t stellora-api   .
#   docker build --target web   -t stellora-web   .
#   docker build --target admin -t stellora-admin .
#
# Requirements: MONGODB_URI env var (Atlas URI or a mongo container —
# see docker-compose.yml which can start one automatically).
# =============================================================================

# ---------- 1. Shared deps (npm workspaces) ----------
FROM node:22-alpine AS deps
WORKDIR /app
# Copy all workspace manifests first for maximal layer caching
COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/client/package.json frontend/client/
COPY frontend/admin/package.json frontend/admin/
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---------- 2. Backend build ----------
FROM deps AS build-backend
COPY backend/ backend/
RUN cd backend && npx tsc -p tsconfig.build.json

# ---------- 3. Storefront build ----------
FROM deps AS build-client
COPY frontend/client/ frontend/client/
ENV NEXT_TELEMETRY_DISABLED=1
# API is reached server-side inside the docker network
ENV BACKEND_URL=http://api:4000
ENV ADMIN_URL=http://admin:3001
RUN npm run build -w @stellora/frontend

# ---------- 4. Admin build ----------
FROM deps AS build-admin
COPY frontend/admin/ frontend/admin/
ENV NEXT_TELEMETRY_DISABLED=1
ENV BACKEND_URL=http://api:4000
RUN npm run build -w @stellora/admin

# ---------- Runtime: backend API ----------
FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json ./backend/
COPY --from=build-backend /app/backend/dist ./backend/dist
# Idempotent first-boot seed with retry (waits for DB to accept connections),
# then start the API server. Seeding skips anything that already exists.
WORKDIR /app/backend
RUN printf '#!/bin/sh\n' \
  'i=0\n' \
  'until node dist/seed.js; do\n' \
  '  i=$((i+1))\n' \
  '  [ "$i" -ge 6 ] && break\n' \
  '  echo "[entrypoint] seed attempt $i failed — retrying in 5s"\n' \
  '  sleep 5\n' \
  'done\n' \
  'exec node dist/server.js\n' > /usr/local/bin/entrypoint.sh \
  && chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# ---------- Runtime: storefront (public entry, proxies /api + /admin-console) ----------
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV BACKEND_URL=http://api:4000
ENV ADMIN_URL=http://admin:3001
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/client/package.json ./frontend/client/
COPY --from=build-client /app/frontend/client/.next ./frontend/client/.next
COPY --from=build-client /app/frontend/client/public ./frontend/client/public
COPY --from=build-client /app/frontend/client/next.config.mjs ./frontend/client/
WORKDIR /app/frontend/client
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]

# ---------- Runtime: admin console ----------
FROM node:22-alpine AS admin
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV BACKEND_URL=http://api:4000
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/admin/package.json ./frontend/admin/
COPY --from=build-admin /app/frontend/admin/.next ./frontend/admin/.next
COPY --from=build-admin /app/frontend/admin/public ./frontend/admin/public
COPY --from=build-admin /app/frontend/admin/next.config.mjs ./frontend/admin/
WORKDIR /app/frontend/admin
EXPOSE 3001
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3001"]
