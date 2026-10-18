# Stellora — Localhost Setup Guide

Complete manual setup for running Stellora locally on Windows.

## URLs (important)

| Service | URL | Port |
|---|---|---|
| Storefront (client) | http://localhost:3000 | 3000 |
| Admin login | http://localhost:3000/admin/login | 3000 |
| Admin console | http://localhost:3000/admin-console/admin | 3000 (proxied to 3001) |
| Backend API | http://localhost:4000/api | 4000 |

> **Note:** Admin app runs internally on port 3001, but the client app proxies
> `/admin-console/*` to it. Always open admin via **port 3000** — going to
> `localhost:3001/admin/login` directly will 404 (that page only exists on the
> storefront app).

## One-time setup (first time)

### 1. Create `backend/.env`

Copy `backend/.env.example` to `backend/.env` and fill in:

```env
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/stellora?retryWrites=true&w=majority"
PORT=4000
APP_URL="http://localhost:3000"

ADMIN_BOOTSTRAP_EMAIL="admin@stellora.local"
ADMIN_BOOTSTRAP_PASSWORD="Admin@12345"
DEMO_CUSTOMER_EMAIL="customer@stellora.local"
DEMO_CUSTOMER_PASSWORD="Customer@12345"

PAYMENT_DEMO_SECRET="stellora_demo_secret_2026"
```

Leave the payment provider fields empty for local dev (built-in DEMO gateway
works out of the box). See `.env.example` for all options.

### 2. Install dependencies (4 folders)

```bash
npm install                          # D:\Desktop\Stellora (root)
cd backend && npm install
cd frontend\client && npm install
cd frontend\admin && npm install
```

### 3. Seed the database

The seed script does **not** load `.env` by itself, so pass the URI inline:

**CMD:**
```bat
cd backend
set MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/stellora?retryWrites=true^&w=majority
npx tsx src/seed.ts
```

**PowerShell:**
```powershell
cd backend
$env:MONGODB_URI = "mongodb+srv://<user>:<password>@<cluster>.mongodb.net/stellora?retryWrites=true&w=majority"
npx tsx src/seed.ts
```

**Git Bash:**
```bash
cd backend
set -a && source .env && set +a
npx tsx src/seed.ts
```

Seed creates: admin user, demo customer, 4 categories, 16 products,
shipping rate, 2 coupons, banners, site settings. Products are skipped if
they already exist, so re-running is safe.

## Daily start (3 terminals, in this order)

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev          # http://localhost:4000 (loads .env automatically)
```

**Terminal 2 — Storefront:**
```bash
cd frontend\client
npm run dev          # http://localhost:3000
```

**Terminal 3 — Admin app:**
```bash
cd frontend\admin
npm run dev          # internal, port 3001 — access via localhost:3000/admin-console
```

Start backend first, then the frontends.

## Login credentials

- **Admin:** `admin@stellora.local` + the `ADMIN_BOOTSTRAP_PASSWORD` from `.env`
  (or `StelloraAdmin#2026` if seeded without setting it)
- **Demo customer:** `customer@stellora.local` + `DEMO_CUSTOMER_PASSWORD` from `.env`

Admins sign in ONLY at `http://localhost:3000/admin/login` — never the
storefront customer login.

## Verify it's working

```bash
curl http://localhost:4000/api/health     # {"status":"healthy","database":"connected"}
curl -o NUL -w "%{http_code}" http://localhost:3000   # 200
```

## Troubleshooting

- **`ECONNREFUSED 127.0.0.1:27017`** → seed is not seeing your
  `MONGODB_URI`; pass it inline as shown in step 3.
- **Admin page 404 on port 3001** → expected; use
  `http://localhost:3000/admin-console` instead.
- **Storefront shows no products** → run the seed (step 3).
- **Port already in use** → `npx kill-port 3000 3001 4000` or close the old
  terminal.
- **Atlas connection timeout** → check IP allowlist in MongoDB Atlas
  (Network Access → add current IP), and that the password in the URI is
  URL-encoded if it contains special characters.
- **Never commit `backend/.env`** — it holds real credentials (it is already
  in `.gitignore`).
