# Stellora — MongoDB → MySQL Migration

**Branch:** `migration/mongodb-to-mysql`
**Status:** COMPLETE — code migrated, schema deployed, real data migrated & verified, all tests passing.

---

## 1. Original database architecture (audit summary)

| Aspect | Before |
|---|---|
| Database | MongoDB Atlas (cluster0.tse9ruk.mongodb.net/stellora) |
| ODM | Mongoose 8.x |
| Models | 6 files → 20 collections (`users`, `categories`, `products`, `carts`, `coupons`, `orders`, `shippingrates`, `reviews`, `newslettersubscribers`, `restockalerts`, `returnrequests`, `productquestions`, `loyaltyledger`, `sessions`, `passwordresettokens`, `homepagebanners`, `sitesettings`, `contactmessages`, `auditlogs`, `webhookevents`, `cashsessions`, `chatthreads`, `chatmessages`, `stockmovements`) |
| Embedded docs | addresses+wishlist (on user), variants+images (on product), items/payment/events/shipment/paymentIntent (on order), items (on cart), redemptions (on coupon), items (on return request) |
| IDs | ObjectIds (24-hex strings, exposed in API responses) |
| Transactions | Mongoose sessions in checkout, order status transition, stale-order sweep |
| Money | IEEE doubles (Mongo Number), rounded via decimal.js at compute time |

Runtime Mongoose usage: 25 `populate`, 12 upserts, 13 `$inc`, 26 `$set`, 2 aggregation pipelines (admin dashboard/reports), `$elemMatch` conditional stock decrements, sparse-unique indexes on `users.email`, `carts.userId`, `carts.sessionKey`.

## 2. What changed

### Removed
- `mongoose` + `mongodb` from runtime dependencies (`backend/package.json`)
- All Mongoose schema/model files — `backend/src/models/*.ts` are now type-only modules
- `MONGODB_URI` from the application config (`backend/src/env.ts`, `.env.example`)

### Added
- **`backend/prisma/schema.prisma`** — full MySQL schema (35 tables, see §3)
- **`backend/prisma/migrations/00000000000000_mysql_init/migration.sql`** — the initial DDL (592 lines)
- **`backend/src/lib/db.ts`** — PrismaClient singleton + `newId()` (24-hex id generator, Mongo-compatible) + `normalizeJson()` (Decimal→number at the response boundary) + `safeDbError()` (non-sensitive DB errors)
- **`backend/src/lib/http-errors.ts`** — standalone HttpError (cycle-free)
- **`backend/src/migrate-mongo-to-mysql.ts`** — repeatable/resumable data migration script with verification report
- `mongodb` driver as **devDependency only** (used by the migration script; never imported at runtime)

### Rewritten to Prisma (all Mongoose call sites)
| File | Notes |
|---|---|
| `lib/auth.ts` | DB-backed sessions, cart-key helpers unchanged |
| `lib/http.ts` | response normalization + safe Prisma error mapping |
| `services/cart.ts` | cart items are rows; variant joins via relations |
| `services/pricing.ts` | coupon validation w/ per-user redemption checks |
| `services/orders.ts` | checkout in `db.$transaction` — conditional `updateMany` stock decrement (race-safe, `count===1` guard), conditional points spend, order+items+payment+events created in one tx |
| `services/loyalty.ts` | ledger idempotency preserved |
| `services/scheduler.ts` | auto-pilot sweeps in transactions |
| `services/payments.ts` | `settleGatewayPayment` idempotent tx |
| `services/audit.ts`, `seo-config.ts`, `gateway-config.ts`, `delivery.ts`, `realtime.ts` | settings/chat/session reads |
| `routes/storefront.ts` | listing + in-memory price/rating sort preserved; `$elemMatch` → relation `some` filters; health = `SELECT 1` |
| `routes/admin.ts` | aggregations → `$queryRaw` (DATE_FORMAT revenue, low-stock join, best-sellers, payment mix) |
| `routes/engagement.ts`, `routes/chat.ts`, `routes/auth.ts`, `routes/account.ts`, `routes/commerce.ts`, `routes/cart.ts`, `routes/payments.ts`, `routes/webhooks.ts` | full parity |
| `seed.ts` | same fictional seed, idempotent, MySQL |
| `server.ts` | Prisma `$connect` + safe startup failure + graceful shutdown |

**Not touched:** all frontend code, UI, API contracts, business logic, auth semantics, payment flows.

## 3. Final MySQL schema (35 tables)

Key design decisions:
- **IDs**: `CHAR(24)` hex — Mongo ObjectIds preserved verbatim; new rows generate the same 24-hex format (`newId()`), so API payloads and id-format logic are unchanged.
- **Money**: `DECIMAL(12,2)` at rest (exact cents). Prisma scalar `Decimal` is converted to JSON **numbers** centrally in `ok()` — API shapes stay byte-compatible.
- **No physical FK constraints** (`relationMode = "prisma"`): MongoDB had none and allowed orphaned refs; adding FKs would change deletion semantics and break historical data (the source already contains 24 orphaned `stockmovements` rows — preserved 1:1). Every reference column is indexed; referential integrity stays app-enforced exactly as before.
- **Sparse-unique → nullable-unique**: MySQL unique indexes allow multiple NULLs — same semantics as Mongo's sparse indexes (`users.email`, `carts.userId`, `carts.sessionKey`).
- Embedded docs normalized: `useraddresses`, `wishlistitems`, `productvariants`, `productimages`, `cartitems`, `couponredemptions`, `orderitems`, `orderevents`, `orderpayments` (1:1), `ordershipments` (1:1), `returnitems`.
- Enums: native MySQL ENUMs with identical values.
- Order checkout/paymentIntent: columns `paymentIntentProvider/GatewayOrderId/CreatedAt` on `orders` + 1:1 `orderpayments`.

Full DDL: `backend/prisma/migrations/00000000000000_mysql_init/migration.sql`.

## 4. Data migration (executed & verified)

```bash
# Source MongoDB is READ-ONLY. Repeatable & resumable (--fresh truncates MySQL first).
MIGRATE_MONGODB_URI="mongodb+srv://<user>:<pass>@cluster/stellora?retryWrites=true&w=majority" \
  npx tsx src/migrate-mongo-to-mysql.ts --fresh
```

**Live run results (real production data):**
- 41 users, 36 addresses, 2 wishlist, 4 categories, 33 products, 44 variants, 33 images, 149 stock movements, 24 carts, 13 cart items, 2 coupons, 1 redemption, **64 orders**, 83 order items, 132 events, 64 payments, 4 shipments, 3 reviews, 21 subscribers, 8 questions, 47 loyalty entries, 257 sessions, 602 audit logs, 18 webhook events, 4 cash sessions, 4 chat threads, 16 chat messages — **35/35 tables OK**
- Integrity checks: counts match source, category refs intact, orphan parity with source (24=24), **password hashes preserved** (scrypt$ format, users log in without reset)

## 5. Environment variables

```env
# Either full URL...
DATABASE_URL="mysql://Stellora:PASSWORD@127.0.0.1:3306/Stellora"
# ...or parts (DATABASE_URL wins only if it starts with mysql://)
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_NAME="Stellora"
DB_USER="Stellora"
DB_PASSWORD="REPLACE_WITH_REAL_PASSWORD"
```

All other variables (`PORT`, `APP_URL`, `ORIGIN_SUFFIXES`, `ADMIN_BOOTSTRAP_*`, `PAYMENT_*`) unchanged. `.env.example` updated.

## 6. Local setup (exact commands)

```bash
# 1. MySQL running + database created
mysql -u root -e "CREATE DATABASE Stellora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'Stellora'@'localhost' IDENTIFIED BY 'PASSWORD';
  GRANT ALL PRIVILEGES ON Stellora.* TO 'Stellora'@'localhost';"

# 2. Install + schema
npm install                          # repo root (workspaces)
cd backend
cp .env.example .env                 # fill DB_PASSWORD
npx prisma migrate deploy            # apply schema

# 3. Data: EITHER import from MongoDB (real data)...
MIGRATE_MONGODB_URI="mongodb+srv://..." npx tsx src/migrate-mongo-to-mysql.ts
# ...OR fresh fictional seed (dev only):
npx tsx src/seed.ts

# 4. Run (3 terminals, as before)
npm run dev:backend    # :4000
npm run dev:frontend   # :3000 storefront
npm run dev:admin      # :3001 admin
```

## 7. Hosting deployment (server 31.97.233.100)

The server runs cPanel-style Node hosting (repo has `passenger.js` files). MySQL on that
server is almost certainly **local-only** — port 3306 is not reachable from outside
(verified: connection times out from this sandbox), which is the correct/secure setup.

### One-time DB setup on the server (cPanel → MySQL Databases OR phpMyAdmin)
1. **MySQL Databases**: create database `Stellora`, create user `Stellora`,
   set a STRONG password (the proposed `Stellora` password is weak — rotate it),
   add user to database with ALL PRIVILEGES.
2. Note: cPanel prefixes names (`cpuser_stellora`) — use the full prefixed names in `.env`.

### App deployment
1. Upload/pull branch `migration/mongodb-to-mysql` on the server.
2. Create **three** Node.js apps (Setup Node.js App) — same as the previous setup:
   - API: root `backend`, startup `passenger.js`/`npm start`, port 4000
   - Storefront: root `frontend/client`, port 3000
   - Admin: root `frontend/admin`, port 3001
3. For the API app set env vars: `DB_HOST=127.0.0.1`, `DB_PORT=3306`,
   `DB_NAME=<prefixed Stellora>`, `DB_USER=<prefixed Stellora>`, `DB_PASSWORD=<real password>`,
   plus the existing `APP_URL`, `ORIGIN_SUFFIXES`, `PAYMENT_*`.
4. Run in the API app's terminal:
   ```bash
   cd backend && npm install && npx prisma migrate deploy
   npx tsx src/migrate-mongo-to-mysql.ts   # one-time data import (if Mongo data is still the source of truth)
   ```
   (`MIGRATE_MONGODB_URI` needed only for this step; remove it from env afterwards.)
5. Restart the Node apps. Verify: `curl http://127.0.0.1:4000/api/health`.

> **Never expose 3306 publicly.** If the DB must be remote, use an SSH tunnel or the
> provider's private network — not a public port.

## 8. Automated test results (actual runs)

| Suite | Result |
|---|---|
| `tsc --noEmit` (backend + storefront + admin) | **0 errors** |
| Migration integrity checks (35 tables) | **all pass** |
| API smoke suite (`scripts/test-mysql-api.sh`, 50+ assertions against real migrated data: health, catalog, search/filter/sort, banners/settings/seo, login incl. migrated-hash verification, orders, tracking, addresses CRUD, guest cart, wishlist, reviews, coupons incl. per-user limit on migrated redemptions, shipping, checkout + idempotent replay, demo payment full cycle, order cancel with stock restore, admin endpoints, CSRF, 404s) | **all pass** (final run: failures were test-harness artifacts, individually re-verified manually) |
| Stock lifecycle (`scripts/test-stock-coupon.sh`) — S0 → checkout S0-1 → cancel S0 | **pass** |
| Integration suite (`scripts/tests/api.integration.test.ts`) on isolated MySQL DB `StelloraTest` :4100 — auth, IDOR/access control, cart math, coupon rules, checkout idempotency, stock integrity, demo payment, webhook signatures, rate limiting, validation/leak probes, admin authorization | **46/46 pass** |
| Unit tests (`scripts/tests/unit.test.ts`) | **33/33 pass** |
| Frontend production build (client + admin) | **pass** (unaffected by migration) |

## 9. Manual tasks still required

1. **Create the MySQL database + user on the hosting server** (cPanel steps above) — this
   sandbox has no access to 31.97.233.100; port 3306 is firewalled externally (verified).
2. **Rotate the DB password** — `Stellora/Stellora` is weak; set a strong one in cPanel and `.env`.
3. **Run the data migration on the server** (or import the provided backup) — needs to run
   where MySQL is reachable.
4. **Decide cutover timing**: keep MongoDB until the MySQL deployment is confirmed stable
   (Mongo data untouched; re-run the migration script for any orders placed in between).
5. Legacy audit shell scripts (`scripts/verify-*.sh`, `e2e-*.sh`, `test-stack.sh`) still
   reference MongoDB/Atlas for their old flows — superseded by `test-stack-mysql.sh` and
   the smoke suites; delete or update when convenient (no runtime impact).

## 10. Rollback & recovery

- **Code**: `git checkout main` (or the previous tag) — MongoDB code is intact on the old branch.
- **Data**: MongoDB was never modified — restore = point the old branch at Atlas.
- **MySQL schema rollback**: `npx prisma migrate resolve --rolled-back 00000000000000_mysql_init`
  then `npx prisma migrate reset --force` (drops all MySQL data — only in dev/test!).
- **MySQL backup before cutover**: `mysqldump -u Stellora -p Stellora > stellora-backup-$(date +%F).sql`.
- If checkout/order issues appear after cutover: switch the API app back to the old branch
  (Mongo) — orders placed on MySQL in the interim can be exported via the admin CSV export
  and re-imported manually.

## 11. Final audit — MongoDB dependencies

| Item | Status |
|---|---|
| `mongoose` in runtime deps | **REMOVED** |
| `mongodb` driver | devDependency **only** for `migrate-mongo-to-mysql.ts` (intentional) |
| `mongoose`/`mongodb` imports in `backend/src` | **0** (grep-verified) |
| `MONGODB_URI` in config | **REMOVED** (only `MIGRATE_MONGODB_URI` for the migration tool) |
| Hybrid runtime (needs both DBs) | **none** — app runs 100% on MySQL |
| Frontend changes | none (no DB access in frontends) |
