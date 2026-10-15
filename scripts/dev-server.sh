#!/bin/bash
# Stellora dev server launcher — used by the workspace root's `bun run dev`.
# Starts MariaDB (user-space) if needed, syncs Prisma schema, then runs Next.js.
set -e
REPO_DIR="/home/z/my-project/stellora-repo"
export DATABASE_URL="mysql://stellora:stellora_dev_pw@127.0.0.1:33061/stellora"
export NODE_ENV="development"

cd "$REPO_DIR"

# 1. Database up (idempotent)
bash scripts/setup-mariadb.sh >/dev/null 2>&1 || true
bash scripts/start-db-fork.sh 2>/dev/null || true
sleep 1

# 2. Install deps if missing
if [ ! -d node_modules ]; then
  bun install
fi

# 3. Ensure Prisma client exists
if [ ! -d node_modules/.prisma/client ] && [ ! -d node_modules/@prisma/client ]; then
  bunx prisma generate >/dev/null 2>&1 || true
fi

# 4. Sync schema to database
bunx prisma db push --skip-generate >/dev/null 2>&1 || true

# 5. Run Next.js dev server on port 3000
exec bunx next dev -p 3000
