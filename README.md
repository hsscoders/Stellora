# Stellora

Sterling Artificial jewellery , hair extensions , vanity & hand bags

Stellora is a complete, production-oriented e-commerce platform for the Stellora retail brand — a premium storefront for sterling & artificial jewellery, hair extensions, vanity products and handbags, with a full-featured administration panel.

**Status: v2 — split-architecture build, verified.** Maroon-luxe rebrand, working payment gateway (Card/UPI with signature verification) and PM2 process management. The platform runs as a three-app monorepo (`frontend/client/` + `frontend/admin/` + `backend/`) on **MongoDB Atlas**, browser-verified end to end. Seeded catalogue data is fictional and clearly labelled for development.

---

## Repository Layout

```
stellora/
├── frontend/
│   ├── client/   # Customer storefront — Next.js 16, port 3000 (public entry point)
│   └── admin/    # Admin console — Next.js 16, port 3001, basePath /admin-console
├── backend/      # REST API — Express 5 + Mongoose 8, port 4000, MongoDB Atlas
├── scripts/      # dev-server.sh (starts all three), image generation
└── docs/         # Architecture, audit, implementation plan
```

**How the apps talk:** the browser only ever sees port 3000. The frontend proxies `/api/*` to the Express backend and `/admin-console/*` to the admin app via Next.js rewrites — so httpOnly session cookies stay same-origin, with zero CORS complexity. The admin console is also reachable directly on port 3001 during development.

## Feature Overview

### Customer storefront (`frontend/client/`)
- **Homepage** — hero banners (admin-managed), category collections, featured selections, new arrivals, best sellers, brand story, trust strip
- **Shop All + 4 category pages** (Jewellery, Hair Extensions, Vanity, Handbags) — pagination, sorting (newest / price / name), filters (price bands, in-stock)
- **Product pages** — image gallery, variant selection with per-variant stock & pricing, quantity stepper (stock-aware), details/materials/care accordions, related products, wishlist
- **Search** — name/description matching with filters and helpful empty states
- **Cart** — server-authoritative (prices & stock re-validated on every change), guest cart via httpOnly cookie that **merges into your account on sign-in**
- **Wishlist** — authenticated, one-tap toggle from cards and product pages
- **Checkout** — address book, coupon codes validated server-side, shipping rates & free-shipping threshold from the database, **integrated payment gateway** (Card + UPI, HMAC-signature-verified, demo gateway by default, Razorpay-ready via env keys), **idempotent order creation** (duplicate submissions can never double-order)
- **Order confirmation + tracking** — truthful, server-backed status timeline; unpaid online orders get a one-tap "Complete payment" re-checkout; public tracking with order number + email match
- **Accounts** — register / login / logout / forgot & reset password, profile & password management, address book CRUD, order history & detail
- **Content** — About, Contact (messages stored & visible to admins), FAQ, Support, and policy pages editable in the admin panel
- **Custom 404 and safe error boundary**
- **Light mode default + full dark mode**, persisted preference; fully responsive

### Admin panel (`frontend/admin/`, ADMIN role only)
- Dashboard with live revenue (24h/30d), open orders, active products, recent orders, low-stock panel
- Products: create/edit/archive/delete with safeguards (order history → archive, never delete), variant management, image uploads (type/size/content-validated) or URL
- Categories with in-use protection
- Inventory: stock on hand, manual adjustments with mandatory movement history
- Orders: controlled status state machine (PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED, with CANCELLED + automatic stock release), shipment tracking, payment status changes (audit-logged)
- Customers: read-only personal data, deactivate/reactivate (sessions revoked)
- Coupons: percent/fixed, caps, windows, usage & per-user limits — re-validated server-side at checkout
- Shipping rate configuration; homepage banners; business settings
- Admin user management with self-lockout prevention
- **Audit logs** for every sensitive action; reports (14-day revenue chart, top products, low stock) from real aggregation pipelines

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript 5, Tailwind CSS 4 + shadcn/ui, Playfair Display + Manrope |
| Admin | Next.js 16, `basePath: /admin-console`, served behind the frontend proxy |
| Backend | **Express 5 + Mongoose 8** (TypeScript), run with Node + tsx (Bun also supported) |
| Process management | **PM2** — `ecosystem.config.js` runs api + admin + web with auto-restart and unified logs |
| Payments | Built-in demo gateway (Card/UPI simulation, HMAC-SHA256 signature handshake, decline rules) — **Razorpay-ready**: set `PAYMENTS_ENABLED=true`, `PAYMENT_PROVIDER=razorpay` + API keys in `backend/.env` |
| Database | **MongoDB Atlas** (`mongodb+srv://…cluster0.tse9ruk.mongodb.net/stellora`) |
| Validation | Zod 4 on every API boundary |
| Auth | DB-backed sessions (httpOnly / SameSite=Lax cookies), scrypt password hashing (Node built-in, RFC 7914), timing-safe verification |
| Security | RBAC guards, ownership checks, rate limiting, same-origin checks (proxy-aware), security headers, upload magic-byte validation, audit logging |
| Order integrity | MongoDB multi-document transactions, conditional atomic stock decrements, idempotency keys, embedded price snapshots |

## Quick Start (development — Windows / macOS / Linux)

Requirements: **Node.js 20.9+** (LTS 22 recommended) and a MongoDB Atlas URI.

```bash
# 1. Install all three apps (npm workspaces — single command at the repo root)
npm install

# 2. Configure the backend
cd backend
cp .env.example .env              # fill in your MongoDB Atlas URI
cd ..

# 3. Seed the database (fictional dev data, clearly labelled)
npm run seed

# 4. Run everything (storefront :3000 · admin :3001 · api :4000)
npm run dev
```

Open `http://localhost:3000` — the admin console is at `http://localhost:3000/admin-console` (redirects to login when signed out).

Works identically on Windows (cmd/PowerShell), macOS and Linux — all dev/start
scripts are cross-platform Node commands. PM2 (`npm run pm2:start`) is the
production process manager on Linux hosts.

### Test accounts (development only — from `backend/.env`)
| Role | Email | Password |
|---|---|---|
| Admin | `admin@stellora.local` | `StelloraAdmin#2026` |
| Customer | `customer@stellora.local` | `Customer#2026` |

> **Change these immediately in any real deployment.**

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies for backend + client + admin (workspaces) |
| `npm run dev` | Run all three apps in dev mode (concurrently, hot-reload) |
| `npm run build` | Production build of storefront + admin console |
| `npm start` | Run the production stack (expects `npm run build` first) |
| `npm run seed` | Seed the database (products, categories, coupons, banners) |
| `npm run typecheck` | TypeScript check across all three apps |
| `npm run lint` | ESLint for both frontends |
| `npm run pm2:start` | Start the stack under PM2 with auto-restart (Linux hosts) |
| `npm run build:backend` | Compile backend TypeScript to `dist/` (used by cPanel Passenger) |

Bun remains fully supported: every workspace also ships `dev:bun` / `start:bun` /
`db:seed:bun` variants.

## Production & Deployment

See **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)** for:
- Complete environment-variable reference
- **aaPanel (Linux VPS)** step-by-step: install → PM2 → nginx reverse proxy → SSL
- **cPanel**: both the Terminal+PM2 path and the Application Manager (Passenger)
  three-subdomain setup, with startup files in `deploy/cpanel/`
- Post-deployment security checklist

## Production Notes

- Set a strong session hygiene: rotate `ADMIN_BOOTSTRAP_PASSWORD`, configure SMTP for password-reset email (the dev flow logs the reset link instead of emailing it — the generic response prevents account enumeration either way).
- `PAYMENTS_ENABLED=false` keeps the truthful **"Pay on confirmation"** flow: orders are placed without payment and confirmed by the store. When a gateway (e.g. Razorpay) is configured, set the `PAYMENT_*` variables — the webhook path design verifies HMAC signatures and is idempotent via the `webhookevents` collection. **Orders are never marked paid without verified evidence.**
- All secret values live in `.env` files (gitignored). `.env.example` in each app documents every variable.
- Unknown business details (address, phone, GSTIN, shipping promises, policy text) are intentionally blank/configurable — set them in **Admin → Settings**. Nothing is fabricated.

## Documentation

| Document | Purpose |
|---|---|
| [`docs/REPOSITORY_AUDIT.md`](docs/REPOSITORY_AUDIT.md) | Phase 1 audit: environment, DB feasibility, brand references, risk register |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack decisions, data model, API conventions, security architecture |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | Phased plan with acceptance criteria and completion-report protocol |
