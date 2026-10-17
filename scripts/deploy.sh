#!/usr/bin/env bash
# ============================================================================
# Stellora — cPanel Deploy Engine (called by .cpanel.yml)
# ============================================================================
# "Deploy HEAD Commit" button ise chalata hai. Do modes:
#
#   bash scripts/deploy.sh            (parent — turant return karta hai,
#                                      worker ko background me spawn karta hai
#                                      taaki cPanel UI timeout na ho)
#   bash scripts/deploy.sh --worker   (asli kaam: tools check -> bun install
#                                      -> client build -> admin build
#                                      -> pm2 restart all -> health check)
#
# Poori output log hoti hai:  ~/deploy.log
# Live progress:              tail -f ~/deploy.log
#
# NOTE: Ye script sirf UPDATES ke liye hai. Pehli baar server setup ke liye
#       scripts/bootstrap.sh chalao (.env, toolchain, PM2 start sab wo karta hai).
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$HOME/deploy.log"

# cPanel deploy shell me bun/nvm-node/pm2 PATH me nahi hote — khud add karo.
setup_path() {
  export PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/npm-global/bin:$PATH"
  if [ -d "$HOME/.nvm/versions/node" ]; then
    NODE_DIR="$(ls -1d "$HOME"/.nvm/versions/node/* 2>/dev/null | sort -V | tail -1)"
    [ -n "${NODE_DIR:-}" ] && export PATH="$NODE_DIR/bin:$PATH"
  fi
}

run_worker() {
  echo "════════════════════════════════════════════════"
  echo " Stellora deploy started : $(date '+%Y-%m-%d %H:%M:%S')"
  echo " Repo                    : $ROOT"
  echo " Deploying commit        : $(git -C "$ROOT" log -1 --oneline 2>/dev/null || echo 'unknown')"
  echo "════════════════════════════════════════════════"

  # [1/6] Tools -------------------------------------------------------------
  echo "[1/6] Tools check..."
  TOOLS_OK=1
  command -v node >/dev/null 2>&1 && echo "  node : $(node -v 2>/dev/null)" || { echo "  FAIL: node missing"; TOOLS_OK=0; }
  command -v bun  >/dev/null 2>&1 && echo "  bun  : $(bun -v 2>/dev/null)"  || { echo "  FAIL: bun missing";  TOOLS_OK=0; }
  command -v pm2  >/dev/null 2>&1 && echo "  pm2  : $(pm2 -v 2>/dev/null)"  || { echo "  FAIL: pm2 missing";  TOOLS_OK=0; }
  if [ "$TOOLS_OK" != "1" ]; then
    echo ""
    echo "✖ Tools missing. Pehli baar setup terminal se karo:"
    echo "    bash $ROOT/scripts/bootstrap.sh"
    echo "  (ya nvm se node + bun.sh se bun + npm se pm2 install karo)"
    exit 1
  fi

  # [2/6] Install -----------------------------------------------------------
  echo "[2/6] bun install (workspace deps)..."
  if bun install; then
    echo "  install OK"
  else
    echo "  WARN: install fail hua — purane node_modules ke saath aage badh rahe"
  fi

  # [3/6] Storefront build --------------------------------------------------
  echo "[3/6] Storefront build (frontend/client)..."
  if (cd "$ROOT/frontend/client" && bun run build); then
    echo "  client build OK"
  else
    echo "✖ FAIL: client build. Shared hosting me RAM kam ho to terminal me"
    echo "  ek-ek build karo:  cd frontend/client && bun run build"
    exit 1
  fi

  # [4/6] Admin build -------------------------------------------------------
  echo "[4/6] Admin build (frontend/admin)..."
  if (cd "$ROOT/frontend/admin" && bun run build); then
    echo "  admin build OK"
  else
    echo "✖ FAIL: admin build. Terminal me: cd frontend/admin && bun run build"
    exit 1
  fi

  # [5/6] PM2 restart -------------------------------------------------------
  echo "[5/6] PM2 restart (all processes naye code pe)..."
  if pm2 restart all 2>/dev/null; then
    echo "  pm2 restart all OK"
  elif pm2 start "$ROOT/ecosystem.config.js"; then
    echo "  pm2 processes nahi the — ecosystem se start kar diye"
  else
    echo "✖ FAIL: pm2 restart/start. Terminal me: pm2 status  (aur bootstrap.sh chalao)"
    exit 1
  fi

  # [6/6] Health ------------------------------------------------------------
  echo "[6/6] Health check (3 sec wait)..."
  sleep 3
  WEB="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || echo 000)"
  API="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/health || echo 000)"
  echo "  storefront :3000  -> $WEB  (expect 200)"
  echo "  backend    :4000  -> $API  (expect 200)"
  echo ""
  echo "════════════════════════════════════════════════"
  echo " Stellora deploy DONE : $(date '+%Y-%m-%d %H:%M:%S')"
  echo " Site kholo + hard refresh (Ctrl+Shift+R)"
  echo "════════════════════════════════════════════════"
  exit 0
}

# --- Mode routing -----------------------------------------------------------
if [ "${1:-}" = "--worker" ]; then
  setup_path
  run_worker >"$LOG" 2>&1
  exit $?
fi

# Parent mode: detached worker spawn karo, turant return (cPanel-safe).
setup_path
: > "$LOG"
if command -v setsid >/dev/null 2>&1; then
  setsid bash "$ROOT/scripts/deploy.sh" --worker </dev/null >/dev/null 2>&1 &
else
  nohup bash "$ROOT/scripts/deploy.sh" --worker </dev/null >/dev/null 2>&1 &
fi
echo "Stellora deploy BACKGROUND me start ho gaya (PID $!)."
echo "Asli build+restart 3-5 min me poora hoga."
echo "Progress:  tail -f $LOG   (ya cPanel File Manager me home folder ka deploy.log)"
