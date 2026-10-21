#!/bin/bash
# Stellora custom dev script — executed by the sandbox at container boot
# (via /start.sh -> sudo -u z bash .zscripts/dev.sh).
# Starts the full 3-app monorepo:
#   backend API  : 4000  (Express + Mongoose -> MongoDB Atlas)
#   storefront   : 3000  (Next.js 16, public entry, proxies /api + /admin-console)
#   admin console: 3001  (Next.js 16, basePath /admin-console)
# Idempotent: safe to re-run (seed skips existing data).

ROOT=/home/z/my-project
LOG=$ROOT/dev.log
cd "$ROOT" || exit 1

echo "[stellora-dev] $(date '+%F %T') dev.sh starting" >> "$LOG"

# ---------- 1. Dependencies ----------
if [ ! -d "$ROOT/node_modules" ]; then
  echo "[stellora-dev] node_modules missing — installing (npm ci)" >> "$LOG"
  (cd "$ROOT" && npm ci --no-audit --no-fund >> "$LOG" 2>&1) \
    || (cd "$ROOT" && npm install --no-audit --no-fund >> "$LOG" 2>&1)
fi

# ---------- 2. Seed database (idempotent) ----------
(
  cd "$ROOT/backend" || exit 0
  set -a; [ -f .env ] && source .env; set +a
  if [ -n "$MONGODB_URI" ]; then
    echo "[stellora-dev] seeding database (skips existing)..." >> "$LOG"
    timeout 90 npx tsx src/seed.ts >> "$LOG" 2>&1 \
      || echo "[stellora-dev] WARN: seed failed (may already be seeded or DB unreachable)" >> "$LOG"
  else
    echo "[stellora-dev] WARN: MONGODB_URI not set, skipping seed" >> "$LOG"
  fi
)

# ---------- 3. Free ports (in case of stale listeners) ----------
for p in 4000 3000 3001; do
  fuser -k -n tcp "$p" >> "$LOG" 2>&1
done
sleep 2

# ---------- 4. Start services ----------
cd "$ROOT/backend"
npx tsx watch src/server.ts >> "$LOG" 2>&1 &
echo "[stellora-dev] backend starting on :4000 (pid $!)" >> "$LOG"

cd "$ROOT/frontend/client"
npx next dev -p 3000 >> "$LOG" 2>&1 &
echo "[stellora-dev] storefront starting on :3000 (pid $!)" >> "$LOG"

cd "$ROOT/frontend/admin"
npx next dev -p 3001 >> "$LOG" 2>&1 &
echo "[stellora-dev] admin console starting on :3001 (pid $!)" >> "$LOG"

cd "$ROOT"

# ---------- 5. Health wait ----------
ok_api=0; ok_web=0; ok_admin=0
for i in $(seq 1 90); do
  [ $ok_api -eq 0 ]   && curl -sf --max-time 2 http://127.0.0.1:4000/api/health >/dev/null 2>&1    && { ok_api=1;   echo "[stellora-dev] API healthy on :4000" >> "$LOG"; }
  [ $ok_web -eq 0 ]   && curl -sf --max-time 2 http://127.0.0.1:3000/ >/dev/null 2>&1              && { ok_web=1;   echo "[stellora-dev] storefront ready on :3000" >> "$LOG"; }
  [ $ok_admin -eq 0 ] && curl -sf --max-time 2 http://127.0.0.1:3001/admin-console >/dev/null 2>&1 && { ok_admin=1; echo "[stellora-dev] admin ready on :3001" >> "$LOG"; }
  [ $ok_api -eq 1 ] && [ $ok_web -eq 1 ] && [ $ok_admin -eq 1 ] && break
  sleep 2
done
echo "[stellora-dev] $(date '+%F %T') startup status: api=$ok_api web=$ok_web admin=$ok_admin" >> "$LOG"

# ---------- 6. Park ----------
wait
