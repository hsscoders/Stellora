# Stellora Architecture — v2 (Split Apps + MongoDB)

> v2 replaces the single Next.js app + Prisma/MySQL stack with a three-app monorepo backed by MongoDB Atlas. See `ARCHITECTURE.md` for the v1 history and domain rules that still apply.

## Topology

```
Browser (single origin :3000)
   │
   ▼
frontend/  Next.js 16 — customer storefront, port 3000
   │  rewrites:
   │   /api/*            → http://127.0.0.1:4000/api/*   (Express backend)
   │   /uploads/*        → backend media
   │   /admin-console/*  → http://127.0.0.1:3001/admin-console/* (admin app)
   │
   ├── admin/  Next.js 16 — admin console, port 3001, basePath /admin-console
   │             own rewrite /api/* → backend (for direct :3001 access)
   │
   └── backend/  Express 5 + Mongoose 8 — REST API, port 4000 (internal)
                 MongoDB Atlas: cluster0.tse9ruk.mongodb.net/stellora
```

**Why rewrites instead of CORS:** the browser stays on one origin, so the backend's
httpOnly session cookie (`stellora_session`) and guest-cart cookie (`stellora_cart`)
are first-party cookies everywhere. The backend's same-origin CSRF check reads
`x-forwarded-host` (set by the Next.js proxy) rather than `Host`.

## Request flow

- **Storefront SSR (server components)** — fetch the backend directly at
  `BACKEND_URL` (internal) and forward the visitor's cookies via
  `frontend/src/lib/server-api.ts`.
- **Client interactions** (cart, wishlist, auth forms, admin CRUD) — relative
  `fetch("/api/...")` through the rewrite proxy.
- **Admin SSR** — `admin/src/lib/server-api.ts`, same cookie-forwarding pattern.
  Auth gate lives in `admin/src/app/admin/layout.tsx`: unauthenticated users are
  redirected to the storefront `/login` (URL resolved from `x-forwarded-host` so it
  works behind the preview proxy).

## Data model (MongoDB)

| Collection | Shape |
|---|---|
| `users` | auth + profile, **embedded** `addresses[]` and `wishlist[]` |
| `sessions` | tokenHash (sha256), userId, expiry, ip/ua — revocable |
| `passwordresettokens` | hashed one-time tokens |
| `categories` | slug, imagery, sort order |
| `products` | **embedded** `variants[]` (sku/price/stock) and `images[]` |
| `stockmovements` | append-only stock ledger per variant |
| `carts` | one per user or guest key; **embedded** `items[]` |
| `coupons` | rules + **embedded** `redemptions[]` + `timesUsed` counter |
| `orders` | **embedded** `items[]` (price snapshots), `payment`, `events[]`, `shipment` |
| `shippingrates`, `homepagebanners`, `sitesettings`, `contactmessages`, `auditlogs`, `webhookevents`, `counters` | support data |

Money is stored as rounded `Number` (2 dp, decimal.js at the service layer).
Sparse-unique indexes on `carts.userId` / `carts.sessionKey` — fields are left
**absent** (never `null`) so multiple guest carts can coexist.

## Order integrity

`createOrderFromCart` (backend/src/services/orders.ts) runs inside a MongoDB
transaction (`session.withTransaction`):

1. Idempotency-key probe (unique index as the final guard).
2. Cart view recomputed server-side (prices + stock).
3. Per-line **conditional decrement** on the embedded variant
   (`$elemMatch stock >= qty` → `$inc` with `arrayFilters`); a failed
   `modifiedCount` aborts the transaction (HTTP 409).
4. Order + payment + status event created; stock ledger written; coupon usage
   incremented with an embedded redemption; cart emptied.

Cancellation restocks via the same atomic path and writes `ORDER_RELEASE` movements.
Status transitions are a server-side state machine.

## API surface (all under `/api`)

Public: `health`, `auth/*`, `account/*`, `products`, `products/:slug`, `categories`,
`banners`, `settings`, `cart`, `cart/items/:id`, `wishlist`, `checkout`, `orders`,
`orders/:orderNumber`, `track`, `coupons/validate`, `shipping`, `contact`, `media/*`.

Admin (ADMIN role): `stats`, `reports`, `audit-logs`, `products` (+ `:id`),
`categories` (+ `:id`), `orders-list`, `orders/:id` (+ `/status`, `/payment`),
`customers-list`, `customers/:id`, `users` (+ `:id`), `inventory/:variant`
(+ `/movements`), `coupons` (+ `:id`), `banners` (+ `:id`), `settings`, `shipping`
(+ `:id`), `messages-list`, `messages/:id`, `uploads`.

Envelope: `{ ok: true, data }` / `{ ok: false, error: { code, message, fields? } }`.

## Environment

| File | Keys |
|---|---|
| `backend/.env` | `MONGODB_URI`, `PORT`, `APP_URL`, bootstrap + demo credentials, `PAYMENTS_ENABLED`, `PAYMENT_*`, `UPLOAD_MAX_MB` |
| `frontend/.env` | `BACKEND_URL`, `APP_URL` |
| `admin/.env` | `BACKEND_URL` |

Real `.env` files are gitignored; each app ships an `.env.example`.

## Dev orchestration

`scripts/dev-server.sh` (wired to the workspace root's `bun run dev`) starts the
backend, admin, and frontend as detached processes with per-app logs
(`backend/.backend.log`, `admin/.admin.log`, `frontend/.frontend.log`).
