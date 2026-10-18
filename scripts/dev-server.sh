#!/usr/bin/env bash
# Stellora — PM2 production launcher (Linux hosts).
# Builds anything that isn't built yet, then starts api + web + admin under PM2.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── Stellora PM2 launcher ──────────────────────────────"

# 1. Install dependencies if missing
if [ ! -d node_modules ]; then
  echo "▸ Installing dependencies…"
  npm install --no-audit --no-fund
fi

# 2. Build backend if needed
if [ ! -f backend/dist/server.js ]; then
  echo "▸ Building backend…"
  npm run build:backend
fi

# 3. Build frontends if needed
if [ ! -d frontend/client/.next ]; then
  echo "▸ Building storefront…"
  npm run build:client
fi
if [ ! -d frontend/admin/.next ]; then
  echo "▸ Building admin console…"
  npm run build:admin
fi

# 4. Backend .env sanity check
if [ ! -f backend/.env ]; then
  echo "✗ backend/.env missing — copy backend/.env.example and set MONGODB_URI first."
  exit 1
fi

mkdir -p logs

# 5. Start / restart under PM2
if command -v pm2 >/dev/null 2>&1; then
  pm2 start ecosystem.config.js
  pm2 status
else
  echo "▸ pm2 not found globally — using npx"
  npx pm2 start ecosystem.config.js
  npx pm2 status
fi

echo ""
echo "✔ Stellora running:"
echo "    Storefront : http://localhost:3000"
echo "    Admin      : http://localhost:3000/admin-console"
echo "    API        : http://localhost:4000/api/health"
echo "  Logs: pm2 logs · Status: pm2 status · Stop: pm2 delete stellora-api stellora-web stellora-admin"
