# Stellora — Deployment Guide

This guide covers production deployment on **aaPanel (Linux VPS)** and **cPanel**
(shared/cloud hosting with Node.js support). It also documents every environment
variable and the recommended topology.

---

## Architecture Recap

```
Browser ──> storefront (:3000, Next.js)  ──proxy──>  API (:4000, Express + MongoDB Atlas)
              │
              ├── /api/*      -> backend :4000   (rewritten server-side)
              └── /admin-console/* -> admin :3001 (rewritten server-side)
```

- The browser only ever talks to the storefront origin — session cookies stay
  same-origin, so **no CORS setup is needed** on any environment.
- MongoDB is **external (MongoDB Atlas)** — no database server to install.
- All three apps are plain Node.js processes (no Bun required).

---

## Environment Variables Reference

### `backend/.env` (required)

| Variable | Required | Example / Default | Notes |
|---|---|---|---|
| `MONGODB_URI` | **YES** | `mongodb+srv://user:pass@cluster.mongodb.net/stellora` | Atlas connection string. Database `stellora` is created on first seed. |
| `PORT` | no | `4000` | API port (Passenger/cPanel overrides this automatically). |
| `APP_URL` | no | `http://localhost:3000` | Public storefront URL — used for CSRF origin allowlist in production. |
| `ORIGIN_SUFFIXES` | no | `.space-z.ai,.z.ai` | Extra dot-suffixes accepted as same-origin (dynamic preview hosts). Add `.yourdomain.com` if your proxy strips forwarded headers. |
| `ADMIN_BOOTSTRAP_EMAIL` | no | `admin@stellora.local` | Seeded admin account email. **Change in production.** |
| `ADMIN_BOOTSTRAP_PASSWORD` | no | — | Seeded admin password. **Change in production.** |
| `DEMO_CUSTOMER_EMAIL` / `DEMO_CUSTOMER_PASSWORD` | no | — | Seeded demo customer (development only). |
| `PAYMENTS_ENABLED` | no | `false` | `true` when a real gateway is configured. |
| `PAYMENT_PROVIDER` | no | `""` | `razorpay` to go live. |
| `PAYMENT_KEY_ID` / `PAYMENT_KEY_SECRET` | no | — | Razorpay API keys. |
| `PAYMENT_WEBHOOK_SECRET` | no | — | Razorpay webhook HMAC secret. |
| `PAYMENT_DEMO_SECRET` | no | `stellora_demo_secret_2026` | HMAC secret of the built-in demo gateway. **Change in production.** |
| `UPLOAD_MAX_MB` | no | `5` | Max image upload size. |
| `NODE_ENV` | no | `development` | Set `production` in deployment. |

### `frontend/client/.env` (required)

| Variable | Example | Notes |
|---|---|---|
| `BACKEND_URL` | `http://127.0.0.1:4000` | Where the storefront proxies `/api/*` and `/uploads/*`. Local: loopback. cPanel multi-subdomain: `https://api.yourdomain.com`. |
| `ADMIN_URL` | `http://127.0.0.1:3001` | Where `/admin-console/*` proxies. cPanel: `https://admin.yourdomain.com`. |
| `APP_URL` | `http://localhost:3000` | Informational. |

### `frontend/admin/.env` (required)

| Variable | Example | Notes |
|---|---|---|
| `BACKEND_URL` | `http://127.0.0.1:4000` | Used for server-side API calls. |

> `.env` files are git-ignored. Never commit real credentials.

---

## Option A — aaPanel (Linux VPS) — RECOMMENDED

Works on any Ubuntu/Debian/CentOS VPS with aaPanel. Needs ~1.5 GB RAM
(the three production processes + builds).

### 1. Install Node.js 20+

aaPanel → **App Store** → install **Node.js version manager** → install Node 20 or 22 LTS.
Verify in terminal:

```bash
node -v    # v20.9.0 or newer
npm -v
```

### 2. Upload the project

```bash
cd /www/wwwroot
git clone https://github.com/hsscoders/Stellora.git stellora
cd stellora
```

(or upload a zip via aaPanel File Manager and extract here)

### 3. Configure environment

```bash
cd backend   && cp .env.example .env   # fill MONGODB_URI + secrets
cd ../frontend/client && cp .env.example .env
cd ../admin  && cp .env.example .env
cd ../..
```

### 4. Install, seed, build

```bash
npm install              # installs all 3 apps (npm workspaces)
npm run seed             # seeds catalogue + admin account into MongoDB
npm run build            # production build of storefront + admin console
```

### 5. Start with PM2

```bash
npm install -g pm2
npm run pm2:start        # = bash scripts/dev-server.sh (installs deps/builds if missing, starts all 3)
pm2 save                 # remember process list
pm2 startup              # enable auto-start on reboot (follow printed instruction)
```

Processes: `stellora-api` (:4000), `stellora-web` (:3000), `stellora-admin` (:3001).
Logs: `pm2 logs` · status: `pm2 status` · restart after a code change:
`npm run build && pm2 restart stellora-web stellora-admin`.

### 6. Reverse proxy (aaPanel → Website → Settings → Reverse Proxy)

Create a site for `yourdomain.com`, then add reverse proxies:

| Proxy name | Target URL | Path |
|---|---|---|
| `api` | `http://127.0.0.1:4000` | `/api` |
| `uploads` | `http://127.0.0.1:4000` | `/uploads` |
| `admin` | `http://127.0.0.1:3001` | `/admin-console` |

Everything else goes to `http://127.0.0.1:3000` (set the site's default proxy or
run the storefront on the site itself). Equivalent standalone nginx:

```nginx
server {
  listen 80;
  server_name yourdomain.com;
  client_max_body_size 10m;

  location /api/       { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  location /uploads/   { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Host $host; }
  location /admin-console { proxy_pass http://127.0.0.1:3001; proxy_set_header Host $host; proxy_set_header X-Forwarded-Host $host; }
  location /           { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Host $host; }
}
```

Then issue a Let's Encrypt SSL from the site's SSL tab (force HTTPS).

### 7. First login

Open `https://yourdomain.com` — storefront. Admin: `https://yourdomain.com/admin-console`
(sign in with `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`).
**Change the admin password immediately (Admin → Users).**

---

## Option B — cPanel

Two paths depending on what your host allows.

### B1. cPanel with Terminal/SSH (most reliable — behaves like a VPS)

If your cPanel has **Terminal** (or SSH) and lets long-running processes:

```bash
cd ~/stellora                 # upload the project here (File Manager or git clone)
# create .env files as in Option A step 3
npm install
npm run seed
npm run build
npm install -g pm2
npm run pm2:start
pm2 save && pm2 startup       # auto-start (may need host support)
```

Then ask your host (or use cPanel's Node.js selector UI) to proxy
`yourdomain.com` → `127.0.0.1:3000`. API and admin are reached through the
storefront's own rewrites — only ONE public port is exposed.

> **Limitation:** on pure shared cPanel (CloudLinux + Passenger), PM2 processes
> are killed when the shell session ends unless your host allows
> `pm2 startup`/systemd. If that happens, use path B2.

### B2. cPanel Application Manager (Phusion Passenger) — 3 registered apps

cPanel's Node.js app support runs apps under Passenger. Passenger apps get a
random internal port via the `PORT` env var, so the three apps cannot reach each
other on fixed loopback ports. The supported pattern is **one subdomain per app**,
talking over public HTTPS:

```
yourdomain.com        -> storefront app (proxies /api and /admin-console over HTTPS)
api.yourdomain.com    -> backend app
admin.yourdomain.com  -> admin app
```

**Steps:**

1. Upload the repo to `~/stellora` (File Manager or git).
2. Create the three `.env` files (see reference above). In `backend/.env` set
   `APP_URL=https://yourdomain.com`.
3. cPanel → **Setup Node.js App** → *Create Application* ×3:

   | Field | API app | Storefront app | Admin app |
   |---|---|---|---|
   | Node version | 20+ | 20+ | 20+ |
   | Application mode | Production | Production | Production |
   | Application root | `stellora/backend` | `stellora/frontend/client` | `stellora/frontend/admin` |
   | Application URL | `api.yourdomain.com` | `yourdomain.com` | `admin.yourdomain.com` |
   | Startup file | `backend-passenger.js` *(copy from `deploy/cpanel/` into the app root)* | `web-passenger.js` | `admin-passenger.js` |

4. Add environment variables in each app (cPanel UI):
   - API app: everything from `backend/.env` (or keep the .env file — dotenv loads it).
   - Storefront: `BACKEND_URL=https://api.yourdomain.com`, `ADMIN_URL=https://admin.yourdomain.com`.
   - Admin: `BACKEND_URL=https://api.yourdomain.com`.
5. Install dependencies **once from the repository root** (Terminal):
   `cd ~/stellora && npm install && npm run build`
6. For the API app also compile TypeScript:
   `cd ~/stellora/backend && npm run build` (produces `dist/` used by `backend-passenger.js`).
7. Click **Run NPM Install** / **Restart** for each app in the UI.

**Why three subdomains?** The storefront's `/api` and `/admin-console` rewrites
proxy to `BACKEND_URL` / `ADMIN_URL`. On cPanel those must be public HTTPS URLs
(Passenger doesn't expose fixed loopback ports). Cookies still work because the
storefront proxies everything — the browser never leaves `yourdomain.com`.

**Known cPanel limitations (honest):**
- `next start`-style servers need ~300–500 MB per frontend app; entry shared
  plans with 1 GB RAM will struggle to run all three apps. Use a VPS (Option A)
  or a host that supports Node memory limits ≥ 1.5 GB.
- Passenger restarts apps on its own schedule; the backend's in-memory rate
  limiter resets on each restart (harmless — limits are per-process anyway).

---

## Post-deployment checklist

- [ ] `https://yourdomain.com/api/health` (via storefront proxy) returns `{"status":"healthy","database":"connected"}`
- [ ] Storefront loads with seeded categories/products
- [ ] Admin console at `/admin-console` — change the bootstrap admin password
- [ ] Demo test transaction with card `4111 1111 1111 1111` (demo gateway) — then
      set `PAYMENTS_ENABLED=true` + Razorpay keys when going live
- [ ] `backend/.env`: replace `PAYMENT_DEMO_SECRET`, admin/customer bootstrap passwords
- [ ] HTTPS forced on all three origins
- [ ] `ORIGIN_SUFFIXES`/`APP_URL` updated if you host behind an unusual proxy
