#!/bin/bash
# Boot test backend (isolated DB) + run the address IDOR repro, one call.
set -u
ROOT=/home/z/my-project
cd "$ROOT"

pid=$(ss -tlnp 2>/dev/null | grep ":4100 " | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2)
if [ -n "$pid" ]; then
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
  [ -n "$pgid" ] && [ "$pgid" != "1" ] && kill -9 -"$pgid" 2>/dev/null
  kill -9 "$pid" 2>/dev/null
fi
sleep 1

(
  cd "$ROOT/backend" || exit 1
  set -a; source .env; set +a
  BASE="${MONGODB_URI%%\?*}"; BASE="${BASE%/stellora}"
  export MONGODB_URI="${BASE}/stellora_audit_test?retryWrites=true&w=majority&appName=Cluster0"
  export PORT=4100
  export NODE_ENV=development
  npx tsx src/server.ts
) > /tmp/repro-backend.log 2>&1 &

for i in $(seq 1 30); do
  curl -sf --max-time 2 http://127.0.0.1:4100/api/health >/dev/null 2>&1 && break
  sleep 2
done
echo "backend up"; cd "$ROOT/backend"
npx tsx "$ROOT/scripts/tests/repro-address.ts"
