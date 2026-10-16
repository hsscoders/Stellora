#!/bin/bash
# Stellora full stack via PM2 — backend :4000, admin :3001, storefront :3000
# (auto-restart, unified logs, `pm2 status` / `pm2 logs` for observability)
set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# 1. Install app deps if missing
for app in frontend/client frontend/admin backend; do
  if [ ! -d "$REPO_DIR/$app/node_modules" ]; then
    (cd "$REPO_DIR/$app" && bun install >/dev/null 2>&1)
  fi
done

# 2. Ensure pm2 is available
export PATH="$HOME/.npm-global/bin:$PATH"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 >/dev/null 2>&1
fi

# 3. Start (idempotent — replaces previous instances)
pm2 delete stellora-api stellora-admin stellora-web >/dev/null 2>&1 || true
pm2 start ecosystem.config.js
pm2 status

echo "[stellora] PM2 stack running: storefront :3000, admin :3001, api :4000"
