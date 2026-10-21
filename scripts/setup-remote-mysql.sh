#!/bin/bash
# ============================================================
# Stellora — Remote MySQL one-shot setup (server 31.97.233.100)
#
# Prereq: sandbox IPs whitelisted on the server (cPanel → Remote MySQL):
#   47.57.242.119
#   8.212.10.159
#
# Ye script kya karti hai:
#   1) 3306 connectivity check
#   2) Prisma schema deploy (prisma migrate deploy)
#   3) MongoDB Atlas → MySQL data migration (real data, read-only source)
#   4) Backend restart on remote DB + health verify
#
#   bash scripts/setup-remote-mysql.sh
# ============================================================
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-31.97.233.100}"
REMOTE_DB="${REMOTE_DB:-stellora}"
REMOTE_USER="${REMOTE_USER:-Stellora}"
REMOTE_PASS="${REMOTE_PASS:-Stellora}"
MONGO_URI="${MIGRATE_MONGODB_URI:-mongodb+srv://hsscoders_db_user:MMiXXUz6tdVsWaEv@cluster0.tse9ruk.mongodb.net/stellora?retryWrites=true&w=majority&appName=Cluster0}"
DATABASE_URL="mysql://${REMOTE_USER}:${REMOTE_PASS}@${REMOTE_HOST}:3306/${REMOTE_DB}"

echo "[1/5] connectivity check ${REMOTE_HOST}:3306 ..."
node -e "
const net = require('net');
const s = net.connect({host:'${REMOTE_HOST}', port:3306, timeout:8000});
s.on('connect', ()=>{ console.log('3306 OPEN'); process.exit(0); });
s.on('timeout', ()=>{ console.error('TIMEOUT — cPanel → Remote MySQL me ye IPs whitelist karo: 47.57.242.119 , 8.212.10.159'); process.exit(1); });
s.on('error', e=>{ console.error('error:', e.code); process.exit(1); });
" || exit 1

cd "$ROOT/backend"
echo "[2/5] deploying Prisma schema to remote MySQL ..."
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy

echo "[3/5] migrating data MongoDB Atlas → remote MySQL (source read-only) ..."
DATABASE_URL="$DATABASE_URL" MIGRATE_MONGODB_URI="$MONGO_URI" npx tsx src/migrate-mongo-to-mysql.ts

echo "[4/5] switching backend/.env to remote DB (backup: .env.local-backup) ..."
[ -f .env ] && cp .env .env.local-backup
cat > .env <<EOF
DB_HOST="${REMOTE_HOST}"
DB_PORT="3306"
DB_NAME="${REMOTE_DB}"
DB_USER="${REMOTE_USER}"
DB_PASSWORD="${REMOTE_PASS}"
DATABASE_URL="${DATABASE_URL}"

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

echo "[5/5] restarting backend on remote DB ..."
pkill -f "tsx watch src/server.ts" 2>/dev/null || true
sleep 2
cd "$ROOT"
(nohup npm run dev:backend > logs/backend-remote.log 2>&1 &)
sleep 14
curl -s http://127.0.0.1:4000/api/health && echo ""
echo "DONE — backend ab remote MySQL (31.97.233.100/stellora) pe live hai"
