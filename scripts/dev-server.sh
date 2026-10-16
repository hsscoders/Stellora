#!/bin/bash
# Stellora monorepo dev launcher — starts the full stack:
#   backend  (Express + Mongoose, MongoDB Atlas)  -> http://127.0.0.1:4000
#   admin    (Next.js, basePath /admin-console)   -> http://127.0.0.1:3001
#   frontend (Next.js customer storefront)        -> http://127.0.0.1:3000
# The frontend proxies /api/* -> backend and /admin-console/* -> admin,
# so a single external origin (port 3000) serves everything.
set -e
REPO_DIR="/home/z/my-project/stellora-repo"

# 1. Backend API (detached)
bash "$REPO_DIR/backend/scripts/start-backend-fork.sh"
sleep 1

# 2. Install frontend/admin deps if missing
for app in frontend admin; do
  if [ ! -d "$REPO_DIR/$app/node_modules" ]; then
    (cd "$REPO_DIR/$app" && bun install >/dev/null 2>&1)
  fi
done

# 3. Admin console (detached)
bash "$REPO_DIR/admin/start-admin-fork.sh"
sleep 1

# 4. Frontend storefront (detached)
bash "$REPO_DIR/frontend/start-frontend-fork.sh"

echo "[stellora] full stack starting: frontend :3000, admin :3001, api :4000"
