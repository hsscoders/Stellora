# Stellora — Localhost Setup Guide (MySQL edition)

Complete manual setup for running Stellora locally.

## Requirements

- Node.js >= 20.9
- MySQL 8+ / MariaDB 10.6+ running locally

## URLs (important)

| Service | URL | Port |
|---|---|---|
| Storefront (client) | http://localhost:3000 | 3000 |
| Admin login | http://localhost:3000/admin/login | 3000 |
| Admin console | http://localhost:3000/admin-console/admin | 3000 (proxied to 3001) |
| Backend API | http://localhost:4000/api | 4000 |

> **Note:** Admin app runs internally on port 3001, but the client app proxies
> `/admin-console/*` to it. Always open admin via **port 3000**.

## One-time setup (first time)

### 1. Create the MySQL database

```sql
CREATE DATABASE Stellora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'Stellora'@'localhost' IDENTIFIED BY 'YourStrongPassword';
GRANT ALL PRIVILEGES ON Stellora.* TO 'Stellora'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Create `backend/.env`

```env
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_NAME="Stellora"
DB_USER="Stellora"
DB_PASSWORD="YourStrongPassword"
PORT=4000
APP_URL="http://localhost:3000"
ORIGIN_SUFFIXES=".space-z.ai,.z.ai,.onrender.com"

ADMIN_BOOTSTRAP_EMAIL="admin@stellora.local"
ADMIN_BOOTSTRAP_PASSWORD="Admin@12345"
DEMO_CUSTOMER_EMAIL="customer@stellora.local"
DEMO_CUSTOMER_PASSWORD="Customer@12345"

PAYMENT_DEMO_SECRET="stellora_demo_secret_2026"
```

(Leave payment provider fields empty — the built-in DEMO gateway works out of the box.)

### 3. Install + schema + data

```bash
npm install                      # repo root (workspaces)
cd backend
npx prisma migrate deploy        # create all tables

# EITHER import existing data from MongoDB (one-time, read-only source):
MIGRATE_MONGODB_URI="mongodb+srv://<user>:<pass>@cluster/stellora?retryWrites=true&w=majority" \
  npx tsx src/migrate-mongo-to-mysql.ts

# OR (fresh dev install only) fictional seed:
npx tsx src/seed.ts
```

## Daily start (3 terminals, in this order)

```bash
npm run dev:backend    # Terminal 1 — API on :4000
npm run dev:frontend   # Terminal 2 — storefront :3000
npm run dev:admin      # Terminal 3 — admin app :3001 (access via :3000/admin-console)
```

## Login credentials

- **Admin:** `admin@stellora.local` + `ADMIN_BOOTSTRAP_PASSWORD` from `.env`
- **Demo customer:** `customer@stellora.local` + `DEMO_CUSTOMER_PASSWORD` from `.env`

Admins sign in ONLY at `http://localhost:3000/admin/login`.

## Verify it's working

```bash
curl http://localhost:4000/api/health     # {"status":"healthy","database":"connected"}
curl -o /dev/null -w "%{http_code}" http://localhost:3000   # 200
```

## Useful prisma commands

```bash
npx prisma migrate deploy      # apply pending migrations (production)
npx prisma migrate dev         # create a new migration from schema changes (dev)
npx prisma studio              # browse data in a GUI
npx tsx src/migrate-mongo-to-mysql.ts --fresh   # re-import Mongo data (truncates MySQL first)
```

## Troubleshooting

- **`P1001: Can't reach database`** → MySQL not running, or wrong `DB_HOST`/`DB_PORT`/`DB_PASSWORD`.
- **`P2021: table does not exist`** → run `npx prisma migrate deploy`.
- **Storefront shows no products** → run the seed or the Mongo→MySQL migration.
- **Port already in use** → `npx kill-port 3000 3001 4000` or close the old terminal.
- **Seed "already exists" messages** → the seed is idempotent; existing rows are skipped.
- **Never commit `backend/.env`** — it holds real credentials (already in `.gitignore`).
