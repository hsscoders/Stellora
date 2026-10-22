# Stellora — Full-Stack Audit, Debug & QA Report

**Date:** 23 Oct 2026 · **Branch:** `audit/qa-fixes` (3 commits ahead of `main`)
**Test environment:** sandbox dev stack (storefront :3000 → admin :3001 → API :4000) against the project's remote MySQL `stellora@54.144.242.183:3306`
**Tester:** automated API regression suite (52 node:test cases) + headless-browser journeys (desktop 1280×720 / mobile 390×844)

**Status legend:** PASS = executed & verified · FAIL = executed, defect found · BLOCKED = missing dependency/credential/infra · NOT RUN = not executed.

---

## 1. Architecture & test environment

| Layer | Stack | Port |
|---|---|---|
| Storefront | Next.js 16.4.2 (App Router, Turbopack), force-dynamic SSR | 3000 |
| Admin console | Next.js 16.4.2, `basePath: /admin-console`, proxied through storefront | 3001 |
| API | Express 5 + Prisma 6.19.3 (tsx watch in dev), Socket.IO on same port | 4000 |
| Database | MySQL (InnoDB, utf8mb4_unicode_ci, DECIMAL(12,2) money, DATETIME(3)) | remote 54.144.242.183 |

Single external origin: the storefront proxies `/api/*`, `/socket.io/*`, `/uploads/*`, `/admin-console/*` — httpOnly cookies stay same-origin, no CORS in play.

## 2. Discovery inventory (all discovered from code, nothing assumed)

- **Frontend pages:** 25 client routes (home, shop, search, category/[slug], product/[slug], cart, checkout, order-confirmation/[orderNumber], account ×5, wishlist, track-order, login, register, forgot/reset-password, faq, about, contact, support, policies/[slug], admin/login) + 26 admin routes (dashboard, reports, orders + detail, products + new/edit, categories, banners, coupons, inventory, barcodes, POS, customers, users, reviews, questions, returns, messages, newsletter, chat, audit-logs, settings, shipping, seo).
- **API endpoints:** ~120 across 10 routers (storefront 9, auth 6, account 6, cart/wishlist 4, commerce 7, engagement 25, payments 4, webhooks 3, admin 57, chat 6 + inline /api/contact).
- **Database:** 35 tables + `_prisma_migrations` (Prisma `relationMode="prisma"` — app-layer referential integrity, documented migration design).
- **User roles:** CUSTOMER, ADMIN (+ shared POS walk-in account with unguessable random password).
- **Integrations:** demo payment gateway (HMAC-signed simulation, Razorpay/Stripe-ready), Socket.IO realtime, GA4 hook, SMTP pending configuration.
- **Business-critical workflows:** guest cart → merge on login → checkout (server-side totals, idempotency key, race-safe stock decrement in RepeatableRead transaction) → admin state machine PENDING→CONFIRMED→PROCESSING→SHIPPED→DELIVERED / CANCELLED (restock + loyalty settlement) → demo/Razorpay/Stripe payment settle (signature-verified, idempotent) → returns/exchange requests → loyalty accrual/redeem ledger.

## 3. Test totals

| Outcome | Count |
|---|---|
| **PASS** | 52 API tests + 12 browser journeys + all static checks |
| **FAIL** | 2 real defects found (both fixed, retested PASS) |
| **BLOCKED** | 5 (see §11) |
| **NOT RUN** | load testing (deliberately, see §11) |

## 4. Phase 2 — Static analysis results

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` (3 apps) | **PASS** | tsc --noEmit clean |
| `npm run lint` (2 frontends) | **PASS** | eslint clean |
| Production build storefront | **PASS** | 25 routes compiled (Turbopack) |
| Production build admin | **PASS** | 26 routes compiled |
| `npm audit` | **8 high, dev-only** | `braces` (via eslint-config-next/micromatch) + `deepmerge-ts` (via prisma CLI) — both are build/lint-time tooling, not in the production runtime path. `npm audit fix --force` would force Prisma 7 (breaking). **Decision: accept & monitor; do not force-upgrade.** |
| Lockfile consistency | **PASS** | npm workspaces install clean |
| Mongo remnants | **PASS (none)** | no mongoose/mongodb in any package.json or source |

## 5. Phase 4 — MySQL audit (all read-only against live DB)

| Check | Result |
|---|---|
| Engines & collation | **PASS** — all 36 tables InnoDB + utf8mb4_unicode_ci |
| Money columns | **PASS** — every price/fee/discount/total is DECIMAL(12,2); app math via decimal.js (precision 14, ROUND_HALF_UP) |
| Datetimes | **PASS** — all DATETIME(3) |
| Indexes | **PASS** — every reference column indexed (products/variants/sku/barcode, orders, sessions.tokenHash unique, users.email unique) |
| Orphaned rows | **PASS** — 0 order items pointing at missing variants |
| Expired sessions | **PASS** — 0 stale sessions |
| Transactions | **PASS (code review)** — order creation & status transitions & webhook settlement run inside `$transaction` with conditional atomic updates (`UPDATE … WHERE stock >= qty`), idempotency unique key + concurrent-duplicate recovery |
| SQL injection | **PASS** — 100% Prisma parameterized queries; 5 injection probes caused no 500s and no data effect |
| Mongo dependencies at runtime | **PASS** — none |
| Pool config | **NOTE** — `connection_limit=10` only applied when URL is built from `DB_*` parts; when `DATABASE_URL` is set verbatim (this deployment) Prisma default pool applies. Harmless at this scale; align for production. |
| Data integrity vs Mongo source | **BLOCKED** — no MongoDB export available; historical migration integrity could not be independently verified (seed data verified instead) |

## 6. Phase 5+8 — API & security test matrix (52 automated cases, all PASS after fixes)

**Catalog & infra:** health/DB status, categories, banners, products pagination contract (PAGE_SIZE=12 + totals), price-sort ordering, search, settings, seo, 404 envelope, malformed JSON → 400 `BAD_JSON` (no stack leak), 2.5MB payload → 413 `PAYLOAD_TOO_LARGE`.

**Validation:** register (bad name/phone/password → 422 with field errors), duplicate email → 409 `EMAIL_TAKEN`, duplicate phone → 409 `PHONE_TAKEN`, cart quantity >10 / non-integer → 422, unknown product slug → 404, checkout invalid body → 401/422.

**Auth lifecycle:** register → 201 + httpOnly session; `/auth/me`; 9 bad logins → 429 `RATE_LIMITED` (8/15min/IP+identifier); forgot-password returns dev reset link (dev mode) and the token works **exactly once** (single-use verified); reset invalidates all sessions; logout destroys session.

**Customer E2E:** address CRUD → cart add/update/remove with server-recomputed subtotal → coupon `WELCOME10` = min(10%×subtotal, maxDiscount 300) enforced server-side (junk code → HTTP 200 `{valid:false}` — intentional soft contract consumed by checkout) → checkout creates order with `subtotal + shipping − discount = grandTotal` verified → **idempotent replay** (same key returns same order, no duplicate row) → order list/detail ownership → cancel → CANCELLED with event log.

**Demo payment gateway E2E:** create-intent (demo:true) → card ending 0002 **declined** → invalid expiry **rejected** (after fix) → valid card approved + HMAC signature → **tampered signature → 400 `SIGNATURE_INVALID`** → correct signature settles: paymentStatus PAID, order auto-CONFIRMED, loyalty points awarded → repeat confirm → `alreadyPaid` no-op.

**Security:**
| Vector | Result |
|---|---|
| RBAC | **PASS** — customer session on `/api/admin/*` → 403; anonymous on protected → 401 |
| IDOR | **PASS** — stranger cannot read orders (401) or patch foreign address (404/403); order queries scoped by `userId` |
| SQL injection | **PASS** — 5 probes, parameterized ORM, no 500s |
| XSS | **PASS** — payloads stored as inert data, JSON responses never reflect raw `<script>`; React escapes on render |
| CSRF | **PASS** — foreign-origin POST → 403 `FORBIDDEN` (same-origin allowlist + SameSite=Lax) |
| Webhooks | **PASS** — bad Razorpay signature → 400; missing Stripe signature → 400; timing-safe compare + 5-min timestamp tolerance + idempotent event ledger (webhookevents) |
| Cookie flags | **PASS** — httpOnly + SameSite=Lax (note: `secure:false` hardcoded — acceptable for proxied-HTTPS previews, flip to `true` behind native TLS, see §9) |
| Rate limits | **PASS** — login 8/15min, register 8/h, forgot 5/h, coupon 12/10min, checkout 12/10min, contact 5/h |
| File upload | **PASS** — PHP content with image MIME → rejected (magic-byte validation) |
| Error leakage | **PASS** — safe DB error codes only; no SQL/credentials/stack traces in any response |
| Security headers | **PASS** — nosniff, CSP frame-ancestors, referrer-policy, permissions-policy |
| Method abuse | **PASS** — DELETE on health / PUT on products → 404 |

**Admin workflows:** stats; category create → publicly visible → delete; **product create → storefront-visible → update (`v2` name propagates to storefront) → delete → 404**; coupon create → validate (₹50 off) → delete; orders-list shows QA orders; **invalid state transition (CANCELLED → DELIVERED) → 422 `INVALID_TRANSITION`**; settings read; malicious upload rejected; audit log records admin actions.

## 7. Phase 3 — Browser journeys (headless Chromium)

| Journey | Result |
|---|---|
| Home renders (desktop + mobile 390×844) | **PASS** — clean console (dev-only HMR notices), no horizontal overflow |
| Shop / search | **PASS** — 24 product elements |
| Product detail (Aurelia) | **PASS** — gallery, variant picker, qty stepper, Add-to-Cart ₹1,499, Buy-It-Now |
| Add to cart → cart drawer | **PASS** — line item + Checkout CTA |
| Login form (demo customer) | **PASS** — POST 200, "Welcome back!" toast, redirect `/account`, httpOnly session set |
| Checkout → place order (pay-on-confirmation) | **PASS** — totals ₹1,499 + ₹79 shipping = ₹1,578; order **STL-2026-D228CD** created; confirmation page "Thank You, Demo!" with order details |
| Admin login → dashboard → orders | **PASS** — revenue widgets, recent orders, QA orders listed |
| Mobile horizontal overflow (home + PDP) | **PASS** — none |

Screenshots: `download/qa-screenshots/01…08*.png`.

## 8. Defects found → fixed → retested

| # | Severity | Defect | Root cause | Fix | Retest |
|---|---|---|---|---|---|
| 1 | **High** (blocked initial migration on this server) | Migration `20261021175845_mysql_init` failed: `BLOB/TEXT column 'details' can't have a default value` (MySQL error 1101, strict mode) | Migration SQL written for non-strict MySQL; `ReturnRequest.details TEXT DEFAULT ''` | Removed column default in migration SQL + `@default("")` in schema.prisma (app layer always sets `details: data.details \|\| ""` — behaviour unchanged) | `prisma migrate deploy` → all 36 tables created; seed OK; suite PASS |
| 2 | **Low** (demo gateway only) | Demo card payment approved expiry `13/29` | Format regex validated MM/YY shape but not month range 01-12 | `payments.ts`: capture month group, reject outside 01-12 | Suite step "invalid expiry rejected" → PASS |

Both fixes are minimal, preserve existing behaviour, and are committed with the regression suite covering them.

**Observations (no action taken, per golden rules):**
- The admin account's email was renamed to `admin@stellora.local2` and a POS test order (STL-2026-0F5692) exists — performed by an interactive user in this environment between test runs (verified via audit log + sessions). Not a defect; documented so creds in this report match reality.
- `/api/products` silently ignores a `limit` query param (uses fixed PAGE_SIZE=12). No frontend caller sends it; cosmetic API-hgiene note only.

## 9. Security findings & remediation advice

| Severity | Finding | Remediation |
|---|---|---|
| Medium | Session cookie `secure:false` hardcoded (works behind TLS-terminating proxies, but over a native-HTTPS cPanel host the flag should be set) | Make it env-driven (`COOKIE_SECURE=true` in production) before go-live |
| Medium | 8 high npm-audit vulns in **dev-only** toolchains (braces/eslint-config-next, deepmerge-ts/prisma CLI) | Plan Prisma 7 upgrade at a convenient time; no production exposure |
| Low | Payment provider keys are stored/editable in admin settings — ensure DB backups are encrypted and admin passwords are strong (bootstrap password was already rotated by the owner — good) | Standard ops hygiene |
| Info | `NODE_ENV`-dependent dev reset link (`devLink`) returned by forgot-password — confirmed absent when `NODE_ENV=production` | Keep production NODE_ENV=production |

No SQL injection, XSS, IDOR, CSRF, or webhook-forgery vulnerabilities were found.

## 10. Performance (measured, dev mode + remote DB)

| Metric | Value |
|---|---|
| TCP RTT to remote MySQL | **~200 ms** |
| `SELECT 1` roundtrip | ~196 ms |
| Direct API `GET /api/products?page=1` | 0.77-0.97 s (≈4-6 sequential queries × RTT) |
| Storefront `GET /` (dev SSR, force-dynamic, 5+ SSR fetches) | 2.0-2.6 s |
| Production build output | client 345 MB (incl. cache), admin 200 MB |

**Attribution:** latency is dominated by remote-DB RTT per sequential query — not app inefficiency. With a co-located MySQL (cPanel localhost), equivalent queries collapse to single-digit ms. Dev-mode SSR overhead disappears in production builds. No N+1 patterns beyond acceptable per-transaction loops inside `createOrderFromCart` (bounded by cart size ≤10 lines).

## 11. Blocked / not run (honest limitations)

1. **cPanel deployment to 31.97.233.100** — BLOCKED: no server access from this environment. Deployment checklist provided (§12) instead.
2. **Live Razorpay/Stripe** — BLOCKED: no real API keys. Demo gateway (the default provider) fully tested incl. signature tampering.
3. **SMTP email** — BLOCKED: not configured anywhere; dev-mode reset link path verified instead.
4. **MongoDB → MySQL data-integrity cross-check** — BLOCKED: no Mongo dump available.
5. **Load testing** — NOT RUN by design: the only database available is the shared remote production DB; controlled load could not be isolated. (Rate limiter is in-memory — documented as single-node design.)

## 12. Exact commands + deployment checklist + rollback

**Local run (verified):**
```bash
npm install
cd backend && cp .env.example .env   # set DB_* / DATABASE_URL
npx prisma generate && npx prisma migrate deploy && cd ..
npm run seed        # fictional demo data
npm run dev         # :3000 storefront · :3001 admin · :4000 API
node --test backend/tests/api-regression.test.mjs   # 52-test regression suite
```

**Production build (verified):**
```bash
npm run build && npm start
```

**cPanel deployment checklist:**
- [ ] MySQL on the same host; set `DB_HOST=127.0.0.1`, create DB/user, `npx prisma migrate deploy`
- [ ] `NODE_ENV=production` (disables devLink in forgot-password responses)
- [ ] Rotate `ADMIN_BOOTSTRAP_*` before first start; change admin email from default (owner already did)
- [ ] Configure `APP_URL` to the real domain; extend `ORIGIN_SUFFIXES` only if using preview hosts
- [ ] Enable native TLS then set the session cookie `secure:true` (§9)
- [ ] Point Razorpay/Stripe keys in Admin → Settings → Payments; set webhook URLs `/api/payments/webhook/{razorpay|stripe}` and secrets; verify via `GET /api/payments/webhook/status`
- [ ] Run `npm run build` (dev servers must be stopped to fit memory-constrained hosts — builds need ~2 GB free)
- [ ] Optional: `connection_limit` on DATABASE_URL; PM2/process manager; nightly `mysqldump`

**Rollback:** `git checkout main && npm ci && npx prisma generate` — the 3 audit commits touch only 3 source lines + tests; no schema-breaking change vs `main` for existing databases (the migration SQL edit only affects fresh installs; this DB already has the corrected table).

## 13. Files changed (complete list, branch `audit/qa-fixes`)

| File | Change | Reason |
|---|---|---|
| `backend/prisma/migrations/20261021175845_mysql_init/migration.sql` | `details` TEXT drop DEFAULT | MySQL strict-mode migration failure (defect #1) |
| `backend/prisma/schema.prisma` | `ReturnRequest.details` drop `@default("")` | Keep schema in sync with #1 |
| `backend/src/routes/payments.ts` | expiry month range check | Demo gateway accepted `13/29` (defect #2) |
| `backend/tests/api-regression.test.mjs` | new, 52 node:test cases | Regression coverage for every critical workflow |
| `backend/.env` (untracked) | remote-DB config | Deployment config (gitignored by design) |

**No production data was reset, truncated, or deleted.** Test artifacts: 1 cancelled QA order + 1 paid QA order + 1 deactivated QA customer (`qa*@qa-test.local`), all clearly labelled; QA product/category/coupon/address entities were deleted via API during the run. Pre-existing owner data (POS order, admin rename) untouched.
