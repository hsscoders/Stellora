#!/usr/bin/env bash
# ============================================================================
# Stellora Watchdog — PM2 crash auto-recovery
# ============================================================================
# Cron se har 5 minute chalta hai. Agar koi Stellora process down hai ya PM2
# daemon hi mar gaya, to automatically restore karta hai.
#
# Note: Full sandbox (VM) reset se kuch nahi bachta — uske liye bootstrap.sh.
# Ye watchdog sirf in-process crashes / PM2 daemon death handle karta hai.
#
# Ye watchdog PM2 ke andar hi ek process ke roop mein chalta hai
# (ecosystem.watchdog.js) — PM2 khud isko crash hone par restart karta hai.
#
# Modes:
#   scripts/watchdog.sh            → single check (ek baar, exit)
#   scripts/watchdog.sh --daemon   → hamesha chalta rehta hai (PM2 process),
#                                    har 5 min baad check repeat karta hai.
# ============================================================================

if [ "${1:-}" = "--daemon" ]; then
  # Daemon loop mode — PM2 ke under chalne ke liye
  while true; do
    "$0" --single || true
    sleep 300
  done
  exit 0
fi

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
LOCK="/tmp/stellora-watchdog.lock"
LOG="/tmp/stellora-watchdog.log"

# Concurrent run skip (previous run abhi chal raha ho)
[ -f "$LOCK" ] && {
  age=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  [ "$age" -lt 240 ] && exit 0
}
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

log() { echo "[$(date '+%m-%d %H:%M:%S')] $1"; }

# PM2 daemon check — agar daemon hi nahi, resurrect karo
if ! pgrep -f "PM2.*God Daemon" >/dev/null 2>&1; then
  log "PM2 daemon down — resurrecting..."
  command -v pm2 >/dev/null 2>&1 || npm i -g pm2 >/dev/null 2>&1
  pm2 resurrect >>"$LOG" 2>&1
  sleep 6
fi

# Har process check karo
RESTORED=0
for proc in stellora-api stellora-web stellora-admin; do
  status=$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try:
  apps={a['name']:a['pm2_env']['status'] for a in json.load(sys.stdin)}
  print(apps.get('$proc','absent'))
except Exception:
  print('unknown')
" 2>/dev/null)

  if [ "$status" != "online" ]; then
    log "$proc status=$status — recovering..."
    # Build missing ho to pehle build karo
    case "$proc" in
      stellora-web)   [ ! -f "$ROOT/frontend/client/.next/BUILD_ID" ] && (cd "$ROOT/frontend/client" && bun run build >/dev/null 2>&1) ;;
      stellora-admin) [ ! -f "$ROOT/frontend/admin/.next/BUILD_ID" ]  && (cd "$ROOT/frontend/admin"  && bun run build >/dev/null 2>&1) ;;
    esac
    if pm2 describe "$proc" >/dev/null 2>&1; then
      pm2 restart "$proc" >>"$LOG" 2>&1
    else
      (cd "$ROOT" && pm2 start ecosystem.config.js --only "$proc" >>"$LOG" 2>&1)
    fi
    RESTORED=1
  fi
done

# .env bhi check karo (kabhi kabhi file system clean hota hai but VM nahi)
if [ ! -f "$ROOT/backend/.env" ]; then
  log "backend/.env missing — recreating..."
  (cd "$ROOT" && bash scripts/bootstrap.sh --no-build >>"$LOG" 2>&1)
  RESTORED=1
fi

if [ "$RESTORED" -eq 1 ]; then
  pm2 save >>"$LOG" 2>&1
  # Health verify
  sleep 8
  api=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:4000/api/health 2>/dev/null)
  web=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000/ 2>/dev/null)
  log "post-recovery: api=$api web=$web"
else
  log "all healthy (api/web/admin online)"
fi
