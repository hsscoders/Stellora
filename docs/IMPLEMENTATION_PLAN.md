# Stellora — Phased Implementation Plan & Checklist

**Protocol:** Each phase ends with a completion report (files changed, functionality, API/DB changes, security measures, tests executed with actual results, known limitations, next step). A phase is not "done" until every acceptance criterion below is verified by execution. Critical failures block phase transitions.

---

## Phase 2 — Architecture (drafted in Phase 1 deliverables)
- [x] Project structure, frontend/backend boundaries, API conventions (`docs/ARCHITECTURE.md` §2, §4)
- [x] Database schema design + migration strategy (§3)
- [x] Auth, authorization, theme, error-handling patterns (§5, §6)
- [x] Implementation checklist (this document)
- [ ] Ratify decisions with owner (flagged items in audit §4)

## Phase 3 — Foundation
- [ ] Next.js 16 + TS app scaffolded **inside this repository**; workspace launcher delegates dev server
- [ ] Portable MariaDB provisioned (scripts/db-up.sh, db-down.sh), `DATABASE_URL` wired, connectivity health check passes
- [ ] Prisma schema v1 (all entities §3) + first migration + dev-only seed (labelled fictional)
- [ ] Env validation (Zod), `.env.example`, secrets excluded from git
- [ ] Design tokens: champagne gold / ivory / charcoal, light default + full dark mode via next-themes, serif display + sans UI fonts
- [ ] Core layout: header (mega-nav, search, cart, theme toggle), sticky footer, mobile sheet nav
- [ ] `middleware.ts`: security headers; `/api/health` returns DB status
- [ ] Test harness runnable (Vitest); CI-able `lint`, `typecheck`, `test` scripts
- **Accept:** app boots on :3000 with Stellora tokens; `db:push`/migrate works against MariaDB; health check green; lint+typecheck clean; theme toggle persists.

## Phase 4 — Customer Storefront
- [ ] Homepage: hero, featured collections, new arrivals, best sellers, promo section, brand story (banner-driven)
- [ ] Shop All + 4 category pages: pagination, sorting, filters (price, availability), category nav
- [ ] Product details: gallery with zoom, variants, price/availability, details accordion, quantity stepper, related products
- [ ] Search: results, filters, empty state with suggestions
- [ ] Cart: add/update/remove, server-recomputed totals, stock validation, guest cart (session key) → merges on login
- [ ] Wishlist (authenticated)
- [ ] Per page: skeleton loaders, empty states, error recovery, both themes, responsive layouts
- **Accept:** every page browser-verified (Agent Browser) for render + interaction; product data served from MariaDB through Prisma; no client-trusted prices.

## Phase 5 — Accounts & Orders
- [ ] Register / login / logout / forgot+reset password (rate-limited, Zod-validated, scrypt hashes, session rotation)
- [ ] Account dashboard: profile, addresses (CRUD, default), order history, order detail
- [ ] Checkout: address selection/creation, shipping rate from DB, coupon validation server-side, totals recomputed server-side
- [ ] Order creation: single serializable transaction — stock reservation, idempotency key, snapshot pricing in OrderItem
- [ ] Payment: truthful "Pending payment / Pay on confirmation" flow; gateway module behind env flag (webhook HMAC verify + `WebhookEvent` idempotency) — disabled until credentials exist
- [ ] Order confirmation page reads verified server state only
- [ ] Track order: server-backed status timeline; no fabricated statuses
- [ ] Duplicate-submission + oversell tests (concurrent checkout)
- **Accept:** concurrent double-checkout yields exactly one order; oversell impossible; unauthorized order access blocked (ownership tests pass).

## Phase 6 — Admin Panel
- [ ] Guard: role check on `/admin/*` + `/api/admin/*`; customer tokens rejected (verified by tests)
- [ ] Dashboard: sales/orders/revenue/inventory summaries (DB-backed figures)
- [ ] Products: CRUD + archive + safeguards (deletion blocked when order history exists), variants, images (validated uploads)
- [ ] Categories management; inventory with low-stock alerts + stock movement history
- [ ] Orders: list/detail with controlled status transitions (state machine), payment status visibility
- [ ] Customers: read + deactivate only (privacy-preserving; no password access)
- [ ] Coupons CRUD with server-side validation; shipping rates config
- [ ] Homepage banners/featured content management; site settings
- [ ] Admin users + role assignment; audit log for every sensitive mutation
- [ ] Reports: revenue by period, top products, low stock (accurate SQL aggregates)
- **Accept:** unauthorized access tests fail-closed; every admin mutation audited; revenue figures reconcile with seeded orders.

## Phase 7 — Quality & Release
- [ ] `lint` + `typecheck` + unit/integration suite green (real executed results reported)
- [ ] Production build passes; standalone server boots
- [ ] E2E: browser flows (best-effort in sandbox; fallback API-level E2E documented if rootless browser libs missing)
- [ ] Both themes × 3 breakpoints visual pass; reduced-motion respected
- [ ] Security checklist: rate limits fire, ownership checks, admin guard, upload rejections, headers present, no secrets in logs
- [ ] `npm audit` reviewed; dependencies pinned
- [ ] Docs: README setup, migrations, seed, test accounts, env reference, deployment notes
- **Accept:** all checks executed with reported results; unresolved items explicitly listed.

---

## Completion-Report Template (per phase, per user §10)
1. Files created/modified 2. Functionality implemented 3. API endpoints + DB changes 4. Security & validation measures 5. Tests executed + actual results 6. Known limitations/missing config 7. Next recommended step

## Standing Rules
- English-only UI; light default + complete dark mode; no Hindi/Hinglish anywhere.
- No fake success states, no fabricated business data, no secrets in repo.
- Unknowns stay configurable and flagged (audit §4).
- Every claim of "working" is backed by an executed check.
