#!/usr/bin/env bash
# ============================================================
# Stellora — keepalive.sh
#
# KYUN: Sandbox tab reset hota hai jab website/chat idle rehti
# hai. Ye script har KUCH minute me site ke pages + API ko
# khud hit karta rehta hai — matlab website par hamesha kuch
# "hota rehta hai", sandbox idle nahi hota, reset nahi hota.
#
# BONUS: agar koi service gir gayi (crash) to start-all.sh se
# khud dubara start kar deta hai.
#
# Chalane ka tareeqa (background, permanent):
#   nohup bash scripts/keepalive.sh > logs/keepalive.out 2>&1 &
#
# Har external URL ping bhi karta hai (preview + Render) —
# URL list scripts/keepalive-urls.txt me daal do.
# ============================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/logs"
URLS_FILE="$(dirname "${BASH_SOURCE[0]}")/keepalive-urls.txt"
mkdir -p "$LOGS"

INTERVAL="${KEEPALIVE_INTERVAL:-240}"   # seconds (default 4 min)
LOCAL_FAILS=0
MAX_FAILS=2                              # itni baar fail ho to restart

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

ping_url() {
  # $1 = URL, sirf status code ke liye HEAD-ish GET, 15s timeout
  curl -s -o /dev/null -w "%{http_code}" --max-time 15 -L "$1" 2>/dev/null || echo "000"
}

log "keepalive started (pid $$, interval ${INTERVAL}s)"

while true; do
  CYCLE_OK=1

  # ---------- 1) Local services ----------
  HEALTH="$(ping_url http://127.0.0.1:4000/api/health)"
  if [ "$HEALTH" = "200" ]; then
    LOCAL_FAILS=0
  else
    LOCAL_FAILS=$((LOCAL_FAILS + 1))
    CYCLE_OK=0
    log "WARN: backend health=$HEALTH (fail $LOCAL_FAILS/$MAX_FAILS)"
    if [ "$LOCAL_FAILS" -ge "$MAX_FAILS" ]; then
      log "ACTION: services dubara start kar raha hoon (start-all.sh)"
      bash "$ROOT/scripts/start-all.sh" >> "$LOGS/keepalive.log" 2>&1 \
        || bash "$(dirname "${BASH_SOURCE[0]}")/start-all.sh" >> "$LOGS/keepalive.log" 2>&1
      LOCAL_FAILS=0
    fi
  fi

  # Website pages hit karo — real "usage" activity
  for page in "/" "/shop" "/cart"; do
    CODE="$(ping_url "http://127.0.0.1:3000$page")"
    [ "$CODE" != "200" ] && { CYCLE_OK=0; log "WARN: storefront $page -> $CODE"; }
  done
  ACODE="$(ping_url "http://127.0.0.1:3000/admin-console/admin")"
  case "$ACODE" in 200|301|302|307|308) : ;; *) CYCLE_OK=0; log "WARN: admin-console -> $ACODE";; esac

  # ---------- 2) External URLs (preview / Render etc.) ----------
  if [ -f "$URLS_FILE" ]; then
    while IFS= read -r url; do
      url="$(echo "$url" | tr -d '[:space:]')"
      case "$url" in ""|\#*) continue ;; esac
      CODE="$(ping_url "$url")"
      log "ext: $url -> $CODE"
      case "$CODE" in 200|301|302|303|307|308) : ;; *) CYCLE_OK=0 ;; esac
    done < "$URLS_FILE"
  fi

  [ "$CYCLE_OK" = "1" ] && log "cycle OK — sab zinda hai"
  sleep "$INTERVAL"
done
