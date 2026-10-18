# Stellora — cPanel Deployment (Luveedu Cloud 3)

Domain: **stellora.voterx.xyz** · Host: cPanel with Git™ Version Control,
Setup Node.js App, and Terminal.

## Architecture (3 Node.js apps)

cPanel's Node.js apps run under Phusion Passenger, and each app gets a
random internal port — apps cannot talk on fixed localhost ports. So each
app gets its own subdomain and they talk over public HTTPS:

```
stellora.voterx.xyz          -> storefront (frontend/client)
api.stellora.voterx.xyz      -> backend API (backend)
admin.stellora.voterx.xyz    -> admin console (frontend/admin)
```

The storefront proxies `/api/*` and `/admin-console/*` internally, so
visitors only ever see `stellora.voterx.xyz`. Admin login lives at
`stellora.voterx.xyz/admin/login` (served by the storefront, same as local).

RAM note: each Next.js production app needs ~300–500 MB. Cloud 3 should
have enough; if apps crash with OOM, build+run only the storefront and
backend, or move to a VPS.

---

## Step 1 — Subdomains banão (cPanel → Domains → Create Subdomain)

- `api.stellora.voterx.xyz`
- `admin.stellora.voterx.xyz`

(Document root default values are fine — Passenger overrides them.)

## Step 2 — Code laao (cPanel → Git™ Version Control)

1. Clone your repo (e.g. `https://github.com/hsscoders/Stellora.git`) into
   `~/stellora`. cPanel clones into `~/repos/...` by default — after clone,
   use "Manage" → deploy, or in Terminal: `cp -r ~/repos/Stellora ~/stellora`
2. Push the latest code from your machine first:
   `git push origin main`

## Step 3 — Environment files (Terminal)

```bash
cd ~/stellora
cp backend/.env.example backend/.env
nano backend/.env
```

`backend/.env` me ye values set karo:

```env
MONGODB_URI="mongodb+srv://hsscoders_db_user:...@cluster0.../stellora?retryWrites=true&w=majority"
PORT=4000
APP_URL="https://stellora.voterx.xyz"
ADMIN_BOOTSTRAP_EMAIL="admin@stellora.local"
ADMIN_BOOTSTRAP_PASSWORD="<strong-password>"
PAYMENT_DEMO_SECRET="<random-string>"
```

> Atlas Network Access me hosting server ka IP allow karna ya
> `0.0.0.0/0` (Allow from anywhere) — warna backend connect nahi hoga.

`frontend/client/.env`:

```env
BACKEND_URL=https://api.stellora.voterx.xyz
ADMIN_URL=https://admin.stellora.voterx.xyz
NODE_ENV=production
```

`frontend/admin/.env`:

```env
BACKEND_URL=https://api.stellora.voterx.xyz
NODE_ENV=production
```

## Step 4 — Install, build, seed (Terminal)

```bash
cd ~/stellora
npm install                # repo root — npm workspaces handles everything
npm run build              # builds both frontends
npm run build:backend      # compiles backend TypeScript to dist/
npm run seed               # initial data (only first deploy)
```

Check root `package.json` scripts exist for `build`/`seed`; if `npm run seed`
fails on env loading, run:
`cd backend && MONGODB_URI="<uri>" npx tsx src/seed.ts`

## Step 5 — 3 apps register karo (cPanel → Setup Node.js App → Create)

| Field | Backend app | Storefront app | Admin app |
|---|---|---|---|
| Node version | 20.x+ | 20.x+ | 20.x+ |
| Mode | Production | Production | Production |
| Application root | `stellora/backend` | `stellora/frontend/client` | `stellora/frontend/admin` |
| Application URL | `api.stellora.voterx.xyz` | `stellora.voterx.xyz` | `admin.stellora.voterx.xyz` |
| Startup file | `passenger.js` | `passenger.js` | `passenger.js` |

Startup files (`passenger.js`) already exist in each app root — ye repo me
included hain.

## Step 6 — Environment variables (app UI me, optional if .env files set)

Passenger `.env` files ko automatically load nahi karta har setup me, isliye
same values cPanel app ke "Environment variables" me bhi daal do:

- Backend app: `MONGODB_URI`, `APP_URL`, `ADMIN_BOOTSTRAP_PASSWORD`,
  `PAYMENT_DEMO_SECRET`, `NODE_ENV=production`
- Storefront app: `BACKEND_URL`, `ADMIN_URL`, `NODE_ENV=production`
- Admin app: `BACKEND_URL`, `NODE_ENV=production`

Then click **Restart** on each app.

## Step 7 — SSL (cPanel → SSL/TLS Status → AutoSSL Run)

Teeno hostnames pe HTTPS mandatory hai (apps HTTPS URLs se baat karte hain).

---

## Verify

- `https://api.stellora.voterx.xyz/api/health` →
  `{"status":"healthy","database":"connected"}`
- `https://stellora.voterx.xyz` → storefront with products
- `https://stellora.voterx.xyz/admin-console/admin` → admin (login:
  `admin@stellora.local` + `ADMIN_BOOTSTRAP_PASSWORD`)

## Updates (naya code deploy karna)

```bash
# Local machine se:
git push origin main

# cPanel Git™ Version Control me "Pull / Deploy", phir Terminal:
cd ~/stellora && git pull
npm install && npm run build
```

Then Restart all three apps in Setup Node.js App.

## Troubleshooting

- **App 503** → Terminal me `cd ~/stellora && node backend/passenger.js`
  (PORT=4000) chala ke error dekho; usually missing `dist/` (build skip hua)
  ya OOM.
- **Backend "database" not connected** → Atlas IP allowlist check karo.
- **Admin 404 on admin subdomain root** → normal; wo `/admin-console` basePath
  pe serve hota hai. Storefront se `stellora.voterx.xyz/admin-console` kholo.
- **Cookie/login issues** → `APP_URL` aur teeno URLs exactly HTTPS ke saath
  match karne chahiye.
