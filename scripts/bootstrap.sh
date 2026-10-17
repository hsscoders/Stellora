#!/usr/bin/env bash
# ============================================================================
# Stellora — ONE-COMMAND SANDBOX RECOVERY
# ============================================================================
# Sandbox reset hone ke baad (repo clone karne ke baad) bas ye ek command:
#
#   git clone https://github.com/hsscoders/Stellora.git && cd Stellora && bash scripts/bootstrap.sh
#
# Ye script SAB kuch idempotent tarike se restore karta hai:
#   1. Toolchain check/install (node, bun, pm2)
#   2. backend/.env recreate (agar missing hai)
#   3. bun install (workspace deps)
#   4. Production builds (backend + client + admin) — sirf missing ho to
#   5. PM2 start (3 processes: api :4000, web :3000, admin :3001)
#   6. Health checks with retry
#
# Flags:
#   --force-build   Build outputs fresh hone par bhi rebuild karo
#   --no-build      Build skip karo (sirf start)
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FORCE_BUILD=0
NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --force-build) FORCE_BUILD=1 ;;
    --no-build)    NO_BUILD=1 ;;
  esac
done

c_ok()   { printf "\033[32m✔\033[0m %s\n" "$1"; }
c_info() { printf "\033[36m➜\033[0m %s\n" "$1"; }
c_warn() { printf "\033[33m⚠\033[0m %s\n" "$1"; }
c_err()  { printf "\033[31m✖\033[0m %s\n" "$1"; }

FAILED=0

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Stellora Bootstrap — $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Repo: $ROOT"
echo "════════════════════════════════════════════════════════"
echo ""

# ---------------------------------------------------------------------------
# 1. TOOLCHAIN
# ---------------------------------------------------------------------------
c_info "[1/6] Toolchain check..."

if ! command -v node >/dev/null 2>&1; then
  c_warn "node missing — installing Node 24 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - >/dev/null 2>&1 \
    && sudo apt-get install -y nodejs >/dev/null 2>&1
  command -v node >/dev/null 2>&1 || { c_err "node install FAILED"; FAILED=1; }
fi
c_ok "node $(node -v 2>/dev/null || echo MISSING)"

if ! command -v bun >/dev/null 2>&1; then
  c_warn "bun missing — installing..."
  curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
command -v bun >/dev/null 2>&1 && c_ok "bun $(bun -v)" || { c_err "bun install FAILED"; FAILED=1; }

if ! command -v pm2 >/dev/null 2>&1; then
  c_warn "pm2 missing — installing globally..."
  npm i -g pm2 >/dev/null 2>&1
fi
command -v pm2 >/dev/null 2>&1 && c_ok "pm2 $(pm2 -v 2>/dev/null | head -c 6)" || { c_err "pm2 install FAILED"; FAILED=1; }

[ "$FAILED" -eq 1 ] && { c_err "Toolchain setup fail — abort."; exit 1; }
echo ""

# ---------------------------------------------------------------------------
# 2. ENV FILE
# ---------------------------------------------------------------------------
c_info "[2/6] Environment check..."
if [ -f backend/.env ]; then
  c_ok "backend/.env exists"
else
  cat > backend/.env <<'ENVEOF'
MONGODB_URI="mongodb+srv://hsscoders_db_user:MMiXXUz6tdVsWaEv@cluster0.tse9ruk.mongodb.net/stellora?retryWrites=true&w=majority&appName=Cluster0"
PORT=4000
APP_URL="http://localhost:3000"
ORIGIN_SUFFIXES=".space-z.ai,.z.ai"
ADMIN_BOOTSTRAP_EMAIL="demo@gmail.com"
ADMIN_BOOTSTRAP_PASSWORD="123456"
DEMO_CUSTOMER_EMAIL="customer@stellora.local"
DEMO_CUSTOMER_PASSWORD="customer123"
PAYMENTS_ENABLED="false"
PAYMENT_DEMO_SECRET="stellora_demo_secret_2026"
UPLOAD_MAX_MB="5"
ENVEOF
  c_ok "backend/.env recreated"
fi
echo ""

# ---------------------------------------------------------------------------
# 3. DEPENDENCIES
# ---------------------------------------------------------------------------
c_info "[3/6] Dependencies..."
if [ -d node_modules ] && [ -f bun.lock ]; then
  c_ok "node_modules present (bun install skip)"
else
  c_info "bun install chal raha hai (1-2 min)..."
  bun install >/tmp/stellora-install.log 2>&1 \
    && c_ok "$(grep -oE '[0-9]+ packages installed' /tmp/stellora-install.log | tail -1)" \
    || { c_err "bun install FAILED — /tmp/stellora-install.log dekho"; exit 1; }
fi
echo ""

# ---------------------------------------------------------------------------
# 4. BUILDS
# ---------------------------------------------------------------------------
c_info "[4/6] Production builds..."
build_if_needed() {
  local dir="$1" name="$2" marker="$3"
  if [ "$NO_BUILD" -eq 1 ]; then c_info "$name build skipped (--no-build)"; return 0; fi
  if [ "$FORCE_BUILD" -eq 0 ] && [ -e "$dir/$marker" ]; then
    c_ok "$name build exists (skip — --force-build for fresh)"
    return 0
  fi
  c_info "$name building... (2-4 min)"
  ( cd "$dir" && bun run build ) >/tmp/stellora-build-$name.log 2>&1 \
    && c_ok "$name build done" \
    || { c_err "$name build FAILED — /tmp/stellora-build-$name.log dekho"; FAILED=1; }
}

build_if_needed "frontend/client" "client" ".next/BUILD_ID"
build_if_needed "frontend/admin"  "admin"  ".next/BUILD_ID"
[ "$FAILED" -eq 1 ] && exit 1
echo ""

# ---------------------------------------------------------------------------
# 5. PM2 START (+ WATCHDOG)
# ---------------------------------------------------------------------------
c_info "[5/6] PM2 start..."
pm2 ping >/dev/null 2>&1 || pm2 resurrect >/dev/null 2>&1
if pm2 jlist 2>/dev/null | grep -q '"stellora-api"'; then
  pm2 restart ecosystem.config.js >/dev/null 2>&1
  c_ok "PM2 processes restarted"
else
  pm2 start ecosystem.config.js >/dev/null 2>&1
  c_ok "PM2 processes started"
fi

# Self-healing watchdog (har 5 min health check, auto-restart)
if pm2 jlist 2>/dev/null | grep -q '"stellora-watchdog"'; then
  pm2 restart stellora-watchdog >/dev/null 2>&1
  c_ok "Watchdog restarted"
else
  pm2 start ecosystem.watchdog.js >/dev/null 2>&1 \
    && c_ok "Watchdog started (har 5 min auto-heal)" \
    || c_warn "Watchdog start skip hua (non-fatal)"
fi
pm2 save >/dev/null 2>&1
c_ok "PM2 process list saved (resurrect ke liye)"
echo ""

# ---------------------------------------------------------------------------
# 6. HEALTH CHECKS
# ---------------------------------------------------------------------------
c_info "[6/6] Health checks (15s warmup)..."
sleep 15

check() {
  local name="$1" url="$2" expect="$3"
  local got code
  for i in 1 2 3 4 5 6; do
    got=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)
    if [[ "$expect" == *"$got"* ]]; then c_ok "$name → $got"; return 0; fi
    sleep 5
  done
  c_err "$name → $got (expected $expect)"; FAILED=1
}

check "API    :4000 /api/health"  "http://localhost:4000/api/health"  "200"
check "WEB    :3000 /"            "http://localhost:3000/"            "200"
check "ADMIN  :3001 /admin-console" "http://localhost:3001/admin-console" "307 308 200"

# Auth roundtrip: login → POS access with cookie
if curl -s -c /tmp/stellora-hc.jar -X POST http://localhost:4000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"demo@gmail.com","password":"123456"}' | grep -q '"ok":true'; then
  c_ok "AUTH   demo@gmail.com login OK"
  got=$(curl -s -b /tmp/stellora-hc.jar -o /dev/null -w "%{http_code}" http://localhost:3001/admin-console/admin/pos)
  if [ "$got" = "200" ]; then c_ok "POS    /admin/pos authenticated → 200"; else c_err "POS authenticated → $got (expected 200)"; FAILED=1; fi
  rm -f /tmp/stellora-hc.jar
else
  c_err "AUTH login FAILED — backend/DB check karo (pm2 logs stellora-api)"
  FAILED=1
fi
echo ""

echo "════════════════════════════════════════════════════════"
if [ "$FAILED" -eq 0 ]; then
  echo "  ✔ STELLORA FULLY RESTORED — sab systems operational"
else
  echo "  ⚠ Kuch checks fail hue — logs dekho:"
  echo "      pm2 logs stellora-api --lines 50"
  echo "      pm2 logs stellora-web --lines 50"
  echo "      pm2 logs stellora-admin --lines 50"
fi
echo "════════════════════════════════════════════════════════"
echo "  Storefront : http://localhost:3000"
echo "  Admin POS  : http://localhost:3001/admin-console/admin/pos"
echo "  Admin via proxy : http://localhost:3000/admin-console/admin/pos"
echo "  API        : http://localhost:4000/api/health"
echo "  Login      : demo@gmail.com / 123456"
echo "  Watchdog   : pm2 logs stellora-watchdog"
echo "════════════════════════════════════════════════════════"
echo ""

pm2 ls
[ "$FAILED" -eq 0 ] || exit 1
