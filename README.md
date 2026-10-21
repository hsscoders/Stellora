# Stellora

Sterling Artificial jewellery, hair extensions, vanity & hand bags

Stellora is a complete, production-oriented e-commerce platform for the Stellora retail brand — a premium storefront for sterling & artificial jewellery, hair extensions, vanity products and handbags, with a full-featured administration panel.

**Status: v2.1 — three-app monorepo on MySQL (Prisma 6).** The platform runs as
`frontend/client/` + `frontend/admin/` + `backend/` on **MySQL / MariaDB**
(previously MongoDB Atlas — migrated 2026-10, see [`MYSQL_MIGRATION.md`](MYSQL_MIGRATION.md)).
API contracts, UI and business rules are unchanged; only the data layer moved.

---

## Repository Layout

```
stellora/
├── frontend/
│   ├── client/   # Customer storefront — Next.js 16, port 3000 (public entry point)
│   └── admin/    # Admin console — Next.js 16, port 3001, basePath /admin-console
├── backend/      # REST API — Express 5 + Prisma 6, port 4000, MySQL/MariaDB
│   └── prisma/   # schema.prisma + committed SQL migrations (35 tables)
├── localhost.md  # THE setup guide — clone → follow this → done
├── render.yaml   # Render blueprint (one-service deploy)
├── DEPLOY_RENDER.md
└── MYSQL_MIGRATION.md
```

**How the apps talk:** the browser only ever sees port 3000. The frontend proxies
`/api/*` to the Express backend and `/admin-console/*` to the admin app via
Next.js rewrites — so httpOnly session cookies stay same-origin, with zero CORS
complexity. The admin console is also reachable directly on port 3001 during
development.

## Quick Start

Requirements: **Node.js 20.9+** and **MySQL 8+ / MariaDB 10.6+** running locally.

**Follow [`localhost.md`](localhost.md)** — it is the complete setup guide:
create the database → write `backend/.env` → `npm install` → Prisma migrate →
seed → run. Short version:

```bash
npm install                 # all three apps (npm workspaces)
# …create MySQL DB + backend/.env as shown in localhost.md…
cd backend && npx prisma generate && npx prisma migrate deploy && cd ..
npm run seed                # fictional demo catalogue (clearly labelled)
npm run dev                 # storefront :3000 · admin :3001 · api :4000
```

Open `http://localhost:3000` — the admin console is at
`http://localhost:3000/admin-console` (redirects to login when signed out).

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript 5, Tailwind CSS 4 + shadcn/ui, Playfair Display + Manrope |
| Admin | Next.js 16, `basePath: /admin-console`, served behind the frontend proxy |
| Backend | **Express 5 + Prisma 6** (TypeScript), run with Node + tsx |
| Database | **MySQL 8+ / MariaDB 10.6+** — InnoDB transactions, DECIMAL money columns, parameterised queries |
| Payments | Built-in demo gateway (Card/UPI simulation, HMAC-SHA256 signature handshake, decline rules) — Razorpay-ready: set `PAYMENTS_ENABLED=true`, `PAYMENT_PROVIDER=razorpay` + API keys in `backend/.env` |
| Validation | Zod 4 on every API boundary |
| Auth | DB-backed sessions (httpOnly / SameSite=Lax cookies), scrypt password hashing (Node built-in, RFC 7914), timing-safe verification |
| Security | RBAC guards, ownership checks, rate limiting, same-origin checks (proxy-aware), security headers, upload magic-byte validation, audit logging |
| Order integrity | MySQL/InnoDB multi-statement transactions, conditional atomic stock decrements, idempotency keys, price snapshots on order items |

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies for backend + client + admin (workspaces) |
| `npm run dev` | Run all three apps in dev mode (concurrently, hot-reload) |
| `npm run dev:backend` / `dev:frontend` / `dev:admin` | Run one app at a time |
| `npm run build` | Production build of storefront + admin console |
| `npm start` | Run the production stack (expects `npm run build` first) |
| `npm run seed` | Seed the database (products, categories, coupons, banners) |
| `npm run typecheck` | TypeScript check across all three apps |
| `npm run lint` | ESLint for both frontends |
| `npm run build:backend` | Compile backend TypeScript to `dist/` |

## Test accounts (development only — whatever you set in `backend/.env`)

| Role | Env var | Default in the guide |
|---|---|---|
| Admin | `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | `admin@stellora.local` / `Admin@12345` |
| Customer | `DEMO_CUSTOMER_EMAIL` / `DEMO_CUSTOMER_PASSWORD` | `customer@stellora.local` / `Customer@12345` |

> **Change these immediately in any real deployment.** Admins sign in only at
> `http://localhost:3000/admin/login`.

## Production & Deployment

- **Render (recommended path):** `render.yaml` blueprint + step-by-step
  [`DEPLOY_RENDER.md`](DEPLOY_RENDER.md) — set `DB_HOST`, `DB_PORT`, `DB_NAME`,
  `DB_USER`, `DB_PASSWORD` to your MySQL server and deploy.
- **Any host:** the stack is plain Node — build and run with `npm run build` +
  `npm start` (or PM2/Docker of your choice) with the same env vars.

**Environment variables:** everything is documented in `backend/.env.example`
and `localhost.md`. Secrets live only in `.env` files (gitignored).

## Production Notes

- Rotate the admin bootstrap password before going live; configure SMTP for
  password-reset email (the dev flow logs the reset link instead of emailing it
  — the generic response prevents account enumeration either way).
- `PAYMENTS_ENABLED=false` keeps the truthful **"Pay on confirmation"** flow:
  orders are placed without payment and confirmed by the store. When a gateway
  (e.g. Razorpay) is configured, set the `PAYMENT_*` variables — the webhook
  path verifies HMAC signatures and is idempotent. **Orders are never marked
  paid without verified evidence.**
- Unknown business details (address, phone, GSTIN, shipping promises, policy
  text) are intentionally blank/configurable — set them in
  **Admin → Settings**. Nothing is fabricated.

## Documentation

| Document | Purpose |
|---|---|
| [`localhost.md`](localhost.md) | Complete local setup guide (database, env, migrate, seed, run) |
| [`MYSQL_MIGRATION.md`](MYSQL_MIGRATION.md) | MongoDB → MySQL migration report: schema mapping, data migration, test results |
| [`DEPLOY_RENDER.md`](DEPLOY_RENDER.md) | Deploy to Render with a managed/remote MySQL |
