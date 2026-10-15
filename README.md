# Stellora

Sterling Artificial jewellery , hair extensions , vanity & hand bags

Stellora is a complete, production-oriented e-commerce platform for the Stellora retail brand — a premium storefront for sterling & artificial jewellery, hair extensions, vanity products and handbags, with a full-featured administration panel.

**Status: Built and verified.** Customer storefront + admin backend are implemented and browser-verified end to end. Seeded catalogue data is fictional and clearly labelled for development.

---

## Feature Overview

### Customer storefront
- **Homepage** — hero banners (admin-managed), category collections, featured selections, new arrivals, best sellers, brand story, trust strip
- **Shop All + 4 category pages** (Jewellery, Hair Extensions, Vanity, Handbags) — pagination, sorting (newest / price / name), filters (price bands, in-stock), category navigation
- **Product pages** — multi-image gallery with hover zoom, variant selection with per-variant stock & pricing, quantity stepper (stock-aware), details/materials/care accordions, related products, wishlist
- **Search** — name/description/category matching with filters and helpful empty states
- **Cart** — server-authoritative (prices & stock re-validated on every change), guest cart via signed cookie that **merges into your account on sign-in**
- **Wishlist** — authenticated, one-tap toggle from cards and product pages
- **Checkout** — address book with default selection, coupon codes validated server-side, shipping rates & free-shipping threshold from the database, **idempotent order creation** (duplicate submissions can never double-charge or double-order)
- **Order confirmation + tracking** — truthful, server-backed status timeline; public tracking with order number + email match
- **Accounts** — register / login / logout / forgot & reset password, profile & password management, address book CRUD, order history & detail
- **Content** — About, Contact (messages stored & visible to admins), FAQ, Support, and four policy pages (shipping, returns, privacy, terms) editable in the admin panel
- **Custom 404 and safe error boundary**
- **Light mode default + full dark mode**, persisted preference, system-aware; fully responsive; reduced-motion respected

### Admin panel (`/admin`, ADMIN role only)
- Dashboard with live revenue (24h/30d), open orders, active products, recent orders, low-stock panel
- Products: create/edit/archive/delete with safeguards (order history → archive, never delete), variant management, image uploads (type/size/content-validated) or URL
- Categories with in-use protection
- Inventory: stock on hand, low-stock badges, manual adjustments with mandatory movement history
- Orders: controlled status state machine (PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED, with CANCELLED + automatic stock release), shipment tracking details, payment status changes (audit-logged, human-confirmed only)
- Customers: read-only personal data (never passwords), deactivate/reactivate (sessions revoked)
- Coupons: percent/fixed, caps, windows, usage & per-user limits — all re-validated server-side at checkout
- Shipping rate configuration; homepage banners; business settings (announcement bar, contact details, social links, policy texts)
- Admin user management with least-privilege defaults and self-lockout prevention
- **Audit logs** for every sensitive action; reports (14-day revenue chart, top products, low stock) from real SQL aggregates

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| UI | Tailwind CSS 4 + shadcn/ui + Lucide icons, Playfair Display + Manrope |
| Database | **MySQL** (development uses a user-space MariaDB 11.4 server — MySQL drop-in) |
| ORM | Prisma 6 (`mysql` provider), `DECIMAL(10,2)` money, transactional checkout |
| Validation | Zod 4 on every API boundary + shared client/server schemas |
| Auth | Server-managed sessions (DB-backed, httpOnly/SameSite=Lax cookies), scrypt password hashing (Node built-in, RFC 7914), timing-safe verification |
| Security | RBAC guards, ownership checks, rate limiting (login/register/reset/checkout/track), same-origin checks on mutations, security headers via middleware, parameterized queries only, upload magic-byte validation, audit logging |
| State | Server Components + Zustand (cart/wishlist UX state) |
| Tests | Vitest (unit + DB integration: race-safe stock, idempotency, state machine) |

## Quick Start (development)

```bash
# 1. Install dependencies
bun install        # or npm install

# 2. Configure environment
cp .env.example .env   # defaults work with the local dev DB below

# 3. Start the development database (user-space MariaDB, no root needed)
bash scripts/setup-mariadb.sh     # downloads & starts MariaDB on 127.0.0.1:33061

# 4. Push schema and seed (fictional demo data, clearly labelled)
bunx prisma db push
bun prisma/seed.ts

# 5. Run the app
bun run dev        # http://localhost:3000
```

### Test accounts (development only — from `.env`)
| Role | Email | Password |
|---|---|---|
| Admin | `admin@stellora.local` | `StelloraAdmin#2026` |
| Customer | `customer@stellora.local` | `Customer#2026` |

> **Change these immediately in any real deployment** (`.env` → re-seed, or use the admin panel).

### Scripts
| Command | Purpose |
|---|---|
| `bun run dev` | Dev server (MariaDB up + schema sync + Next.js) |
| `bun run lint` / `bun run typecheck` | ESLint / TypeScript |
| `bun run test` | Vitest suite (unit + DB integration) |
| `bun run db:push` / `db:migrate` | Schema sync / migrations |
| `bun run db:seed` | Seed fictional development data |
| `bash scripts/setup-mariadb.sh` | Start the user-space MariaDB (idempotent) |

## Production Notes

- Point `DATABASE_URL` at a real **MySQL 8** instance; the Prisma schema targets MySQL semantics (`utf8mb4`, InnoDB, DECIMAL). Run `prisma migrate deploy`.
- `PAYMENTS_ENABLED=false` keeps the truthful **"Pay on confirmation"** flow: orders are placed without payment and confirmed by the store. When a gateway (e.g. Razorpay) is configured, set the `PAYMENT_*` variables — the webhook path verifies HMAC signatures and is idempotent via the `WebhookEvent` table. **Orders are never marked paid without verified evidence.**
- Password reset emails currently print a reset link to the server log (SMTP not configured in the dev sandbox) — connect an SMTP provider before public launch. The generic response prevents account enumeration either way.
- All secret values live in `.env` (gitignored). `.env.example` documents every variable.
- Unknown business details (address, phone, GSTIN, shipping promises, policy text) are intentionally blank/configurable — set them in **Admin → Settings**. Nothing is fabricated.

## Documentation

| Document | Purpose |
|---|---|
| [`docs/REPOSITORY_AUDIT.md`](docs/REPOSITORY_AUDIT.md) | Phase 1 audit: environment, DB feasibility, brand references, risk register |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack decisions, data model, API conventions, security architecture |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | Phased plan with acceptance criteria and completion-report protocol |
