# Stellora — Proposed Architecture (Phase 2 Draft)

**Status:** Drafted during Phase 1; to be ratified before Phase 3 (Foundation) begins.
**Principle:** Secure, truthful, production-oriented. Server-side authority for all business rules; no simulated success states anywhere.

---

## 1. Stack Decisions & Rationale

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 16 (App Router) + TypeScript 5** | User requires Next.js + React; App Router provides Server Components, Route Handlers (backend), streaming, and image optimization in one deployable. **Note:** the requested React Router is not applicable inside Next.js — Next.js file-system routing is the routing layer; this deviation is documented. |
| Styling | **Tailwind CSS 4 + shadcn/ui (New York)** | User-approved alternative; the sandbox ships 50+ accessible Radix-based primitives, accelerating a bespoke (non-generic) design system built on custom Stellora tokens. |
| Database | **MySQL 8 (production) / MariaDB 11.8 user-space (dev)** | Hard requirement: MySQL. Rootless sandbox → verified portable MariaDB drop-in. Same Prisma `mysql` provider for both. |
| ORM | **Prisma 6.x** | User allows Prisma or Drizzle. Prisma 6 offers mature MySQL support, typed client, transactions (`$transaction`), migrations, and a studio-free seed path. Drizzle was deprioritized: smaller ecosystem for MySQL decimal/transactional e-commerce patterns and no advantage for this team size. |
| Validation | **Zod 4** | Single schema language shared by API route handlers, forms (react-hook-form resolvers), and env parsing. |
| Auth | **Custom server-managed sessions** | Database-backed session table + httpOnly/Secure/SameSite=Lax cookie; passwords hashed with **scrypt** (Node built-in `crypto`, RFC 7914, timing-safe compare) — zero native-build risk. bcryptjs is the documented fallback. NextAuth v4 was evaluated and deprioritized: its credential flow adds abstraction without benefit for a first-party session model requiring strict RBAC and audit hooks. |
| State | Server Components + **Zustand** (cart drawer/UI state) + **TanStack Query** (client fetches) | Minimal client state; server remains source of truth for cart/stock/prices. |
| Payments | **Pending-payment flow now; gateway later** | No merchant credentials exist. Checkout supports Cash-on-Delivery style "Pay on confirmation" plus a gateway-shaped integration module behind `PAYMENTS_ENABLED` env flag with webhook HMAC-SHA256 verification and idempotency keys. Orders never auto-mark "paid" without verified evidence. |
| Testing | **Vitest** (unit + API integration against a dedicated test DB) + **Playwright** (E2E, best-effort in sandbox) | Critical flows: auth, cart, checkout, order creation, inventory, admin authorization. If Playwright cannot run rootless, API-level E2E substitutes and the limitation is reported. |
| Images | `next/image` + validated uploads (type/size/content sniff) | Product imagery replaceable via admin panel; interim imagery clearly placeholder. |

---

## 2. Repository Layout

```
stellora-repo/
├── prisma/
│   ├── schema.prisma          # MySQL provider, full domain model
│   ├── seed.ts                # Dev-only fictional seed, clearly labelled
│   └── migrations/            # Generated SQL migrations
├── src/
│   ├── app/
│   │   ├── (storefront)/      # Customer-facing routes
│   │   │   ├── page.tsx                    # Homepage
│   │   │   ├── shop/                       # Shop all (pagination, sort, filter)
│   │   │   ├── category/[slug]/            # 4 category pages
│   │   │   ├── product/[slug]/             # Product details
│   │   │   ├── search/
│   │   │   ├── cart/
│   │   │   ├── wishlist/
│   │   │   ├── checkout/
│   │   │   ├── order-confirmation/[orderId]/
│   │   │   ├── track-order/
│   │   │   ├── account/ (profile, addresses, orders, order detail)
│   │   │   ├── about / contact / faq / support
│   │   │   └── policies/ (shipping, returns, privacy, terms)
│   │   ├── (auth)/ (login, register, forgot-password, reset-password)
│   │   ├── admin/             # Protected admin panel (own layout + guard)
│   │   ├── api/               # Route handlers (REST-ish, see §4)
│   │   ├── not-found.tsx      # Custom 404
│   │   ├── error.tsx          # Safe error boundary
│   │   ├── layout.tsx         # Root layout: theme provider, fonts, toaster
│   │   └── globals.css        # Design tokens (light default + dark)
│   ├── components/
│   │   ├── ui/                # shadcn primitives (baseline)
│   │   └── stellora/          # Brand components (ProductCard, PriceTag,
│   │                          # RatingStars, QuantityStepper, Gallery,
│   │                          # ThemeToggle, MobileNav, Footer, etc.)
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── auth/              # session.ts, password.ts, guards.ts, rbac.ts
│   │   ├── validation/        # Zod schemas (shared client/server)
│   │   ├── services/          # pricing, inventory, orders, coupons, shipping
│   │   ├── payments/          # gateway abstraction + webhook verification
│   │   ├── audit.ts           # audit-log writer
│   │   ├── rate-limit.ts      # in-memory limiter (per-IP/identity)
│   │   ├── env.ts             # zod-validated env access
│   │   └── utils.ts
│   └── middleware.ts          # Security headers, admin route pre-check
├── tests/ (unit + integration) / e2e/ (Playwright)
├── docs/ (this document set)
├── scripts/                   # db setup, user-space DB start/stop
└── .env.example               # No real values
```

---

## 3. Data Model (normalized, MySQL)

All monetary columns: `DECIMAL(10,2)` via Prisma `Decimal` (INR default; currency configurable). All tables `InnoDB`, `utf8mb4`. Foreign keys + indexes on every relation; unique constraints as noted; timestamps on all entities.

**Identity & access**
- `Role` (id, name unique: CUSTOMER, ADMIN; extensible) — 1 user : N roles via `UserRole`
- `User` (email unique, passwordHash, passwordSalt, name, phone?, emailVerifiedAt, isActive, timestamps)
- `Session` (id, userId FK, tokenHash unique, ip, userAgent, expiresAt, revokedAt) — hashed tokens only
- `PasswordResetToken` (userId, tokenHash unique, expiresAt, usedAt)
- `Address` (userId FK, label, line1, line2?, city, state, pincode, country, phone, isDefault) — ownership checked server-side

**Catalog**
- `Category` (slug unique, name, description, imageUrl, sortOrder, isActive)
- `Product` (slug unique, categoryId FK, name, shortDescription, description, materials?, careInstructions?, status enum: DRAFT/ACTIVE/ARCHIVED, isFeatured, isNewArrival, isBestSeller, timestamps)
- `ProductVariant` (productId FK, sku unique, name e.g. "Size 16in / Natural Black", price DECIMAL, compareAtPrice?, weightGrams?, isActive)
- `ProductImage` (productId FK, url, altText, sortOrder) — multiple per product, first is primary
- `InventoryItem` (variantId FK unique, quantityOnHand INT, quantityReserved INT, lowStockThreshold INT)
- `StockMovement` (inventoryItemId FK, delta INT, reason enum: PURCHASE/ORDER_RESERVE/ORDER_COMMIT/ORDER_RELEASE/MANUAL_ADJUST, referenceType?, referenceId?, note?, createdByUserId?, createdAt) — full history, append-only

**Shopping**
- `Cart` (id, userId FK unique nullable, sessionKey unique for guests, status) + `CartItem` (cartId FK, variantId FK, quantity, addedAt; unique(cartId, variantId)) — prices always recomputed server-side, never trusted from client
- `WishlistItem` (userId FK, productId FK, unique(userId, productId))
- `Coupon` (code unique, type enum PERCENT/FIXED, value DECIMAL, minSubtotal, maxDiscountAmount?, startsAt, endsAt, usageLimit, perUserLimit, timesUsed, isActive)
- `CouponRedemption` (couponId, orderId, userId?, amount)

**Orders & fulfillment**
- `Order` (orderNumber unique human-readable e.g. STL-2026-000123, userId FK, status enum: PENDING/PENDING_PAYMENT/CONFIRMED/PROCESSING/SHIPPED/DELIVERED/CANCELLED — controlled transitions only, subtotal, discountTotal, shippingFee, taxTotal?, grandTotal, currency, idempotencyKey unique, timestamps, cancelledReason?)
- `OrderItem` (orderId FK, variantId FK nullable-set, **preserved snapshot**: productName, variantName, sku, unitPrice, quantity, lineTotal) — never joins to catalog for historical truth
- `Payment` (orderId FK, method enum: PENDING_CONFIRMATION/GATEWAY, status enum: AWAITING/PENDING_VERIFICATION/VERIFIED/FAILED/REFUNDED, providerRef?, verifiedAt?, amount, payloadJson for raw webhook evidence)
- `Shipment` (orderId FK, carrier?, trackingNumber?, shippedAt?, deliveredAt?, status)
- `ShippingRate` (name, kind enum FLAT/WEIGHT_BASED/PINCODE_ZONE, baseFee, perKgFee?, freeAboveSubtotal?, zonesJson, isActive)

**Content & ops**
- `HomepageBanner` (title, subtitle, imageUrl, ctaLabel, ctaHref, sortOrder, isActive)
- `SiteSetting` (key unique, valueJson) — address, phones, socials, shipping promises, currency, policy text versions
- `AuditLog` (id, actorUserId?, action, entityType, entityId, metadataJson (sanitized), ip, createdAt) — sensitive actions only
- `WebhookEvent` (provider, eventId unique, signature, processedAt, status) — idempotent payment event processing

**Indexes:** FKs, `Product.status+categoryId`, slugs, `Order.userId+createdAt`, `Order.status`, session token hashes, coupon code lookups.

**Concurrency rules:** checkout runs in a single serializable transaction — validate cart → recompute totals server-side → reserve stock (increment `quantityReserved`) → create order+items+payment(AWAITING) → consume idempotency key; unique `(idempotencyKey)` blocks duplicate submissions. Payment verification commits reservation (`onHand -= reserved`) or releases it (timeout/cancel). No client-trusted prices, stock, or statuses at any point.

---

## 4. API Conventions

- Next.js Route Handlers under `src/app/api/*`: REST-shaped (`/api/products`, `/api/cart/items`, `/api/orders`, `/api/admin/products`…).
- JSON envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message, fields? } }`; stable machine codes (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `OUT_OF_STOCK`, `RATE_LIMITED`…).
- Every handler: Zod-parsed input → authn/authz guard → service layer (transactions where money/stock move) → envelope.
- Mutating requests: origin check + SameSite=Lax cookie + CSRF token on state-changing forms; admin mutations additionally write audit logs.
- Rate limiting: login, register, password reset, checkout, review-ish endpoints (in-memory limiter keyed by IP + identity).
- Uploads: server-validated MIME + magic-byte sniff, size cap, randomized object names, served through `next/image`-optimized static route.

## 5. Security Architecture (built-in, not bolted on)

- Passwords: scrypt (N=16384, r=8, p=1, 32-byte key, per-user salt), timing-safe compare; sessions: 32-byte random tokens, stored only as SHA-256 hashes, rotated on login, absolute + idle expiry.
- Cookies: httpOnly, Secure (in production), SameSite=Lax, signed attributes where applicable.
- RBAC middleware: `requireRole('ADMIN')` on every `/api/admin/*` and `/admin/*`; customers can never reach admin APIs; ownership checks on addresses/orders/wishlist (server-side user scoping, no IDOR).
- SQL injection: Prisma parameterized queries only; no raw string interpolation.
- XSS: React auto-escaping; no `dangerouslySetInnerHTML` except admin-approved rich text passed through sanitization.
- Security headers via middleware: CSP, HSTS (prod), X-Content-Type-Options, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy.
- Errors: structured server logs (no secrets/PII in messages), safe generic client messages.
- Never stored/transmitted: raw card data. Payment provider tokenizes; we persist only provider references and verified amounts.

## 6. Theme & Design System

- `next-themes`: **light default**, full dark theme, persisted preference, `system` when unset, no flash (class strategy + inline script).
- Tokens (globals.css): champagne gold accents, ivory/cream surfaces, charcoal text; dark theme uses warm charcoal (not pure black) with gold accents tuned for AA contrast.
- Type: serif display (headings/wordmark) + humanist sans (UI) + tabular numerals for prices.
- Components: consistent radius/shadow/spacing scale; skeleton loaders for every async surface; empty states with recovery actions; keyboard-visible focus rings; `prefers-reduced-motion` respected; 44px touch targets.

## 7. Environment Variables (`.env.example`, never committed with values)

`DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`, `APP_URL`, `PAYMENTS_ENABLED=false`, `PAYMENT_PROVIDER=`, `PAYMENT_KEY_ID=`, `PAYMENT_KEY_SECRET=`, `PAYMENT_WEBHOOK_SECRET=`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` (used once by seed to create the first admin, then rotated), `UPLOAD_MAX_MB`, `RATE_LIMIT_*`.

## 8. Known Deviations & Decisions (documented, reversible)

1. **React Router → Next.js file-system routing** (inherent to Next.js; feature-equivalent).
2. **Prisma 6 (not 7)** for mature MySQL tooling; upgrade path documented.
3. **MariaDB as dev MySQL stand-in** (rootless sandbox); production target MySQL 8.
4. **Custom sessions instead of NextAuth** for strict RBAC/audit control.
5. **Payments disabled** until merchant credentials exist; truthful pending-payment flow in the meantime.
