#!/bin/bash
# Stellora full stack via PM2 — backend :4000, admin :3001, storefront :3000
# (auto-restart, unified logs, `pm2 status` / `pm2 logs` for observability)
#
# Works with BOTH install layouts:
#   - npm workspaces (run `npm install` at the repo root)  [recommended]
#   - per-app installs (bun/npm install inside each app)
set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# 1. Install dependencies if missing (npm workspaces preferred, per-app fallback)
if [ ! -d "$REPO_DIR/node_modules" ] && [ ! -d "$REPO_DIR/frontend/client/node_modules" ]; then
  echo "[stellora] Installing dependencies (npm)..."
  npm install --no-audit --no-fund >/dev/null 2>&1
fi
for app in frontend/client frontend/admin backend; do
  if [ ! -d "$REPO_DIR/$app/node_modules" ] && [ ! -d "$REPO_DIR/node_modules" ]; then
    (cd "$REPO_DIR/$app" && (npm install --no-audit --no-fund >/dev/null 2>&1 || bun install >/dev/null 2>&1))
  fi
done

# 2. Ensure pm2 is available
export PATH="$HOME/.npm-global/bin:$PATH"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 >/dev/null 2>&1
fi

# 3. Build frontends if no production build exists yet
if [ ! -d "$REPO_DIR/frontend/client/.next" ]; then
  echo "[stellora] Building storefront (next build)..."
  (cd "$REPO_DIR/frontend/client" && npx --no-install next build)
fi
if [ ! -d "$REPO_DIR/frontend/admin/.next" ]; then
  echo "[stellora] Building admin console (next build)..."
  (cd "$REPO_DIR/frontend/admin" && npx --no-install next build)
fi

# 4. Start (idempotent — replaces previous instances)
pm2 delete stellora-api stellora-admin stellora-web >/dev/null 2>&1 || true
pm2 start ecosystem.config.js
pm2 status

echo "[stellora] PM2 stack running: storefront :3000, admin :3001, api :4000"
