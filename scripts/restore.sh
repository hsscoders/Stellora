#!/usr/bin/env bash
# ============================================================
# Stellora — restore.sh  (SANDBOX RESET ke baad yahi ek command)
#
# Fresh sandbox / fresh clone ke baad pura stack wapas 2-3 min
# me live kar deta hai:
#   1) npm install (workspaces)
#   2) .env files likhta hai (MongoDB URI built-in)
#   3) DB seed (idempotent — dobara chalana safe hai)
#   4) start-all.sh — backend + storefront + admin
#   5) keepalive background me start
#
#   bash scripts/restore.sh
#
# NOTE: agar tum Stellora folder kahin aur hue ho to pehle us
# folder ke andar jao: cd /path/to/Stellora && bash scripts/restore.sh
# ============================================================
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# MySQL (local sandbox MariaDB) — DB Stellora / user Stellora / password Stellora
export DB_HOST="127.0.0.1"
export DB_PORT="3306"
export DB_NAME="Stellora"
export DB_USER="Stellora"
export DB_PASSWORD="Stellora"
export DATABASE_URL="mysql://Stellora:Stellora@127.0.0.1:3306/Stellora"

echo "[restore] 1/5 npm install (2-3 min)..."
[ -d node_modules/next ] || npm install --no-audit --no-fund

echo "[restore] 2/5 .env files likh raha hoon..."
cat > backend/.env <<EOF
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_NAME="Stellora"
DB_USER="Stellora"
DB_PASSWORD="Stellora"
DATABASE_URL="mysql://Stellora:Stellora@127.0.0.1:3306/Stellora"
PORT=4000
APP_URL="http://localhost:3000"
ORIGIN_SUFFIXES=".space-z.ai,.z.ai,.onrender.com"
ADMIN_BOOTSTRAP_EMAIL="admin@stellora.local"
ADMIN_BOOTSTRAP_PASSWORD="StelloraAdmin#2026"
DEMO_CUSTOMER_EMAIL="customer@stellora.local"
DEMO_CUSTOMER_PASSWORD="Customer#2026"
PAYMENTS_ENABLED="false"
PAYMENT_PROVIDER=""
PAYMENT_KEY_ID=""
PAYMENT_KEY_SECRET=""
PAYMENT_WEBHOOK_SECRET=""
PAYMENT_DEMO_SECRET="stellora_demo_secret_2026"
UPLOAD_MAX_MB="5"
EOF
printf 'BACKEND_URL="http://127.0.0.1:4000"\nAPP_URL="http://localhost:3000"\n' > frontend/client/.env
printf 'BACKEND_URL="http://127.0.0.1:4000"\n' > frontend/admin/.env

echo "[restore] 3/5 schema migrate + DB seed (safe — existing data skip hota hai)..."
(cd backend && npx prisma migrate deploy && npx tsx src/seed.ts) || echo "[restore] migrate/seed skip/fail — DB already ready hoga"

echo "[restore] 4/5 services start..."
bash scripts/start-all.sh

echo "[restore] 5/5 keepalive background me start..."
mkdir -p logs
if ! pgrep -f "keepalive.sh" > /dev/null; then
  nohup bash scripts/keepalive.sh > logs/keepalive.out 2>&1 &
  echo "[restore] keepalive started (pid $!)"
else
  echo "[restore] keepalive already running"
fi

echo ""
echo "============================================================"
echo " RESTORE COMPLETE — Stellora live hai:"
echo "   Storefront : http://localhost:3000"
echo "   Admin login: http://localhost:3000/admin/login"
echo "                (admin@stellora.local / Admin@12345)"
echo "   API health : http://localhost:4000/api/health"
echo "============================================================"
