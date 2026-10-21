# Mongoose → Prisma (MySQL) Conversion Guide — Stellora Backend

Read these first:
- `backend/prisma/schema.prisma` — the FULL MySQL schema (model names, fields, types)
- `backend/src/lib/db.ts` — `db` (PrismaClient), `newId()`, helpers
- `backend/src/services/cart.ts`, `backend/src/services/orders.ts` — REFERENCE patterns (already migrated)

## Core rules

1. **Imports**: replace `import { User, Product, ... } from "../models"` with
   `import { db, newId } from "../lib/db"`. Types from "../models" (VariantDoc,
   AddressDoc, OrderItemDoc...) still exist — keep those imports.
2. **HttpError** import stays from `"../lib/http"` (it re-exports) or `"../lib/http-errors"`.
3. **Every `create()` MUST include `id: newId()`** — ids are Char(24) hex
   (Mongo ObjectId format). Rows without ids fail.
4. **`_id` → `id`** everywhere. `String(doc._id)` → `doc.id`. Ids are plain strings.
5. **Money fields are Prisma `Decimal`**: convert to number with `Number(x)`
   for arithmetic/comparisons/JSON payloads. The `ok()` response helper already
   deep-normalizes Decimal → number, so route responses can pass Prisma rows
   straight through. But any math in route code MUST use `Number(field)` first.
6. **Enums** are strings — values unchanged ("ACTIVE", "PENDING", ...).

## Query conversions

| Mongoose | Prisma |
|---|---|
| `User.findById(id)` | `db.user.findUnique({ where: { id } })` |
| `User.findById(id).select("a b")` | `db.user.findUnique({ where: { id }, select: { a: true, b: true } })` |
| `Model.findOne({ x: y })` | `db.model.findFirst({ where: { x: y } })` (or findUnique when `where` is a @unique field) |
| `Model.find({...}).sort({a:-1}).skip(n).limit(m)` | `db.model.findMany({ where: {...}, orderBy: { a: "desc" }, skip: n, take: m })` |
| `Model.create({...})` | `db.model.create({ data: { id: newId(), ... } })` |
| `Model.create([...])` / insertMany | `Promise.all` of creates (inside a transaction when related) or `createMany` |
| `Model.updateOne({ _id }, { $set: {...} })` | `db.model.update({ where: { id }, data: {...} })` |
| `Model.updateOne({_id}, {$inc: {n: 1}})` | `db.model.update({ where: { id }, data: { n: { increment: 1 } } })` |
| `Model.findByIdAndUpdate(id, data, { new: true })` | `db.model.update({ where: { id }, data })` (Prisma returns updated row) |
| `Model.deleteOne({ _id })` | `db.model.delete({ where: { id } })` |
| `Model.deleteMany({...})` | `db.model.deleteMany({ where: {...} })` |
| `Model.countDocuments({...})` | `db.model.count({ where: {...} })` |
| `Model.exists({...})` | `db.model.findFirst({ where: {...}, select: { id: true } })` (truthiness) |
| `.populate("userId", "name email")` | `include: { user: { select: { name: true, email: true } } }` — populated doc is at `.user`, NOT `.userId`. Adjust the code that reads the populated field. |
| `{ $or: [a, b] }` | `where: { OR: [a, b] }` |
| `{ $and: [...] }` | `where: { AND: [...] }` |
| `{ field: { $in: [...] } }` | `{ field: { in: [...] } }` |
| `{ field: { $ne: v } }` | `{ field: { not: v } }` |
| `{ field: { $gte/$lte/$gt/$lt: v } }` | `{ gte/lte/gt/lt: v }` |
| `{ field: { $regex: re, $options: "i" } }` | `{ contains: "text" }` (MySQL utf8mb4_unicode_ci is case-insensitive) |
| `{ field: { $exists: true } }` | `{ isSet: true }` / `{ isNull: false }`; `$exists: false` → `isNull: true` |
| `{ $expr: ... }` on numeric compare | compute the condition in JS after fetching, or use `$queryRaw` |
| upsert | `db.model.upsert({ where: <uniqueKey>, create: {...id: newId()}, update: {...} })` |

## Embedded documents → child tables (CRITICAL)

Mongo embedded arrays are now separate tables. Examples:

- `Product.updateOne({ _id, variants: { $elemMatch: { _id: vid, stock: { $gte: q } } } }, { $inc: { "variants.$[v].stock": -q } })`
  → `db.productVariant.updateMany({ where: { id: vid, productId, isActive: true, stock: { gte: q } }, data: { stock: { decrement: q } } })` → check `.count === 1`
- `Product.find({ "variants._id": { $in: ids } })`
  → `db.productVariant.findMany({ where: { id: { in: ids } }, include: { product: {...} } })`
- Pushing to `order.events` → `db.orderEvent.create({ data: { id: newId(), orderId, ... } })`
  (or nested `events: { create: [...] }` inside order create/update)
- `order.payment` embedded subdoc → relation `order.payment` (1:1 table `orderpayments`);
  include it; create via nested `payment: { create: { id: newId(), ... } }` or `db.orderPayment.upsert`
- `order.shipment` → 1:1 `db.orderShipment` (upsert pattern)
- `user.addresses` embedded array → `db.address.findMany({ where: { userId } })`, create with `id: newId()`
- `user.wishlist` → `db.wishlistItem` (userId + productId)
- `cart.items` → `db.cartItem` rows (cartId, variantId, quantity)
- `coupon.redemptions` → `db.couponRedemption`
- `returnRequest.items` → `db.returnItem`
- Variant sorting by ObjectId timestamp (cart items) → order by `createdAt` column
- `SiteSetting.find({ key: { $in: [...] } })` → `db.siteSetting.findMany({ where: { key: { in: [...] } } })`
- Search across text fields (products): `where: { OR: [{ name: { contains: q } }, { slug: { contains: q } }], AND: [...] }`

## Aggregations (admin reports/low-stock)

Convert to SQL-style Prisma or `$queryRaw`:

- Low-stock `$unwind + $match + $sort + $limit` →
  `db.productVariant.findMany({ where: { isActive: true, stock: { lte: ref('lowStockThreshold') } } })` —
  cross-column compare is NOT supported: use
  `db.$queryRaw\`SELECT v.id AS variantId, ... FROM productvariants v JOIN products p ON p.id=v.productId WHERE v.isActive AND v.stock <= v.lowStockThreshold ORDER BY v.stock ASC LIMIT n\``
  (returns snake_case column aliases you choose; convert to number with Number()).
  IMPORTANT: raw SQL table names are the `@@map` names (products, productvariants, orders, orderitems...).
- Revenue per day →
  `db.$queryRaw\`SELECT DATE(createdAt) AS day, SUM(grandTotal) AS total, COUNT(*) AS count FROM orders WHERE status <> 'CANCELLED' AND createdAt >= ${since} GROUP BY DATE(createdAt) ORDER BY day ASC\``
  (SUM returns Decimal/string — wrap with Number()).
- Best sellers (unwind items + group by productId) → join `orderitems` group by productId.

`$queryRaw` returns rows with the alias names; Decimal aggregates come back as
Prisma Decimal — `Number(row.total)`.

## Response-shape preservation

- Keep the SAME JSON keys the old code returned. When including relations, use
  `select`/`include` narrowly and map to the legacy shape when the old code
  built custom objects.
- `order.payment` was embedded (no `_id` in old payloads when `.select`ed? old
  payloads included the subdoc's `_id`) — returning the row as-is (with id) is
  acceptable; do NOT remove keys the frontend may read.
- Timestamps: Prisma returns Date objects — same as Mongoose. ISO strings via
  toISOString() where the old code did that.

## Transactions

`mongoose.startSession()/withTransaction` →
`await db.$transaction(async (tx) => { ...use tx.model... }, { timeout: 15_000 })`.
Use `tx` (NOT `db`) for every statement inside. `updateMany` returns `{ count }`.

## Uniqueness races

Mongo code sometimes caught duplicate-key errors. Prisma throws
`Prisma.PrismaClientKnownRequestError` with `code === "P2002"` — import Prisma
via `import { Prisma } from "@prisma/client"` and check
`err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"`.

## Verification (MANDATORY after rewriting each file)

```bash
cd /home/z/my-project/Stellora/backend && npx tsc --noEmit 2>&1 | grep "YOUR_FILE"
```
Iterate until YOUR file has ZERO errors (errors in other files are expected —
do not touch other files).
