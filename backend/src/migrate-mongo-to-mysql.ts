/**
 * Stellora — MongoDB → MySQL data migration (repeatable, resumable).
 *
 *   MIGRATE_MONGODB_URI="mongodb+srv://user:pass@cluster/db" npx tsx src/migrate-mongo-to-mysql.ts
 *
 * - Source MongoDB is READ-ONLY (never written, never dropped).
 * - Preserves original ObjectIds as 24-hex ids so every relationship stays valid.
 * - Normalizes embedded documents (addresses, wishlist, variants, images, cart
 *   items, coupon redemptions, order items/events/payment/shipment, return
 *   items) into their MySQL child tables.
 * - Resumable: tables that already contain rows are skipped (use --fresh to
 *   truncate the MySQL tables first — the SOURCE is never truncated).
 * - Produces a verification report (counts + relationship integrity checks).
 */
import "./env";
import { MongoClient } from "mongodb";
import { PrismaClient } from "@prisma/client";

const MONGO_URI = process.env.MIGRATE_MONGODB_URI ?? process.env.MONGODB_URI ?? "";
const FRESH = process.argv.includes("--fresh");

if (!MONGO_URI) {
  console.error("Set MIGRATE_MONGODB_URI (source MongoDB) and DB_* / DATABASE_URL (target MySQL).");
  process.exit(1);
}

const mysql = new PrismaClient();
const report: {
  table: string;
  source: number;
  imported: number;
  skipped?: string;
  status: "OK" | "SKIPPED" | "FAILED";
  error?: string;
}[] = [];

type AnyDoc = Record<string, any>;
const hex = (v: unknown): string => String(v);
const date = (v: unknown): Date | null => (v ? new Date(v as Date) : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

async function importRows(
  table: string,
  docs: AnyDoc[],
  insert: (batch: AnyDoc[]) => Promise<number>
): Promise<void> {
  const destCount = await (mysql as any)[table].count();
  if (destCount > 0 && !FRESH) {
    report.push({ table, source: docs.length, imported: 0, status: "SKIPPED", skipped: `${destCount} rows already present` });
    return;
  }
  let imported = 0;
  const BATCH = 200;
  for (let i = 0; i < docs.length; i += BATCH) {
    imported += await insert(docs.slice(i, i + BATCH));
  }
  report.push({ table, source: docs.length, imported, status: "OK" });
}

async function main() {
  console.log(`[migrate] connecting to source MongoDB (read-only)...`);
  const mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  await mongoClient.connect();
  // db name from the URI path (fallback: "stellora")
  const dbName = new URL(MONGO_URI.replace("mongodb+srv://", "http://").replace("mongodb://", "http://")).pathname.replace(/^\//, "") || "stellora";
  const mongo = mongoClient.db(dbName);
  console.log(`[migrate] source: ${dbName} → target MySQL: ${process.env.DB_NAME ?? "Stellora"}`);

  if (FRESH) {
    console.log("[migrate] --fresh: truncating MySQL child+parent tables (source untouched)...");
    const tables = [
      "chatmessages","chatthreads","cashsessions","webhookevents","auditlogs","contactmessages",
      "sitesettings","homepagebanners","passwordresettokens","sessions","loyaltyledger",
      "productquestions","returnitems","returnrequests","restockalerts","newslettersubscribers",
      "reviews","shippingrates","ordershipments","orderpayments","orderevents","orderitems",
      "orders","couponredemptions","coupons","cartitems","carts","stockmovements","productimages",
      "productvariants","products","categories","wishlistitems","useraddresses","users",
    ];
    await mysql.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS=0`);
    for (const t of tables) await mysql.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``);
    await mysql.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS=1`);
  }

  /* ---------------- Users (+ addresses + wishlist) ---------------- */
  const users = await mongo.collection("users").find({}).toArray();
  await importRows("user", users.map((u) => ({
    id: hex(u._id), email: str(u.email), passwordHash: u.passwordHash, name: u.name,
    phone: str(u.phone), role: u.role ?? "CUSTOMER", isActive: u.isActive ?? true,
    loyaltyPoints: num(u.loyaltyPoints), createdAt: u.createdAt ?? new Date(), updatedAt: u.updatedAt ?? new Date(),
  })), async (batch) => {
    const r = await mysql.user.createMany({ data: batch as never }); return r.count;
  });

  const addresses = users.flatMap((u) => (u.addresses ?? []).map((a: AnyDoc) => ({
    id: hex(a._id), userId: hex(u._id), fullName: a.fullName, phone: a.phone, line1: a.line1,
    line2: str(a.line2), city: a.city, state: a.state, pincode: a.pincode,
    country: a.country ?? "India", isDefault: !!a.isDefault,
    createdAt: a.createdAt ?? new Date(), updatedAt: a.updatedAt ?? new Date(),
  })));
  await importRows("address", addresses, async (b) => (await mysql.address.createMany({ data: b as never })).count);

  const wishlist = users.flatMap((u) => (u.wishlist ?? []).map((w: AnyDoc) => ({
    id: hex(w._id), userId: hex(u._id), productId: hex(w.productId),
    createdAt: w.createdAt ?? new Date(), updatedAt: w.updatedAt ?? new Date(),
  })));
  await importRows("wishlistItem", wishlist, async (b) => (await mysql.wishlistItem.createMany({ data: b as never })).count);

  /* ---------------- Categories / Products ---------------- */
  const categories = await mongo.collection("categories").find({}).toArray();
  await importRows("category", categories.map((c) => ({
    id: hex(c._id), slug: c.slug, name: c.name, description: str(c.description), imageUrl: str(c.imageUrl),
    sortOrder: num(c.sortOrder), isActive: c.isActive ?? true,
    createdAt: c.createdAt ?? new Date(), updatedAt: c.updatedAt ?? new Date(),
  })), async (b) => (await mysql.category.createMany({ data: b as never })).count);

  const products = await mongo.collection("products").find({}).toArray();
  await importRows("product", products.map((p) => ({
    id: hex(p._id), slug: p.slug, categoryId: hex(p.categoryId), name: p.name,
    shortDescription: p.shortDescription ?? "", description: str(p.description),
    materials: str(p.materials), careInstructions: str(p.careInstructions),
    status: p.status ?? "ACTIVE", isFeatured: !!p.isFeatured, isNewArrival: !!p.isNewArrival,
    isBestSeller: !!p.isBestSeller, isTrending: !!p.isTrending, videoUrl: str(p.videoUrl),
    createdAt: p.createdAt ?? new Date(), updatedAt: p.updatedAt ?? new Date(),
  })), async (b) => (await mysql.product.createMany({ data: b as never })).count);

  const variants = products.flatMap((p) => (p.variants ?? []).map((v: AnyDoc) => ({
    id: hex(v._id), productId: hex(p._id), sku: v.sku, barcode: str(v.barcode), name: v.name,
    price: num(v.price), compareAtPrice: v.compareAtPrice == null ? null : num(v.compareAtPrice),
    stock: num(v.stock), lowStockThreshold: num(v.lowStockThreshold ?? 5), isActive: v.isActive ?? true,
    createdAt: v.createdAt ?? p.createdAt ?? new Date(), updatedAt: v.updatedAt ?? p.updatedAt ?? new Date(),
  })));
  await importRows("productVariant", variants, async (b) => (await mysql.productVariant.createMany({ data: b as never })).count);

  const images = products.flatMap((p) => (p.images ?? []).map((i: AnyDoc) => ({
    id: hex(i._id), productId: hex(p._id), url: i.url, alt: str(i.alt), sortOrder: num(i.sortOrder),
  })));
  await importRows("productImage", images, async (b) => (await mysql.productImage.createMany({ data: b as never })).count);

  /* ---------------- Stock movements ---------------- */
  const stockmovements = await mongo.collection("stockmovements").find({}).toArray();
  await importRows("stockMovement", stockmovements.map((s) => ({
    id: hex(s._id), variantId: hex(s.variantId), delta: num(s.delta), reason: s.reason,
    reference: str(s.reference), note: str(s.note), createdById: str(s.createdById),
    createdAt: s.createdAt ?? new Date(),
  })), async (b) => (await mysql.stockMovement.createMany({ data: b as never })).count);

  /* ---------------- Carts ---------------- */
  const carts = await mongo.collection("carts").find({}).toArray();
  await importRows("cart", carts.map((c) => ({
    id: hex(c._id), userId: str(c.userId), sessionKey: str(c.sessionKey),
    createdAt: c.createdAt ?? new Date(), updatedAt: c.updatedAt ?? new Date(),
  })), async (b) => (await mysql.cart.createMany({ data: b as never })).count);
  const cartitems = carts.flatMap((c) => (c.items ?? []).map((i: AnyDoc) => ({
    id: hex(i._id), cartId: hex(c._id), variantId: hex(i.variantId), quantity: num(i.quantity),
    createdAt: i.createdAt ?? new Date(), updatedAt: i.updatedAt ?? new Date(),
  })));
  await importRows("cartItem", cartitems, async (b) => (await mysql.cartItem.createMany({ data: b as never })).count);

  /* ---------------- Coupons (+ redemptions) ---------------- */
  const coupons = await mongo.collection("coupons").find({}).toArray();
  await importRows("coupon", coupons.map((c) => ({
    id: hex(c._id), code: c.code, description: str(c.description), discountType: c.discountType,
    value: num(c.value), minSubtotal: c.minSubtotal == null ? null : num(c.minSubtotal),
    maxDiscount: c.maxDiscount == null ? null : num(c.maxDiscount),
    startsAt: date(c.startsAt), endsAt: date(c.endsAt), usageLimit: c.usageLimit ?? null,
    perUserLimit: c.perUserLimit ?? null, timesUsed: num(c.timesUsed), isActive: c.isActive ?? true,
    createdAt: c.createdAt ?? new Date(), updatedAt: c.updatedAt ?? new Date(),
  })), async (b) => (await mysql.coupon.createMany({ data: b as never })).count);
  const redemptions = coupons.flatMap((c) => (c.redemptions ?? []).map((r: AnyDoc) => ({
    id: hex(r._id), couponId: hex(c._id), orderId: hex(r.orderId), userId: str(r.userId),
    amount: num(r.amount), createdAt: r.createdAt ?? new Date(),
  })));
  await importRows("couponRedemption", redemptions, async (b) => (await mysql.couponRedemption.createMany({ data: b as never })).count);

  /* ---------------- Orders (+ items/events/payment/shipment) ---------------- */
  const orders = await mongo.collection("orders").find({}).toArray();
  await importRows("order", orders.map((o) => ({
    id: hex(o._id), orderNumber: o.orderNumber, userId: hex(o.userId), status: o.status ?? "PENDING",
    paymentStatus: o.paymentStatus ?? "PENDING", paymentMethod: o.paymentMethod ?? "PAY_ON_CONFIRMATION",
    subtotal: num(o.subtotal), discountTotal: num(o.discountTotal ?? 0), shippingFee: num(o.shippingFee ?? 0),
    grandTotal: num(o.grandTotal), currency: o.currency ?? "INR", couponCode: str(o.couponCode),
    pointsRedeemed: num(o.pointsRedeemed ?? 0), pointsEarned: num(o.pointsEarned ?? 0),
    idempotencyKey: o.idempotencyKey,
    shipName: o.shipName, shipPhone: o.shipPhone, shipLine1: o.shipLine1, shipLine2: str(o.shipLine2),
    shipCity: o.shipCity, shipState: o.shipState, shipPincode: o.shipPincode, shipCountry: o.shipCountry ?? "India",
    cancelledReason: str(o.cancelledReason), adminNote: str(o.adminNote), source: o.source ?? "ONLINE",
    paymentIntentProvider: o.paymentIntent?.provider ?? null,
    paymentIntentGatewayOrderId: str(o.paymentIntent?.gatewayOrderId),
    paymentIntentCreatedAt: date(o.paymentIntent?.createdAt),
    createdAt: o.createdAt ?? new Date(), updatedAt: o.updatedAt ?? new Date(),
  })), async (b) => (await mysql.order.createMany({ data: b as never })).count);

  const orderitems = orders.flatMap((o) => (o.items ?? []).map((i: AnyDoc) => ({
    id: hex(i._id), orderId: hex(o._id), productId: str(i.productId), variantId: str(i.variantId),
    productName: i.productName, variantName: i.variantName, sku: i.sku, imageUrl: str(i.imageUrl),
    unitPrice: num(i.unitPrice), quantity: num(i.quantity), lineTotal: num(i.lineTotal),
  })));
  await importRows("orderItem", orderitems, async (b) => (await mysql.orderItem.createMany({ data: b as never })).count);

  const orderevents = orders.flatMap((o) => (o.events ?? []).map((e: AnyDoc) => ({
    id: hex(e._id), orderId: hex(o._id), status: e.status, note: str(e.note), createdAt: e.createdAt ?? new Date(),
  })));
  await importRows("orderEvent", orderevents, async (b) => (await mysql.orderEvent.createMany({ data: b as never })).count);

  const orderpayments = orders.filter((o) => o.payment).map((o) => ({
    id: hex(o.payment._id), orderId: hex(o._id), method: o.payment.method, status: o.payment.status ?? "PENDING",
    amount: num(o.payment.amount), providerRef: str(o.payment.providerRef),
    verifiedAt: date(o.payment.verifiedAt), createdAt: o.payment.createdAt ?? new Date(),
  }));
  await importRows("orderPayment", orderpayments, async (b) => (await mysql.orderPayment.createMany({ data: b as never })).count);

  const ordershipments = orders.filter((o) => o.shipment).map((o) => ({
    id: hex(o.shipment._id), orderId: hex(o._id), carrier: str(o.shipment.carrier),
    trackingNumber: str(o.shipment.trackingNumber), status: o.shipment.status ?? "PENDING",
    shippedAt: date(o.shipment.shippedAt), deliveredAt: date(o.shipment.deliveredAt),
  }));
  await importRows("orderShipment", ordershipments, async (b) => (await mysql.orderShipment.createMany({ data: b as never })).count);

  /* ---------------- Shipping / engagement / misc ---------------- */
  const shippingrates = await mongo.collection("shippingrates").find({}).toArray();
  await importRows("shippingRate", shippingrates.map((s) => ({
    id: hex(s._id), name: s.name, baseFee: num(s.baseFee),
    freeAbove: s.freeAbove == null ? null : num(s.freeAbove),
    isActive: s.isActive ?? true, sortOrder: num(s.sortOrder),
    createdAt: s.createdAt ?? new Date(), updatedAt: s.updatedAt ?? new Date(),
  })), async (b) => (await mysql.shippingRate.createMany({ data: b as never })).count);

  const reviews = await mongo.collection("reviews").find({}).toArray();
  await importRows("review", reviews.map((r) => ({
    id: hex(r._id), productId: hex(r.productId), userId: hex(r.userId), authorName: r.authorName,
    rating: num(r.rating), title: r.title ?? "", body: r.body,
    isVerifiedPurchase: !!r.isVerifiedPurchase, status: r.status ?? "PENDING",
    createdAt: r.createdAt ?? new Date(),
  })), async (b) => (await mysql.review.createMany({ data: b as never })).count);

  const newsletters = await mongo.collection("newslettersubscribers").find({}).toArray();
  await importRows("newsletterSubscriber", newsletters.map((n) => ({
    id: hex(n._id), email: n.email, source: n.source ?? "footer", unsubscribedAt: date(n.unsubscribedAt),
    createdAt: n.createdAt ?? new Date(),
  })), async (b) => (await mysql.newsletterSubscriber.createMany({ data: b as never })).count);

  const restockalerts = await mongo.collection("restockalerts").find({}).toArray();
  await importRows("restockAlert", restockalerts.map((r) => ({
    id: hex(r._id), productId: hex(r.productId), variantId: str(r.variantId), email: r.email,
    notifiedAt: date(r.notifiedAt), createdAt: r.createdAt ?? new Date(),
  })), async (b) => (await mysql.restockAlert.createMany({ data: b as never })).count);

  const returns = await mongo.collection("returnrequests").find({}).toArray();
  await importRows("returnRequest", returns.map((r) => ({
    id: hex(r._id), orderNumber: r.orderNumber, userId: hex(r.userId), type: r.type,
    reason: r.reason, details: r.details ?? "", status: r.status ?? "REQUESTED",
    adminNote: str(r.adminNote), createdAt: r.createdAt ?? new Date(), updatedAt: r.updatedAt ?? new Date(),
  })), async (b) => (await mysql.returnRequest.createMany({ data: b as never })).count);
  const returnitems = returns.flatMap((r) => (r.items ?? []).map((i: AnyDoc, idx: number) => ({
    id: `${hex(r._id)}${String(idx).padStart(4, "0")}`.slice(0, 24), // subdocs had no _id — deterministic synthetic hex
    returnRequestId: hex(r._id), orderItemId: str(i.orderItemId), productName: i.productName,
    variantName: i.variantName ?? "", quantity: num(i.quantity),
  })));
  await importRows("returnItem", returnitems, async (b) => (await mysql.returnItem.createMany({ data: b as never })).count);

  const questions = await mongo.collection("productquestions").find({}).toArray();
  await importRows("productQuestion", questions.map((q) => ({
    id: hex(q._id), productId: hex(q.productId), userId: hex(q.userId), authorName: q.authorName,
    question: q.question, answer: str(q.answer), answeredAt: date(q.answeredAt),
    answeredById: str(q.answeredById), status: q.status ?? "PENDING", createdAt: q.createdAt ?? new Date(),
  })), async (b) => (await mysql.productQuestion.createMany({ data: b as never })).count);

  const loyalty = await mongo.collection("loyaltyledger").find({}).toArray();
  await importRows("loyaltyLedger", loyalty.map((l) => ({
    id: hex(l._id), userId: hex(l.userId), orderId: str(l.orderId), delta: num(l.delta),
    reason: l.reason, note: str(l.note), createdAt: l.createdAt ?? new Date(),
  })), async (b) => (await mysql.loyaltyLedger.createMany({ data: b as never })).count);

  const sessions = await mongo.collection("sessions").find({}).toArray();
  await importRows("session", sessions.map((s) => ({
    id: hex(s._id), tokenHash: s.tokenHash, userId: hex(s.userId), expiresAt: s.expiresAt,
    ip: str(s.ip), userAgent: str(s.userAgent), createdAt: s.createdAt ?? new Date(),
  })), async (b) => (await mysql.session.createMany({ data: b as never })).count);

  const resets = await mongo.collection("passwordresettokens").find({}).toArray();
  await importRows("passwordResetToken", resets.map((r) => ({
    id: hex(r._id), tokenHash: r.tokenHash, userId: hex(r.userId), expiresAt: r.expiresAt,
    usedAt: date(r.usedAt), createdAt: r.createdAt ?? new Date(),
  })), async (b) => (await mysql.passwordResetToken.createMany({ data: b as never })).count);

  const banners = await mongo.collection("homepagebanners").find({}).toArray();
  await importRows("homepageBanner", banners.map((b) => ({
    id: hex(b._id), title: b.title, subtitle: str(b.subtitle), imageUrl: b.imageUrl,
    ctaLabel: str(b.ctaLabel), ctaHref: str(b.ctaHref), sortOrder: num(b.sortOrder),
    isActive: b.isActive ?? true, createdAt: b.createdAt ?? new Date(), updatedAt: b.updatedAt ?? new Date(),
  })), async (b2) => (await mysql.homepageBanner.createMany({ data: b2 as never })).count);

  const settings = await mongo.collection("sitesettings").find({}).toArray();
  await importRows("siteSetting", settings.map((s) => ({
    id: hex(s._id), key: s.key, value: s.value,
    createdAt: s.createdAt ?? new Date(), updatedAt: s.updatedAt ?? new Date(),
  })), async (b) => (await mysql.siteSetting.createMany({ data: b as never })).count);

  const contacts = await mongo.collection("contactmessages").find({}).toArray();
  await importRows("contactMessage", contacts.map((c) => ({
    id: hex(c._id), name: c.name, phone: str(c.phone), email: str(c.email), subject: c.subject,
    message: c.message, status: c.status ?? "NEW", createdAt: c.createdAt ?? new Date(),
  })), async (b) => (await mysql.contactMessage.createMany({ data: b as never })).count);

  const auditlogs = await mongo.collection("auditlogs").find({}).toArray();
  await importRows("auditLog", auditlogs.map((a) => ({
    id: hex(a._id), actorId: str(a.actorId), actorEmail: str(a.actorEmail), action: a.action,
    entityType: a.entityType, entityId: str(a.entityId), metadata: (a.metadata ?? null) as never,
    ip: str(a.ip), createdAt: a.createdAt ?? new Date(),
  })), async (b) => (await mysql.auditLog.createMany({ data: b as never })).count);

  const webhooks = await mongo.collection("webhookevents").find({}).toArray();
  await importRows("webhookEvent", webhooks.map((w) => ({
    id: hex(w._id), provider: w.provider, eventId: w.eventId, payload: w.payload as never,
    status: w.status ?? "RECEIVED", processedAt: date(w.processedAt), createdAt: w.createdAt ?? new Date(),
  })), async (b) => (await mysql.webhookEvent.createMany({ data: b as never })).count);

  const cashsessions = await mongo.collection("cashsessions").find({}).toArray();
  await importRows("cashSession", cashsessions.map((c) => ({
    id: hex(c._id), terminalId: c.terminalId, status: c.status ?? "OPEN",
    openedById: str(c.openedById), openedByName: str(c.openedByName),
    openingBalance: num(c.openingBalance ?? 0), openingNote: str(c.openingNote),
    countedBalance: c.countedBalance == null ? null : num(c.countedBalance),
    expectedCash: c.expectedCash == null ? null : num(c.expectedCash),
    cashSales: c.cashSales == null ? null : num(c.cashSales),
    variance: c.variance == null ? null : num(c.variance),
    closingNote: str(c.closingNote), openedAt: c.openedAt ?? new Date(), closedAt: date(c.closedAt),
    createdAt: c.createdAt ?? new Date(),
  })), async (b) => (await mysql.cashSession.createMany({ data: b as never })).count);

  const chatthreads = await mongo.collection("chatthreads").find({}).toArray();
  await importRows("chatThread", chatthreads.map((t) => ({
    id: hex(t._id), customerId: str(t.customerId), guestKey: str(t.guestKey),
    displayName: t.displayName, contactHint: str(t.contactHint),
    lastMessagePreview: t.lastMessagePreview ?? "", lastMessageAt: t.lastMessageAt ?? new Date(),
    unreadForAdmin: num(t.unreadForAdmin ?? 0), unreadForCustomer: num(t.unreadForCustomer ?? 0),
    status: t.status ?? "OPEN", closedAt: date(t.closedAt), closedByName: str(t.closedByName),
    createdAt: t.createdAt ?? new Date(), updatedAt: t.updatedAt ?? new Date(),
  })), async (b) => (await mysql.chatThread.createMany({ data: b as never })).count);
  const chatmessages = await mongo.collection("chatmessages").find({}).toArray();
  await importRows("chatMessage", chatmessages.map((m) => ({
    id: hex(m._id), threadId: hex(m.threadId), senderRole: m.senderRole, senderId: str(m.senderId),
    senderName: m.senderName ?? "", body: m.body, clientMsgId: str(m.clientMsgId),
    createdAt: m.createdAt ?? new Date(),
  })), async (b) => (await mysql.chatMessage.createMany({ data: b as never })).count);

  /* ---------------- Verification ---------------- */
  console.log("\n=== MIGRATION REPORT ===");
  console.table(report);
  const failed = report.filter((r) => r.status === "FAILED");
  const skipped = report.filter((r) => r.status === "SKIPPED");

  // Relationship integrity spot-checks
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const [productsMy, variantsMy, ordersMy] = [
    await mysql.product.count(), await mysql.productVariant.count(), await mysql.order.count(),
  ];
  const productsSrc = await mongo.collection("products").countDocuments();
  const variantsSrc = await mongo.collection("products").aggregate([{ $unwind: "$variants" }, { $count: "n" }]).toArray();
  const ordersSrc = await mongo.collection("orders").countDocuments();
  checks.push({ name: "products count", ok: productsMy === productsSrc, detail: `${productsSrc} → ${productsMy}` });
  checks.push({ name: "variants count", ok: variantsMy === (variantsSrc[0]?.n ?? 0), detail: `${variantsSrc[0]?.n ?? 0} → ${variantsMy}` });
  checks.push({ name: "orders count", ok: ordersMy === ordersSrc, detail: `${ordersSrc} → ${ordersMy}` });
  const badCat = await mysql.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM products p LEFT JOIN categories c ON c.id = p.categoryId WHERE c.id IS NULL`;
  checks.push({ name: "products→categories refs", ok: Number(badCat[0].n) === 0, detail: `${Number(badCat[0].n)} broken` });
  const badVariantRef = await mysql.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM stockmovements s LEFT JOIN productvariants v ON v.id = s.variantId WHERE v.id IS NULL`;
  // NOTE: the source MongoDB already contains orphaned stockmovements (variants
  // deleted in the past left history rows behind — MySQL preserves them 1:1
  // because, like Mongo, there are no physical FK constraints). The check
  // therefore compares parity with the source instead of demanding zero.
  const srcOrphans = await mongo.collection("stockmovements").aggregate([
    { $lookup: { from: "products", localField: "variantId", foreignField: "variants._id", as: "pv" } },
    { $match: { pv: { $size: 0 } } },
    { $count: "n" },
  ]).toArray();
  const srcOrphanCount = srcOrphans[0]?.n ?? 0;
  checks.push({
    name: "stockmovements→variants refs (parity with source)",
    ok: Number(badVariantRef[0].n) === Number(srcOrphanCount),
    detail: `${Number(badVariantRef[0].n)} orphaned in MySQL / ${srcOrphanCount} already orphaned in Mongo`,
  });
  // Password hash still verifies? (scrypt format preserved — no rehash)
  const adminUser = await mysql.user.findFirst({ where: { role: "ADMIN" }, select: { passwordHash: true } });
  checks.push({
    name: "admin password hash preserved",
    ok: !!adminUser?.passwordHash?.startsWith("scrypt$"),
    detail: adminUser?.passwordHash ? "scrypt$... format intact" : "no admin found",
  });

  console.log("\n=== INTEGRITY CHECKS ===");
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);

  await mongoClient.close();
  await mysql.$disconnect();

  const okAll = failed.length === 0 && checks.every((c) => c.ok);
  console.log(`\n[migrate] ${okAll ? "MIGRATION COMPLETE — all checks passed" : "MIGRATION FINISHED WITH PROBLEMS (see above)"}`);
  if (!okAll) process.exit(2);
}

main().catch((e) => {
  console.error("[migrate] fatal:", e);
  process.exit(1);
});
