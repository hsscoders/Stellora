# Deploying Stellora (Netlify + Render)

Stellora is a three-piece stack. Netlify hosts the two Next.js apps; the
Express API needs a long-running host (Render) because the auto-pilot
scheduler runs on a persistent timer and uploaded media is written to local
disk — serverless platforms (Netlify Functions / Vercel) cannot run it as-is.

```
                       ┌──────────────────────────────┐
  visitors ──────────► │  Netlify site #1  storefront │  frontend/client
                       │  (your main domain)          │
                       │    /api/*  ───────────┐      │
                       │    /uploads/* ────────┤      │
                       │    /admin-console/* ──┼──┐   │
                       └───────────────────────┼──┼───┘
                                               │  │
              ┌────────────────────────────────┘  │
              │                                   │
              ▼                                   ▼
  ┌──────────────────────────┐        ┌─────────────────────────────┐
  │ Netlify site #2  admin   │        │ Render web service          │
  │ frontend/admin           │        │ Express API (backend/)      │
  │ (basePath /admin-console)│        │ + auto-pilot scheduler      │
  └──────────────────────────┘        │ + uploads on disk           │
              │                       └──────────────┬──────────────┘
              └─────────── /api proxy ───────────────┘
                                              │
                                              ▼
                                   MongoDB Atlas (already cloud-hosted)
```

Because the browser only ever talks to the storefront origin, the httpOnly
session cookie stays same-origin and **no CORS changes are needed anywhere**.

---

## 1. Backend → Render (one-time)

1. Push this repo to GitHub (done — `hsscoders/Stellora`).
2. Render Dashboard → **New → Blueprint** → select the repo. Render reads
   `render.yaml` (Bun runtime, build `bun install --frozen-lockfile`,
   start `cd backend && bun src/server.ts`, health check `/api/health`).
3. Fill in the `sync: false` secrets when prompted:
   - `MONGODB_URI` — the Atlas connection string
   - `APP_URL` — storefront URL, e.g. `https://stellora.netlify.app`
   - `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`
   - `DEMO_CUSTOMER_EMAIL` / `DEMO_CUSTOMER_PASSWORD`
   - `PAYMENT_DEMO_SECRET`
4. Deploy. Note the service URL, e.g. `https://stellora-api.onrender.com`.

> Free plan note: the service spins down after 15 min idle; the first request
> afterwards pays a ~30–60 s cold start. Upgrade to a paid plan (or keep the
> current VPS) to avoid this. Free-plan disk is also **ephemeral** — media
> uploaded through the admin console disappears on every redeploy/restart.
> Seed product images are safe (they are static files shipped in the repo).
> For durable uploads, plug in Cloudinary/S3 later.

## 2. Storefront → Netlify site #1

1. Netlify → **Add new site → Import an existing project** → pick `hsscoders/Stellora`.
2. Build settings:
   - **Base directory**: `frontend/client`
   - Everything else comes from `frontend/client/netlify.toml`
     (build command, publish dir, `@netlify/plugin-nextjs`).
3. **Environment variables** (Site configuration → Environment variables):
   | Variable | Value |
   |---|---|
   | `BACKEND_URL` | `https://stellora-api.onrender.com` (no trailing slash) |
   | `ADMIN_URL` | `https://<your-admin-site>.netlify.app` (set after step 3) |
4. Deploy. Changing `BACKEND_URL`/`ADMIN_URL` requires a redeploy (they are
   baked into the build), so set both before the first production deploy.

## 3. Admin console → Netlify site #2

1. Netlify → **Add new site → Import an existing project** → same repo again.
2. Build settings:
   - **Base directory**: `frontend/admin`
   - Config comes from `frontend/admin/netlify.toml`.
3. **Environment variables**:
   | Variable | Value |
   |---|---|
   | `BACKEND_URL` | `https://stellora-api.onrender.com` |
4. Deploy, copy the site URL (e.g. `https://stellora-admin.netlify.app`),
   then go back to site #1 and set `ADMIN_URL` to it and redeploy site #1.

The admin app keeps `basePath: /admin-console`, so it is served at
`https://<admin-site>.netlify.app/admin-console` — the exact paths the
storefront proxy exposes. Use either URL; cookies and API calls work in both.

## 4. Verify

- `https://<storefront>/` renders products with images (static repo assets).
- `https://<storefront>/admin-console` → login → product thumbnails render
  (admin ships images unoptimized by design — see Stellora-16 notes).
- `https://<storefront>/api/health` → `{"ok":true,...}` through the proxy.
- Place a test order; confirm it appears in the admin console.

## Notes & limits

- **Custom domain**: attach it to Netlify site #1 (storefront). Add its
  suffix to the backend's `ORIGIN_SUFFIXES` (e.g. `.netlify.app,.myshop.com`).
- **Never point the backend at Netlify Functions** — the scheduler would not
  run and uploads would not persist. Render/Railway/Fly/VPS are valid hosts.
- **Dev locally stays unchanged**: without env vars, rewrites default to
  `127.0.0.1:4000` / `:3001`, exactly like before.
- `BACKEND_URL` / `ADMIN_URL` are read at **build time** — after changing
  them in the Netlify UI, trigger a redeploy (Deploys → Trigger deploy).
