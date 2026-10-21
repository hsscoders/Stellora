#!/usr/bin/env bash
# ============================================================
# Stellora — start-all.sh (idempotent)
# Teeno services start karta hai, jo already chal rahe hain
# unhe skip karta hai. Kabhi bhi dobara chala do — safe hai.
#
#   bash scripts/start-all.sh
# ============================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"
cd "$ROOT"

port_up() { ss -tln 2>/dev/null | grep -qE ":$1[[:space:]]"; }

start_if_down() {
  # $1=port  $2=naam  $3=logfile  $4...=command
  local port="$1" name="$2" log="$3"; shift 3
  if port_up "$port"; then
    echo "[start-all] $name already running on :$port — skip"
    return 0
  fi
  echo "[start-all] starting $name on :$port ..."
  nohup "$@" > "$LOGS/$log" 2>&1 &
  # 60s tak port open hone ka wait
  for _ in $(seq 1 60); do
    port_up "$port" && { echo "[start-all] $name UP (: $port)"; return 0; }
    sleep 1
  done
  echo "[start-all] WARNING: $name 60s me up nahi hua — $LOGS/$log dekho"
  return 1
}

start_if_down 4000 backend  backend.log npm run dev:backend
start_if_down 3000 client   client.log  npm run dev:frontend
start_if_down 3001 admin    admin.log   npm run dev:admin

echo "[start-all] done. storefront :3000 | admin :3001 | api :4000"
