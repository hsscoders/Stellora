#!/bin/bash
# Boot an ISOLATED Stellora test stack (audit testing only):
#   backend :4100 -> MongoDB database "stellora_audit_test" (same Atlas cluster)
#   storefront :3100 (BACKEND_URL -> :4100)
#   admin :3101 (BACKEND_URL -> :4100)
# Safe: the user's live "stellora" DB is never touched by this stack.
set -u
ROOT=/home/z/my-project
LOG=$ROOT/test-stack.log
cd "$ROOT"

for p in 4100 3100 3101; do
  # Kill the whole process GROUP of anything listening on our ports (the
  # group includes tsx-watch / next-dev supervisors, so they cannot respawn).
  pid=$(ss -tlnp 2>/dev/null | grep ":$p " | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2)
  if [ -n "$pid" ]; then
    pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
    [ -n "$pgid" ] && [ "$pgid" != "1" ] && kill -9 -"$pgid" 2>/dev/null
    kill -9 "$pid" 2>/dev/null
  fi
done
rm -f "$ROOT/frontend/client/.next/dev/lock" "$ROOT/frontend/admin/.next/dev/lock"
sleep 2

# Load live URI from backend/.env, then swap the database name
set -a; source "$ROOT/backend/.env"; set +a
DB_BASE="${MONGODB_URI%%\?*}"                    # .../cluster.mongodb.net/stellora
DB_BASE="${DB_BASE%/stellora}"                    # .../cluster.mongodb.net
TEST_URI="${DB_BASE}/stellora_audit_test?retryWrites=true&w=majority&appName=Cluster0"

# 1. Backend with test DB URI on :4100
(
  cd "$ROOT/backend" || exit 1
  set -a; source .env; set +a
  export MONGODB_URI="$TEST_URI"
  export PORT=4100
  export NODE_ENV=development
  # Dedicated webhook secret for the audit suite (env fallback path)
  export PAYMENT_WEBHOOK_SECRET="audit_test_webhook_secret"
  npx tsx src/server.ts
) >> "$LOG" 2>&1 &
BACK_PID=$!
echo "[test-stack] backend :4100 pid=$BACK_PID (db=stellora_audit_test)" >> "$LOG"

# 2. Seed the TEST database (same idempotent seed)
(
  cd "$ROOT/backend" || exit 0
  set -a; source .env; set +a
  export MONGODB_URI="$TEST_URI"
  npx tsx src/seed.ts
) >> "$LOG" 2>&1 &

# 3. Storefront on :3100 pointing at test backend (PRODUCTION start — the
# Next dev-server lock is per project directory, so a second `next dev` for
# the same app is impossible while the main stack runs; `next start` has no
# such lock and exercises the real production build)
if [ ! -f "$ROOT/frontend/client/.next/BUILD_ID" ]; then
  echo "[test-stack] building storefront..." >> "$LOG"
  (cd "$ROOT/frontend/client" && npx next build >> "$LOG" 2>&1)
fi
(
  cd "$ROOT/frontend/client" || exit 1
  BACKEND_URL="http://127.0.0.1:4100" APP_URL="http://localhost:3100" npx next start -p 3100
) >> "$LOG" 2>&1 &
echo "[test-stack] storefront :3100" >> "$LOG"

# 4. Admin on :3101 pointing at test backend
if [ ! -f "$ROOT/frontend/admin/.next/BUILD_ID" ]; then
  echo "[test-stack] building admin..." >> "$LOG"
  (cd "$ROOT/frontend/admin" && npx next build >> "$LOG" 2>&1)
fi
(
  cd "$ROOT/frontend/admin" || exit 1
  BACKEND_URL="http://127.0.0.1:4100" npx next start -p 3101
) >> "$LOG" 2>&1 &
echo "[test-stack] admin :3101" >> "$LOG"

# 5. Health wait
for i in $(seq 1 60); do
  curl -sf --max-time 2 http://127.0.0.1:4100/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -s --max-time 5 http://127.0.0.1:4100/api/health; echo
echo "[test-stack] ready" >> "$LOG"

# Park
wait
