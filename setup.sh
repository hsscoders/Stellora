#!/usr/bin/env bash
# =============================================================================
# Stellora — one-command setup for ANY machine (macOS / Linux / WSL / VPS)
#
#   bash setup.sh              → interactive guided setup
#   MONGODB_URI="..." bash setup.sh --yes   → fully non-interactive
#
# What it does:
#   1. Checks Node.js 20.9+
#   2. Installs all workspace dependencies
#   3. Writes backend/.env (asks for your MongoDB Atlas URI if not provided)
#   4. Seeds the database (idempotent — safe to re-run)
#   5. Offers: dev mode / production build+start / PM2 / Docker
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
YES="${2:-}"

say()  { echo "${BOLD}$*${RESET}"; }
ok()   { echo "${GREEN}✔${RESET} $*"; }
warn() { echo "${YELLOW}▸${RESET} $*"; }
die()  { echo "${RED}✗ $*${RESET}"; exit 1; }

# ─── 1. Node check ───────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 20.9+ from https://nodejs.org"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]')
[ "$NODE_MAJOR" -gt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -ge 9 ]; } \
  || die "Node $(node -v) is too old. Need 20.9+. Use nvm: nvm install 22"
ok "Node $(node -v)"

# ─── 2. Dependencies ─────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  say "▸ Installing dependencies (all 3 apps)…"
  npm install --no-audit --no-fund || npm install --no-audit --no-fund --force
fi
ok "Dependencies installed"

# ─── 3. backend/.env ─────────────────────────────────────────────────────────
if [ ! -f backend/.env ]; then
  if [ -n "${MONGODB_URI:-}" ]; then
    URI="$MONGODB_URI"
  elif [ "$YES" = "--yes" ]; then
    die "MONGODB_URI env var required in non-interactive mode"
  else
    echo ""
    say "MongoDB connection"
    echo "  1) MongoDB Atlas (free tier works — https://cloud.mongodb.com)"
    echo "  2) Local MongoDB (mongodb://127.0.0.1:27017/stellora)"
    printf "Choice [1]: "; read -r CH
    if [ "${CH:-1}" = "2" ]; then
      URI="mongodb://127.0.0.1:27017/stellora"
    else
      printf "Paste your Atlas URI: "; read -r URI
      [ -n "$URI" ] || die "URI required"
    fi
  fi
  {
    echo "MONGODB_URI=\"$URI\""
    echo "PORT=4000"
    echo "APP_URL=\"http://localhost:3000\""
    echo "ORIGIN_SUFFIXES=\".space-z.ai,.z.ai,.localhost,localhost\""
    echo "ADMIN_BOOTSTRAP_EMAIL=\"admin@stellora.local\""
    echo "ADMIN_BOOTSTRAP_PASSWORD=\"StelloraAdmin#2026\""
    echo "DEMO_CUSTOMER_EMAIL=\"customer@stellora.local\""
    echo "DEMO_CUSTOMER_PASSWORD=\"Customer#2026\""
    echo "PAYMENTS_ENABLED=\"false\""
    echo "PAYMENT_DEMO_SECRET=\"stellora_demo_secret_2026\""
    echo "UPLOAD_MAX_MB=\"5\""
  } > backend/.env
  ok "backend/.env created"
else
  ok "backend/.env already exists (kept)"
fi

# ─── 4. Seed ─────────────────────────────────────────────────────────────────
say "▸ Seeding database (skips existing data)…"
( cd backend && set -a && . ./.env && set +a && npx tsx src/seed.ts ) && ok "Database seeded" || warn "Seed failed — check MONGODB_URI / Atlas IP allowlist (Network Access → add 0.0.0.0/0 for cloud hosts)"

# ─── 5. Run mode ─────────────────────────────────────────────────────────────
MODE="${3:-}"
if [ -z "$MODE" ] && [ "$YES" != "--yes" ]; then
  echo ""
  say "How do you want to run Stellora?"
  echo "  1) ${BOLD}dev${RESET}      — hot-reload development (3 terminals worth of logs in one)"
  echo "  2) ${BOLD}prod${RESET}     — production build + start (recommended for real use)"
  echo "  3) ${BOLD}pm2${RESET}      — production under PM2 (auto-restart, VPS-friendly)"
  echo "  4) ${BOLD}docker${RESET}   — build containers & run the full stack (needs Docker)"
  printf "Choice [2]: "; read -r CH
  MODE="${CH:-2}"
fi
MODE="${MODE:-2}"

case "$MODE" in
  1|dev)
    say "▸ Starting dev stack (storefront :3000 · admin :3001 · api :4000)…"
    npm run dev ;;
  2|prod)
    say "▸ Building everything…"
    npm run build:backend
    npm run build
    say "▸ Starting production stack…"
    npm start ;;
  3|pm2)
    say "▸ Starting under PM2…"
    bash scripts/dev-server.sh ;;
  4|docker)
    command -v docker >/dev/null 2>&1 || die "Docker not installed — https://docs.docker.com/get-docker/"
    [ -f .env ] || cp .env.example .env
    say "▸ Building & starting containers…"
    if grep -q "mongodb://mongo:27017" .env 2>/dev/null || [ -z "${MONGODB_URI:-}" ]; then
      docker compose up -d --build
    else
      docker compose up -d --build --scale mongo=0
    fi
    ok "Stack up → http://localhost:3000 (admin: /admin-console)" ;;
  *) die "Unknown mode: $MODE" ;;
esac

echo ""
ok "Done. Storefront: http://localhost:3000 · Admin: http://localhost:3000/admin-console"
echo "${DIM}   Admin login: admin@stellora.local / StelloraAdmin#2026  (change it in production!)${RESET}"
