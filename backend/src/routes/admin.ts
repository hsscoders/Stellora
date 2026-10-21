import { Router } from "express";
import { Prisma } from "@prisma/client";
import { db, newId, isValidId, normalizeJson } from "../lib/db";
import { ok, fail, handle, assertSameOrigin, HttpError } from "../lib/http";
import { requireAdmin } from "../lib/auth";
import {
  productSchema, categorySchema, couponSchema, bannerSchema,
  shippingRateSchema, inventoryAdjustSchema, adminUserSchema, settingsSchema,
  posCheckoutSchema, paymentConfigSchema, paymentTestSchema, normalizePhone,
} from "../validation";
import { slugify, generateOrderNumber } from "../lib/utils";
import { hashPassword } from "../lib/password";
import { audit } from "../services/audit";
import { accrueEarn } from "../services/loyalty";
import { validateCoupon } from "../services/pricing";
import { serializeProduct } from "./storefront";
import { serializeOrderDetail } from "./commerce";
import { getAutomationConfig, schedulerSnapshot, triggerJob, isJobId } from "../services/scheduler";
import { getGatewayConfig, buildGatewayStatus, PAYMENT_SETTING_KEYS } from "../services/gateway-config";
import { getSeoConfig, saveSeoConfig } from "../services/seo-config";
import { testGatewayConnection } from "../services/payments";
import { env } from "../env";
import { rateLimit, getClientIp } from "../lib/rate-limit";
import { unreadAdminChatCount } from "../services/realtime";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

export const adminRouter = Router();

/* ================= Dashboard stats ================= */

adminRouter.get(
  "/admin/stats",
  handle(async (req, res) => {
    await requireAdmin(req);
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [revAgg, rev24, statusAgg, productCount, lowStockProducts, recentOrders, dailyAgg, topProductsAgg, posAgg, customerCount, pendingReviews, pendingQuestions, unreadChat] = await Promise.all([
      db.$queryRaw<{ total: Prisma.Decimal; count: bigint }[]>`SELECT COALESCE(SUM(grandTotal), 0) AS total, COUNT(*) AS count FROM orders WHERE status <> 'CANCELLED' AND createdAt >= ${monthAgo}`,
      db.$queryRaw<{ total: Prisma.Decimal }[]>`SELECT COALESCE(SUM(grandTotal), 0) AS total FROM orders WHERE status <> 'CANCELLED' AND createdAt >= ${dayAgo}`,
      db.$queryRaw<{ status: string; count: bigint }[]>`SELECT status, COUNT(*) AS count FROM orders GROUP BY status`,
      db.product.count({ where: { status: { not: "ARCHIVED" } } }),
      // Low stock: one row per variant at or below the variant's own threshold
      db.$queryRaw<{ variantId: string; variantName: string; sku: string; stock: number; lowStockThreshold: number; name: string; slug: string }[]>
        `SELECT v.id AS variantId, v.name AS variantName, v.sku AS sku, v.stock AS stock, v.lowStockThreshold AS lowStockThreshold, p.name AS name, p.slug AS slug
         FROM productvariants v JOIN products p ON p.id = v.productId
         WHERE v.isActive = TRUE AND v.stock <= v.lowStockThreshold
         ORDER BY v.stock ASC LIMIT 8`,
      db.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true, email: true } } },
      }),
      // Revenue per day for the last 14 days (fills missing days client-side)
      db.$queryRaw<{ date: string; total: Prisma.Decimal; count: bigint }[]>
        `SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS date, COALESCE(SUM(grandTotal), 0) AS total, COUNT(*) AS count
         FROM orders
         WHERE status <> 'CANCELLED' AND createdAt >= ${new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)}
         GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d') ORDER BY date ASC`,
      // Best sellers by quantity sold in the last 30 days
      db.$queryRaw<{ productId: string | null; name: string; qty: Prisma.Decimal; revenue: Prisma.Decimal }[]>
        `SELECT oi.productId AS productId, MIN(oi.productName) AS name, SUM(oi.quantity) AS qty, SUM(oi.lineTotal) AS revenue
         FROM orderitems oi JOIN orders o ON o.id = oi.orderId
         WHERE o.status <> 'CANCELLED' AND o.createdAt >= ${monthAgo}
         GROUP BY oi.productId ORDER BY qty DESC LIMIT 5`,
      // POS vs ONLINE split (30d)
      db.$queryRaw<{ source: string; total: Prisma.Decimal; count: bigint }[]>
        `SELECT source, COALESCE(SUM(grandTotal), 0) AS total, COUNT(*) AS count FROM orders WHERE status <> 'CANCELLED' AND createdAt >= ${monthAgo} GROUP BY source`,
      db.user.count({ where: { role: "CUSTOMER" } }),
      db.review.count({ where: { status: "PENDING" } }),
      db.productQuestion.count({ where: { status: "PENDING" } }),
      unreadAdminChatCount(),
    ]);

    const posOnline = Object.fromEntries(posAgg.map((s) => [s.source ?? "ONLINE", { total: Number(s.total), count: Number(s.count) }]));

    return ok(res, {
      revenue30d: Number(revAgg[0]?.total ?? 0),
      orders30d: Number(revAgg[0]?.count ?? 0),
      revenue24h: Number(rev24[0]?.total ?? 0),
      ordersByStatus: Object.fromEntries(statusAgg.map((s) => [s.status, Number(s.count)])),
      productCount,
      customerCount,
      pendingReviews,
      pendingQuestions,
      unreadChat,
      posVsOnline: {
        POS: posOnline["POS"] ?? { total: 0, count: 0 },
        ONLINE: posOnline["ONLINE"] ?? { total: 0, count: 0 },
      },
      dailyRevenue: dailyAgg.map((d) => ({ date: d.date, total: Number(d.total), count: Number(d.count) })),
      topProducts: topProductsAgg.map((t) => ({
        productId: t.productId ? String(t.productId) : null,
        name: t.name,
        qty: Number(t.qty),
        revenue: Number(t.revenue),
      })),
      lowStock: lowStockProducts.map((v) => ({
        variantId: String(v.variantId),
        variantName: v.variantName,
        sku: v.sku,
        stock: Number(v.stock),
        lowStockThreshold: Number(v.lowStockThreshold),
        product: { name: v.name, slug: v.slug },
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        grandTotal: Number(o.grandTotal),
        createdAt: o.createdAt,
        source: o.source ?? "ONLINE",
        user: o.user ? { name: o.user.name, email: o.user.email } : null,
      })),
    });
  })
);

/* ================= Global search (topbar quick-find) ================= */

adminRouter.get(
  "/admin/search",
  handle(async (req, res) => {
    await requireAdmin(req);

    const ip = getClientIp(req);
    const rl = rateLimit(`admin-search:${ip}`, 60, 60 * 1000);
    if (!rl.allowed) {
      return fail(res, "RATE_LIMITED", "Too many searches. Please try again shortly.", 429);
    }

    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      return fail(res, "VALIDATION_ERROR", "Search query must be at least 2 characters.", 400);
    }

    // Orders: match the order number, or the customer's email via their user doc.
    const emailUsers = await db.user.findMany({ where: { email: { contains: q } }, select: { id: true } });
    const userIds = emailUsers.map((u) => u.id);
    const ordersWhere: Prisma.OrderWhereInput = userIds.length > 0
      ? { OR: [{ orderNumber: { contains: q } }, { userId: { in: userIds } }] }
      : { orderNumber: { contains: q } };

    const [orders, products, customers] = await Promise.all([
      db.order.findMany({ where: ordersWhere, orderBy: { createdAt: "desc" }, take: 5 }),
      db.product.findMany({
        where: { OR: [{ name: { contains: q } }, { slug: { contains: q } }] },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: { images: true, variants: true },
      }),
      db.user.findMany({
        where: { role: "CUSTOMER", OR: [{ name: { contains: q } }, { email: { contains: q } }] },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    return ok(res, {
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        grandTotal: Number(o.grandTotal),
        createdAt: o.createdAt,
      })),
      products: products.map((p) => {
        // Image: first product image by sortOrder (variants carry no image of their own).
        const images = [...(p.images ?? [])].sort(
          (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        );
        // Price: cheapest active variant, falling back to any variant.
        const active = (p.variants ?? []).filter((v: any) => v.isActive);
        const pool = active.length > 0 ? active : (p.variants ?? []);
        const price = pool.length > 0 ? Math.min(...pool.map((v: any) => Number(v.price) || 0)) : 0;
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          price,
          isActive: p.status === "ACTIVE",
          imageUrl: images[0]?.url ?? null,
        };
      }),
      customers: customers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt,
      })),
    });
  })
);

/* ================= Reports ================= */

adminRouter.get(
  "/admin/reports",
  handle(async (req, res) => {
    await requireAdmin(req);

    // Window length: 7 / 30 allowed, 14 default (v1 behaviour).
    const rawDays = Number(req.query.days ?? 14);
    const days = [7, 14, 30].includes(rawDays) ? rawDays : 14;
    const DAY = 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - days * DAY);
    const prevSince = new Date(since.getTime() - days * DAY);

    const [orders, prevAgg, topAgg, lowStockProducts, catItemAgg, paymentAgg, couponAgg] = await Promise.all([
      db.order.findMany({
        where: { createdAt: { gte: since }, status: { not: "CANCELLED" } },
        select: { grandTotal: true, createdAt: true },
      }),
      // Previous window KPIs (for period-over-period deltas)
      db.$queryRaw<{ total: Prisma.Decimal; count: bigint }[]>
        `SELECT COALESCE(SUM(grandTotal), 0) AS total, COUNT(*) AS count FROM orders
         WHERE createdAt >= ${prevSince} AND createdAt < ${since} AND status <> 'CANCELLED'`,
      db.$queryRaw<{ productName: string; quantity: Prisma.Decimal; lineTotal: Prisma.Decimal; orders: bigint }[]>
        `SELECT oi.productName AS productName, SUM(oi.quantity) AS quantity, SUM(oi.lineTotal) AS lineTotal, COUNT(*) AS orders
         FROM orderitems oi JOIN orders o ON o.id = oi.orderId
         WHERE o.createdAt >= ${since} AND o.status <> 'CANCELLED'
         GROUP BY oi.productName ORDER BY quantity DESC LIMIT 8`,
      db.$queryRaw<{ name: string; slug: string; variantName: string; sku: string; stock: number; lowStockThreshold: number }[]>
        `SELECT p.name AS name, p.slug AS slug, v.name AS variantName, v.sku AS sku, v.stock AS stock, v.lowStockThreshold AS lowStockThreshold
         FROM productvariants v JOIN products p ON p.id = v.productId
         WHERE v.isActive = TRUE AND v.stock <= v.lowStockThreshold
         ORDER BY v.stock ASC LIMIT 10`,
      // Units + revenue per product, resolved to category names in JS below
      db.$queryRaw<{ productId: string | null; quantity: Prisma.Decimal; lineTotal: Prisma.Decimal }[]>
        `SELECT oi.productId AS productId, SUM(oi.quantity) AS quantity, SUM(oi.lineTotal) AS lineTotal
         FROM orderitems oi JOIN orders o ON o.id = oi.orderId
         WHERE o.createdAt >= ${since} AND o.status <> 'CANCELLED'
         GROUP BY oi.productId`,
      // Payment method mix for the window
      db.$queryRaw<{ paymentMethod: string; count: bigint; total: Prisma.Decimal }[]>
        `SELECT paymentMethod, COUNT(*) AS count, COALESCE(SUM(grandTotal), 0) AS total FROM orders
         WHERE createdAt >= ${since} AND status <> 'CANCELLED' GROUP BY paymentMethod`,
      // Coupon performance
      db.$queryRaw<{ couponCode: string; count: bigint; saved: Prisma.Decimal }[]>
        `SELECT couponCode, COUNT(*) AS count, COALESCE(SUM(discountTotal), 0) AS saved FROM orders
         WHERE createdAt >= ${since} AND status <> 'CANCELLED' AND couponCode IS NOT NULL
         GROUP BY couponCode ORDER BY count DESC LIMIT 5`,
    ]);

    // ---- KPI block (current + previous window) ----
    const revenue = orders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
    const count = orders.length;
    const prev = prevAgg[0] ? { total: Number(prevAgg[0].total), count: Number(prevAgg[0].count) } : { total: 0, count: 0 };
    const aov = count > 0 ? revenue / count : 0;
    const prevAov = prev.count > 0 ? prev.total / prev.count : 0;
    const pct = (cur: number, old: number) => (old > 0 ? Math.round(((cur - old) / old) * 1000) / 10 : cur > 0 ? 100 : 0);

    // ---- Category breakdown (resolve productId → category in JS) ----
    const productIds = catItemAgg
      .map((c) => c.productId)
      .filter((id: string | null): id is string => !!id);
    const products = productIds.length
      ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, category: { select: { name: true } } } })
      : [];
    const catNameById = new Map<string, string>();
    for (const p of products) {
      catNameById.set(p.id, p.category?.name ?? "Uncategorised");
    }
    const catMap = new Map<string, { revenue: number; units: number }>();
    for (const row of catItemAgg) {
      const name = catNameById.get(String(row.productId)) ?? "Uncategorised";
      const cur = catMap.get(name) ?? { revenue: 0, units: 0 };
      cur.revenue += Number(row.lineTotal);
      cur.units += Number(row.quantity);
      catMap.set(name, cur);
    }
    const categories = [...catMap.entries()]
      .map(([name, v]) => ({ category: name, revenue: Math.round(v.revenue * 100) / 100, units: v.units }))
      .sort((a, b) => b.revenue - a.revenue);

    // ---- Payment split ----
    const paymentSplit = {
      PAY_ON_CONFIRMATION: { count: 0, total: 0 },
      GATEWAY: { count: 0, total: 0 },
    } as Record<string, { count: number; total: number }>;
    for (const row of paymentAgg) {
      const key = row.paymentMethod ?? "PAY_ON_CONFIRMATION";
      paymentSplit[key] = { count: Number(row.count), total: Number(row.total) };
    }

    return ok(res, {
      days,
      daily: orders.map((o) => ({ date: o.createdAt, grandTotal: o.grandTotal })),
      topItems: topAgg.map((t) => ({ productName: t.productName, quantity: Number(t.quantity), lineTotal: Number(t.lineTotal), orders: Number(t.orders) })),
      lowStock: lowStockProducts.map((v) => ({
        variantName: v.variantName,
        sku: v.sku,
        stock: Number(v.stock),
        lowStockThreshold: Number(v.lowStockThreshold),
        product: { name: v.name, slug: v.slug },
      })),
      // ── Reports 2.0 additions ──
      kpi: {
        revenue: Math.round(revenue * 100) / 100,
        orders: count,
        aov: Math.round(aov * 100) / 100,
        prevRevenue: Math.round(prev.total * 100) / 100,
        prevOrders: prev.count,
        prevAov: Math.round(prevAov * 100) / 100,
        revenueDeltaPct: pct(revenue, prev.total),
        ordersDeltaPct: pct(count, prev.count),
        aovDeltaPct: pct(aov, prevAov),
      },
      categories,
      paymentSplit,
      topCoupons: couponAgg.map((c) => ({ code: c.couponCode, orders: Number(c.count), saved: Math.round(Number(c.saved) * 100) / 100 })),
    });
  })
);

/* ================= Audit logs ================= */

adminRouter.get(
  "/admin/audit-logs",
  handle(async (req, res) => {
    await requireAdmin(req);
    const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return ok(res, logs.map((l) => ({
        id: l.id,
        actorId: l.actorId ? String(l.actorId) : null,
        actorEmail: l.actorEmail ?? null,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId ?? null,
        metadata: l.metadata ?? null,
        ip: l.ip ?? null,
        createdAt: l.createdAt,
      }))
    );
  })
);

/* ================= Products ================= */

adminRouter.get(
  "/admin/orders/:orderId",
  handle(async (req, res) => {
    await requireAdmin(req);
    const orderId = String(req.params.orderId);
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        payment: true,
        shipment: true,
      },
    });
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    const detail = await serializeOrderDetail(order);
    return ok(res, {
      ...detail,
      user: order.user
        ? {
            id: order.user.id,
            name: order.user.name,
            email: order.user.email,
            phone: order.user.phone ?? null,
          }
        : null,
    });
  })
);

/* ================= Products ================= */

adminRouter.get(
  "/admin/products/:productId",
  handle(async (req, res) => {
    await requireAdmin(req);
    const productId = String(req.params.productId);
    const product = await db.product.findUnique({
      where: { id: productId },
      include: { category: true, variants: true, images: true },
    });
    if (!product) return fail(res, "NOT_FOUND", "Product not found.", 404);
    const s = serializeProduct(product);
    return ok(res, {
      ...s,
      variants: [...(product.variants ?? [])]
        .sort((a: any, b: any) => Number(a.price) - Number(b.price))
        .map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.name,
          price: v.price,
          compareAtPrice: v.compareAtPrice ?? null,
          stock: v.stock,
          lowStockThreshold: v.lowStockThreshold,
          isActive: v.isActive,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })),
    });
  })
);

adminRouter.get(
  "/admin/products",
  handle(async (req, res) => {
    await requireAdmin(req);
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    const status = (req.query.status as string | undefined)?.trim().toUpperCase() ?? "";
    const categoryId = (req.query.categoryId as string | undefined)?.trim() ?? "";
    const sort = (req.query.sort as string | undefined)?.trim() ?? "newest";

    const where: Prisma.ProductWhereInput = q
      ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }
      : {};
    // Status filter — special value OUT_OF_STOCK is virtual (any active variant with 0 stock)
    if (["ACTIVE", "DRAFT", "ARCHIVED"].includes(status)) where.status = status as never;
    if (categoryId && isValidId(categoryId)) where.categoryId = categoryId;

    // Sorting — computed post-fetch for stock/price (variant rows), DB-sort otherwise
    const ORDER_BY: Record<string, Prisma.ProductOrderByWithRelationInput> = {
      newest: { createdAt: "desc" },
      oldest: { createdAt: "asc" },
      name: { name: "asc" },
    };
    const products = await db.product.findMany({
      where,
      orderBy: ORDER_BY[sort] ?? { createdAt: "desc" },
      include: { category: true, variants: true, images: true },
    });
    // Admin view keeps ALL variants (even inactive), sorted by price asc
    let rows = products.map((p) => {
        const s = serializeProduct(p);
        return {
          ...s,
          variants: [...(p.variants ?? [])]
            .sort((a: any, b: any) => Number(a.price) - Number(b.price))
            .map((v) => ({
              id: v.id,
              sku: v.sku,
              name: v.name,
              price: v.price,
              compareAtPrice: v.compareAtPrice ?? null,
              stock: v.stock,
              lowStockThreshold: v.lowStockThreshold,
              isActive: v.isActive,
              createdAt: v.createdAt,
              updatedAt: v.updatedAt,
            })),
        };
      });
    // Mongo sorted "variants.price" desc DB-side (max variant price); Prisma cannot
    // order by a to-many relation scalar, so it is applied post-fetch.
    if (sort === "pricedesc") rows = rows.sort((a, b) => maxVariantPrice(b.variants) - maxVariantPrice(a.variants));
    if (sort === "priceasc") rows = rows.sort((a, b) => Number(a.variants[0]?.price ?? 0) - Number(b.variants[0]?.price ?? 0));
    if (sort === "stockasc") rows = rows.sort((a, b) => sumActiveStock(a.variants) - sumActiveStock(b.variants));
    if (sort === "stockdesc") rows = rows.sort((a, b) => sumActiveStock(b.variants) - sumActiveStock(a.variants));
    if (status === "OUT_OF_STOCK") rows = rows.filter((p) => sumActiveStock(p.variants) === 0);

    return ok(res, rows);
  })
);

/** Sum of stock across active variants — shared by sort + out-of-stock filter. */
function sumActiveStock(variants: { isActive: boolean; stock: number }[]): number {
  return variants.reduce((n, v) => n + (v.isActive ? v.stock : 0), 0);
}

/** Max variant price — powers the "pricedesc" sort (was DB-side in Mongo). */
function maxVariantPrice(variants: { price: unknown }[]): number {
  return variants.reduce((m, v) => Math.max(m, Number(v.price) || 0), 0);
}

/* ================= Products: bulk actions ================= */

adminRouter.patch(
  "/admin/products/bulk",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);

    const body = (req.body ?? {}) as { ids?: unknown; action?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string" && isValidId(i)) : [];
    const action = typeof body.action === "string" ? body.action : "";
    const STATUS_MAP: Record<string, string> = { activate: "ACTIVE", draft: "DRAFT", archive: "ARCHIVED" };
    const nextStatus = STATUS_MAP[action];
    if (!nextStatus) return fail(res, "VALIDATION", "action must be activate | draft | archive.", 400);
    if (ids.length === 0) return fail(res, "VALIDATION", "Provide at least one valid product id.", 400);
    if (ids.length > 200) return fail(res, "VALIDATION", "Bulk actions are limited to 200 products at a time.", 400);

    const result = await db.product.updateMany(
      { where: { id: { in: ids } }, data: { status: nextStatus as never, updatedAt: new Date() } }
    );

    await audit(
      {
        actor: admin,
        action: `admin.products.bulk.${action}`,
        entityType: "Product",
        entityId: "bulk",
        metadata: { count: result.count, ids },
      },
      req
    );

    return ok(res, { modified: result.count, action: nextStatus });
  })
);

adminRouter.post(
  "/admin/products",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = productSchema.parse(req.body);

    const slug = data.slug && data.slug.length > 0 ? data.slug : slugify(data.name);
    const clash = await db.product.findFirst({ where: { slug }, select: { id: true } });
    if (clash) {
      // 409 Conflict (was: 200 with {error} in the body — clients could read
      // that as success). Matches the PUT /admin/products/:id behaviour below.
      return fail(res, "SLUG_TAKEN", "A product with this slug already exists.", 409, {
        slug: "Already in use",
      });
    }

    const product = await db.product.create({
      data: {
        id: newId(),
        slug,
        categoryId: data.categoryId,
        name: data.name,
        shortDescription: data.shortDescription,
        description: data.description || null,
        materials: data.materials || null,
        careInstructions: data.careInstructions || null,
        status: data.status,
        isFeatured: data.isFeatured,
        isNewArrival: data.isNewArrival,
        isBestSeller: data.isBestSeller,
        isTrending: data.isTrending,
        videoUrl: data.videoUrl || null,
        images: { create: data.images.map((img, i) => ({ id: newId(), url: img.url, alt: img.alt ?? null, sortOrder: i })) },
        variants: {
          create: data.variants.map((v) => ({
            id: newId(),
            name: v.name,
            sku: v.sku.toUpperCase(),
            price: v.price,
            compareAtPrice: v.compareAtPrice ?? null,
            stock: v.stock,
            lowStockThreshold: v.lowStockThreshold,
            isActive: v.isActive,
          })),
        },
      },
      include: { category: true, variants: true, images: true },
    });

    // Record initial stock movements
    for (const v of product.variants) {
      if (v.stock > 0) {
        await db.stockMovement.create({
          data: {
            id: newId(),
            variantId: v.id,
            delta: v.stock,
            reason: "INITIAL",
            note: "Initial stock at product creation",
            createdById: admin.id,
          },
        });
      }
    }

    await audit(
      {
        actor: admin,
        action: "admin.product.create",
        entityType: "Product",
        entityId: product.id,
        metadata: { name: product.name, slug: product.slug },
      },
      req
    );
    return ok(res, serializeProduct(product), 201);
  })
);

adminRouter.put(
  "/admin/products/:productId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const productId = String(req.params.productId);
    const data = productSchema.parse(req.body);

    const existing = await db.product.findUnique({
      where: { id: productId },
      include: { variants: true, images: true },
    });
    if (!existing) return fail(res, "NOT_FOUND", "Product not found.", 404);

    const slug = data.slug && data.slug.length > 0 ? data.slug : undefined;
    if (slug && slug !== existing.slug) {
      const clash = await db.product.findFirst({ where: { slug }, select: { id: true } });
      if (clash) return fail(res, "SLUG_TAKEN", "A product with this slug already exists.", 409, { slug: "Already in use" });
    }

    // Check SKU uniqueness across OTHER products' variants
    for (const v of data.variants) {
      const sku = v.sku.toUpperCase();
      const clash = await db.productVariant.findFirst({
        where: { sku, productId: { not: productId } },
        select: { product: { select: { name: true } } },
      });
      if (clash) {
        return fail(res, "SKU_TAKEN", `SKU ${sku} is already used by "${clash.product.name}".`, 409, { sku: "Already in use" });
      }
    }

    const productUpdate = {
      ...(slug ? { slug } : {}),
      categoryId: data.categoryId,
      name: data.name,
      shortDescription: data.shortDescription,
      description: data.description || null,
      materials: data.materials || null,
      careInstructions: data.careInstructions || null,
      status: data.status,
      isFeatured: data.isFeatured,
      isNewArrival: data.isNewArrival,
      isBestSeller: data.isBestSeller,
      isTrending: data.isTrending,
      videoUrl: data.videoUrl || null,
    };

    await db.$transaction(
      async (tx) => {
        // Replace images wholesale (embedded array → child table rows)
        await tx.productImage.deleteMany({ where: { productId } });
        await tx.product.update({
          where: { id: productId },
          data: {
            ...productUpdate,
            images: {
              create: data.images.map((img, i) => ({
                id: newId(),
                url: img.url,
                alt: img.alt ?? null,
                sortOrder: i,
              })),
            },
          },
        });

        // Variants: update by id, create new, remove deleted
        const keepIds: string[] = [];
        for (const v of data.variants) {
          if (v.id) {
            const ev = existing.variants.find((x) => x.id === v.id);
            if (ev) {
              await tx.productVariant.update({
                where: { id: ev.id },
                data: {
                  name: v.name,
                  sku: v.sku.toUpperCase(),
                  price: v.price,
                  compareAtPrice: v.compareAtPrice ?? null,
                  lowStockThreshold: v.lowStockThreshold,
                  isActive: v.isActive,
                  // NOTE: stock is NOT overwritten here; use inventory adjust for stock changes
                },
              });
              keepIds.push(ev.id);
            }
          } else {
            const created = await tx.productVariant.create({
              data: {
                id: newId(),
                productId,
                name: v.name,
                sku: v.sku.toUpperCase(),
                price: v.price,
                compareAtPrice: v.compareAtPrice ?? null,
                stock: v.stock,
                lowStockThreshold: v.lowStockThreshold,
                isActive: v.isActive,
              },
            });
            keepIds.push(created.id);
            if (created.stock > 0) {
              await tx.stockMovement.create({
                data: {
                  id: newId(),
                  variantId: created.id,
                  delta: created.stock,
                  reason: "INITIAL",
                  note: "Stock at variant creation",
                  createdById: admin.id,
                },
              });
            }
          }
        }
        // Delete removed variants (soft-deactivate if they have order history)
        for (const ev of existing.variants) {
          if (!keepIds.includes(ev.id)) {
            const used = await tx.orderItem.count({ where: { variantId: ev.id } });
            if (used > 0) {
              await tx.productVariant.update({ where: { id: ev.id }, data: { isActive: false } });
            }
            // else drop entirely
            else {
              await tx.productVariant.delete({ where: { id: ev.id } });
            }
          }
        }
      },
      { timeout: 15_000 }
    );

    await audit(
      {
        actor: admin,
        action: "admin.product.update",
        entityType: "Product",
        entityId: productId,
        metadata: { name: data.name },
      },
      req
    );
    const updated = await db.product.findUnique({
      where: { id: productId },
      include: { category: true, variants: true, images: true },
    });
    return ok(res, serializeProduct(updated));
  })
);

adminRouter.delete(
  "/admin/products/:productId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const productId = String(req.params.productId);

    const used = await db.orderItem.count({ where: { productId } });
    if (used > 0) {
      // Safeguard: products with order history are archived, never deleted
      await db.product.update({ where: { id: productId }, data: { status: "ARCHIVED" } });
      await audit(
        {
          actor: admin,
          action: "admin.product.archive",
          entityType: "Product",
          entityId: productId,
          metadata: { reason: "has order history" },
        },
        req
      );
      return ok(res, { archived: true, message: "Product has order history — archived instead of deleted." });
    }

    // Mongo's deleteOne removed the embedded variants/images arrays with the
    // product — delete the child-table rows too. deleteMany keeps the old
    // no-op-when-missing behaviour (never throws).
    await db.productImage.deleteMany({ where: { productId } });
    await db.productVariant.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
    await audit(
      { actor: admin, action: "admin.product.delete", entityType: "Product", entityId: productId },
      req
    );
    return ok(res, { deleted: true });
  })
);

/* ================= Categories ================= */

adminRouter.get(
  "/admin/categories",
  handle(async (req, res) => {
    await requireAdmin(req);
    const categories = await db.category.findMany({ orderBy: { sortOrder: "asc" } });
    const counts = await db.product.groupBy({ by: ["categoryId"], _count: { _all: true } });
    const countMap = new Map(counts.map((c) => [String(c.categoryId), c._count._all]));
    return ok(res, categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description ?? null,
        imageUrl: c.imageUrl ?? null,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        _count: { products: countMap.get(c.id) ?? 0 },
      }))
    );
  })
);

adminRouter.post(
  "/admin/categories",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = categorySchema.parse(req.body);
    const slug = data.slug && data.slug.length > 0 ? data.slug : slugify(data.name);
    const clash = await db.category.findFirst({ where: { slug }, select: { id: true } });
    if (clash) return fail(res, "SLUG_TAKEN", "A category with this slug already exists.", 409, { slug: "Already in use" });

    const category = await db.category.create({
      data: {
        id: newId(),
        name: data.name,
        slug,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    await audit(
      { actor: admin, action: "admin.category.create", entityType: "Category", entityId: category.id, metadata: { name: category.name } },
      req
    );
    return ok(res, { id: category.id, slug: category.slug, name: category.name, description: category.description ?? null, imageUrl: category.imageUrl ?? null, sortOrder: category.sortOrder, isActive: category.isActive, createdAt: category.createdAt, updatedAt: category.updatedAt, _count: { products: 0 } }, 201);
  })
);

adminRouter.put(
  "/admin/categories/:categoryId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const categoryId = String(req.params.categoryId);
    const data = categorySchema.parse(req.body);

    const existing = await db.category.findUnique({ where: { id: categoryId } });
    if (!existing) return fail(res, "NOT_FOUND", "Category not found.", 404);

    const slug = data.slug && data.slug.length > 0 ? data.slug : undefined;
    if (slug && slug !== existing.slug) {
      const clash = await db.category.findFirst({ where: { slug }, select: { id: true } });
      if (clash) return fail(res, "SLUG_TAKEN", "Slug already in use.", 409, { slug: "Already in use" });
    }

    const updated = await db.category.update({
      where: { id: categoryId },
      data: {
        name: data.name,
        ...(slug ? { slug } : {}),
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    await audit(
      { actor: admin, action: "admin.category.update", entityType: "Category", entityId: categoryId, metadata: { name: updated.name } },
      req
    );
    return ok(res, { id: updated.id, slug: updated.slug, name: updated.name, description: updated.description ?? null, imageUrl: updated.imageUrl ?? null, sortOrder: updated.sortOrder, isActive: updated.isActive, createdAt: updated.createdAt, updatedAt: updated.updatedAt });
  })
);

adminRouter.delete(
  "/admin/categories/:categoryId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const categoryId = String(req.params.categoryId);
    const count = await db.product.count({ where: { categoryId } });
    if (count > 0) {
      return fail(res, "CATEGORY_IN_USE",
        `This category has ${count} product(s). Move them to another category first.`,
        422
      );
    }
    await db.category.deleteMany({ where: { id: categoryId } });
    await audit(
      { actor: admin, action: "admin.category.delete", entityType: "Category", entityId: categoryId },
      req
    );
    return ok(res, { deleted: true });
  })
);

/* ================= Orders ================= */

adminRouter.get(
  "/admin/orders-list",
  handle(async (req, res) => {
    await requireAdmin(req);
    const orders = await db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        payment: true,
        shipment: true,
      },
    });
    return ok(res, await Promise.all(orders.map(async (o) => {
        const detail = await serializeOrderDetail(o);
        return {
          ...detail,
          user: o.user ? { id: o.user.id, name: o.user.name, email: o.user.email } : null,
        };
      }))
    );
  })
);

/* ---------- Delivery partner configuration ----------
 * Catalog (couriers + tracking URL patterns) + the store's saved settings.
 * Used by the admin order detail (partner dropdown) and Settings page.
 */
adminRouter.get(
  "/admin/delivery/config",
  handle(async (req, res) => {
    await requireAdmin(req);
    const { DELIVERY_PARTNERS, getDeliveryConfig } = await import("../services/delivery");
    const config = await getDeliveryConfig(true);
    return ok(res, { partners: DELIVERY_PARTNERS, config });
  })
);

adminRouter.post(
  "/admin/orders/:orderId/status",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const orderId = String(req.params.orderId);
    const status = String(req.body?.status ?? "");
    const note = req.body?.note ? String(req.body.note).slice(0, 300) : undefined;
    const carrier = req.body?.carrier ? String(req.body.carrier).slice(0, 80) : undefined;
    const trackingNumber = req.body?.trackingNumber ? String(req.body.trackingNumber).slice(0, 80) : undefined;

    if (!status) return fail(res, "VALIDATION_ERROR", "Status is required.", 422);

    const { transitionOrderStatus } = await import("../services/orders");
    const result = await transitionOrderStatus(orderId, status, {
      actorId: admin.id,
      note,
      carrier,
      trackingNumber,
    });

    await audit(
      {
        actor: admin,
        action: "admin.order.status_change",
        entityType: "Order",
        entityId: orderId,
        metadata: { orderNumber: result.orderNumber, to: status },
      },
      req
    );
    return ok(res, result);
  })
);

adminRouter.post(
  "/admin/orders/:orderId/payment",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const orderId = String(req.params.orderId);
    const nextStatus = String(req.body?.paymentStatus ?? "");

    const order = await db.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);

    const ALLOWED: Record<string, string[]> = {
      PENDING: ["PAID", "FAILED"],
      PAID: ["REFUNDED"],
      FAILED: ["PENDING", "PAID"],
      REFUNDED: [],
    };
    if (!ALLOWED[order.paymentStatus]?.includes(nextStatus)) {
      return fail(res, "INVALID_TRANSITION",
        `Cannot change payment status from ${order.paymentStatus} to ${nextStatus}.`,
        422
      );
    }

    await db.order.update({ where: { id: orderId }, data: { paymentStatus: nextStatus as never } });
    if (order.payment) {
      await db.orderPayment.update({
        where: { id: order.payment.id },
        data: {
          status: nextStatus as never,
          verifiedAt: nextStatus === "PAID" ? new Date() : null,
        },
      });
    }

    // Realtime: customer's order page reflects the payment instantly.
    try {
      const { notifyPaymentStatus } = await import("../services/realtime");
      notifyPaymentStatus({
        orderNumber: order.orderNumber,
        userId: String(order.userId ?? ""),
        paymentStatus: nextStatus,
      });
    } catch {
      // best-effort
    }

    await audit(
      {
        actor: admin,
        action: "admin.order.payment_status",
        entityType: "Order",
        entityId: orderId,
        metadata: { orderNumber: order.orderNumber, paymentStatus: nextStatus },
      },
      req
    );
    return ok(res, { paymentStatus: nextStatus });
  })
);

/* ================= Customers ================= */

adminRouter.get(
  "/admin/customers-list",
  handle(async (req, res) => {
    await requireAdmin(req);
    const customers = await db.user.findMany({ where: { role: "CUSTOMER" }, orderBy: { createdAt: "desc" } });
    const counts = await db.order.groupBy({ by: ["userId"], _count: { _all: true } });
    const countMap = new Map(counts.map((c) => [String(c.userId), c._count._all]));
    return ok(res, customers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? null,
        isActive: u.isActive,
        createdAt: u.createdAt,
        _count: { orders: countMap.get(u.id) ?? 0 },
      }))
    );
  })
);

adminRouter.patch(
  "/admin/customers/:customerId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const customerId = String(req.params.customerId);
    const isActive = Boolean(req.body?.isActive);

    const target = await db.user.findFirst({ where: { id: customerId, role: "CUSTOMER" }, select: { id: true, email: true } });
    if (!target) return fail(res, "NOT_FOUND", "Customer not found.", 404);

    await db.user.update({ where: { id: customerId }, data: { isActive } });
    if (!isActive) await db.session.deleteMany({ where: { userId: customerId } });

    await audit(
      {
        actor: admin,
        action: isActive ? "admin.customer.activate" : "admin.customer.deactivate",
        entityType: "User",
        entityId: customerId,
        metadata: { email: target.email },
      },
      req
    );
    return ok(res, { id: customerId, isActive });
  })
);

/* ================= Admin users ================= */

adminRouter.get(
  "/admin/users",
  handle(async (req, res) => {
    await requireAdmin(req);
    const users = await db.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    return ok(res, users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt }))
    );
  })
);

adminRouter.post(
  "/admin/users",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = adminUserSchema.parse(req.body);

    const clash = await db.user.findFirst({ where: { email: data.email }, select: { id: true } });
    if (clash) return fail(res, "EMAIL_TAKEN", "A user with this email already exists.", 409, { email: "Already registered" });

    const user = await db.user.create({
      data: {
        id: newId(),
        email: data.email,
        passwordHash: await hashPassword(data.password),
        name: data.name,
        role: data.role,
      },
    });
    await audit(
      {
        actor: admin,
        action: "admin.user.create",
        entityType: "User",
        entityId: user.id,
        metadata: { email: user.email, role: user.role },
      },
      req
    );
    return ok(res, { id: user.id, email: user.email, name: user.name, role: user.role }, 201);
  })
);

adminRouter.patch(
  "/admin/users/:userId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const userId = String(req.params.userId);
    const isActive = Boolean(req.body?.isActive);

    const target = await db.user.findFirst({ where: { id: userId, role: "ADMIN" }, select: { id: true, email: true } });
    if (!target) return fail(res, "NOT_FOUND", "Admin user not found.", 404);
    if (target.id === admin.id && !isActive) {
      return fail(res, "SELF_LOCKOUT", "You cannot deactivate your own account.", 422);
    }

    await db.user.update({ where: { id: userId }, data: { isActive } });
    if (!isActive) await db.session.deleteMany({ where: { userId } });

    await audit(
      {
        actor: admin,
        action: isActive ? "admin.user.activate" : "admin.user.deactivate",
        entityType: "User",
        entityId: userId,
        metadata: { email: target.email },
      },
      req
    );
    return ok(res, { id: userId, isActive });
  })
);

/* ================= Inventory ================= */

adminRouter.post(
  "/admin/inventory/:variantId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const variantId = String(req.params.variantId);
    const data = inventoryAdjustSchema.parse(req.body);

    const variant = await db.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) return fail(res, "NOT_FOUND", "Variant not found.", 404);
    if (variant.stock + data.delta < 0) {
      return fail(res, "NEGATIVE_STOCK", `Cannot reduce below zero (current: ${variant.stock}).`, 422);
    }

    await db.productVariant.update({
      where: { id: variantId },
      data: { stock: { increment: data.delta } },
    });
    const updatedStock = variant.stock + data.delta;

    await db.stockMovement.create({
      data: {
        id: newId(),
        variantId,
        delta: data.delta,
        reason: "MANUAL_ADJUST",
        note: data.note || null,
        createdById: admin.id,
      },
    });

    await audit(
      {
        actor: admin,
        action: "admin.inventory.adjust",
        entityType: "ProductVariant",
        entityId: variantId,
        metadata: { delta: data.delta, newStock: updatedStock, sku: variant.sku },
      },
      req
    );
    return ok(res, { id: variantId, sku: variant.sku, stock: updatedStock });
  })
);

adminRouter.get(
  "/admin/inventory/:variantId/movements",
  handle(async (req, res) => {
    await requireAdmin(req);
    const variantId = String(req.params.variantId);
    const movements = await db.stockMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(res, movements.map((m) => ({
        id: m.id,
        variantId: String(m.variantId),
        delta: m.delta,
        reason: m.reason,
        reference: m.reference ?? null,
        note: m.note ?? null,
        createdById: m.createdById ? String(m.createdById) : null,
        createdAt: m.createdAt,
      }))
    );
  })
);

/* ================= Coupons ================= */

adminRouter.get(
  "/admin/coupons",
  handle(async (req, res) => {
    await requireAdmin(req);
    const coupons = await db.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { redemptions: true } } },
    });
    return ok(res, coupons.map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description ?? null,
        discountType: c.discountType,
        value: c.value,
        minSubtotal: c.minSubtotal ?? null,
        maxDiscount: c.maxDiscount ?? null,
        startsAt: c.startsAt ?? null,
        endsAt: c.endsAt ?? null,
        usageLimit: c.usageLimit ?? null,
        perUserLimit: c.perUserLimit ?? null,
        timesUsed: c.timesUsed,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        _count: { redemptions: c._count.redemptions },
      }))
    );
  })
);

function couponPayload(data: ReturnType<typeof couponSchema.parse>) {
  return {
    code: data.code,
    description: data.description || null,
    discountType: data.discountType,
    value: data.value,
    minSubtotal: data.minSubtotal ?? null,
    maxDiscount: data.maxDiscount ?? null,
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    endsAt: data.endsAt ? new Date(data.endsAt) : null,
    usageLimit: data.usageLimit ?? null,
    perUserLimit: data.perUserLimit ?? null,
    isActive: data.isActive,
  };
}

adminRouter.post(
  "/admin/coupons",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = couponSchema.parse(req.body);

    const clash = await db.coupon.findFirst({ where: { code: data.code }, select: { id: true } });
    if (clash) return fail(res, "CODE_TAKEN", "This coupon code already exists.", 409, { code: "Already in use" });

    if (data.discountType === "PERCENT" && data.value > 100) {
      return fail(res, "VALIDATION_ERROR", "Percent discount cannot exceed 100.", 422, { value: "Max 100" });
    }

    const coupon = await db.coupon.create({ data: { id: newId(), ...couponPayload(data) } });
    await audit(
      { actor: admin, action: "admin.coupon.create", entityType: "Coupon", entityId: coupon.id, metadata: { code: coupon.code } },
      req
    );
    return ok(res, { id: coupon.id, code: coupon.code, discountType: coupon.discountType, value: coupon.value, isActive: coupon.isActive }, 201);
  })
);

adminRouter.put(
  "/admin/coupons/:couponId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const couponId = String(req.params.couponId);
    const data = couponSchema.parse(req.body);

    const existing = await db.coupon.findUnique({ where: { id: couponId } });
    if (!existing) return fail(res, "NOT_FOUND", "Coupon not found.", 404);

    if (data.code !== existing.code) {
      const clash = await db.coupon.findFirst({ where: { code: data.code }, select: { id: true } });
      if (clash) return fail(res, "CODE_TAKEN", "Code already in use.", 409, { code: "Already in use" });
    }

    const updated = await db.coupon.update({ where: { id: couponId }, data: couponPayload(data) });
    await audit(
      { actor: admin, action: "admin.coupon.update", entityType: "Coupon", entityId: couponId, metadata: { code: updated.code } },
      req
    );
    return ok(res, { id: updated.id, code: updated.code, discountType: updated.discountType, value: updated.value, isActive: updated.isActive });
  })
);

adminRouter.delete(
  "/admin/coupons/:couponId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const couponId = String(req.params.couponId);
    const coupon = await db.coupon.findUnique({
      where: { id: couponId },
      include: { _count: { select: { redemptions: true } } },
    });
    if (coupon && coupon._count.redemptions > 0) {
      await db.coupon.update({ where: { id: couponId }, data: { isActive: false } });
      await audit(
        { actor: admin, action: "admin.coupon.deactivate", entityType: "Coupon", entityId: couponId, metadata: { reason: "has redemptions" } },
        req
      );
      return ok(res, { deactivated: true, message: "Coupon has redemptions — deactivated instead of deleted." });
    }
    // Mongo's deleteOne was a no-op for missing ids — deleteMany preserves that.
    await db.coupon.deleteMany({ where: { id: couponId } });
    await audit(
      { actor: admin, action: "admin.coupon.delete", entityType: "Coupon", entityId: couponId },
      req
    );
    return ok(res, { deleted: true });
  })
);

/* ================= Banners ================= */

adminRouter.get(
  "/admin/banners",
  handle(async (req, res) => {
    await requireAdmin(req);
    const banners = await db.homepageBanner.findMany({ orderBy: { sortOrder: "asc" } });
    return ok(res, banners.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle ?? null, imageUrl: b.imageUrl, ctaLabel: b.ctaLabel ?? null, ctaHref: b.ctaHref ?? null, sortOrder: b.sortOrder, isActive: b.isActive }))
    );
  })
);

adminRouter.post(
  "/admin/banners",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = bannerSchema.parse(req.body);
    const banner = await db.homepageBanner.create({
      data: {
        id: newId(),
        title: data.title,
        subtitle: data.subtitle || null,
        imageUrl: data.imageUrl,
        ctaLabel: data.ctaLabel || null,
        ctaHref: data.ctaHref || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    await audit(
      { actor: admin, action: "admin.banner.create", entityType: "HomepageBanner", entityId: banner.id, metadata: { title: banner.title } },
      req
    );
    return ok(res, { id: banner.id, title: banner.title }, 201);
  })
);

adminRouter.put(
  "/admin/banners/:bannerId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const bannerId = String(req.params.bannerId);
    const data = bannerSchema.parse(req.body);
    const existing = await db.homepageBanner.findUnique({ where: { id: bannerId } });
    if (!existing) return fail(res, "NOT_FOUND", "Banner not found.", 404);
    const banner = await db.homepageBanner.update({
      where: { id: bannerId },
      data: {
        title: data.title,
        subtitle: data.subtitle || null,
        imageUrl: data.imageUrl,
        ctaLabel: data.ctaLabel || null,
        ctaHref: data.ctaHref || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    await audit(
      { actor: admin, action: "admin.banner.update", entityType: "HomepageBanner", entityId: bannerId },
      req
    );
    return ok(res, { id: banner.id, title: banner.title });
  })
);

adminRouter.delete(
  "/admin/banners/:bannerId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const bannerId = String(req.params.bannerId);
    await db.homepageBanner.deleteMany({ where: { id: bannerId } });
    await audit(
      { actor: admin, action: "admin.banner.delete", entityType: "HomepageBanner", entityId: bannerId },
      req
    );
    return ok(res, { deleted: true });
  })
);

/* ================= Payment gateway (admin) ================= */

adminRouter.get(
  "/admin/payments/config",
  handle(async (req, res) => {
    await requireAdmin(req);
    const cfg = await getGatewayConfig();
    return ok(res, buildGatewayStatus(cfg));
  })
);

adminRouter.put(
  "/admin/payments/config",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = paymentConfigSchema.parse(req.body);

    const updates: Record<string, string> = { [PAYMENT_SETTING_KEYS.provider]: data.provider };
    const rz = data.razorpay ?? {};
    if (rz.keyId !== undefined) updates[PAYMENT_SETTING_KEYS.razorpayKeyId] = rz.keyId;
    if (rz.keySecret !== undefined) updates[PAYMENT_SETTING_KEYS.razorpayKeySecret] = rz.keySecret;
    if (rz.webhookSecret !== undefined) updates[PAYMENT_SETTING_KEYS.razorpayWebhookSecret] = rz.webhookSecret;
    const st = data.stripe ?? {};
    if (st.publishableKey !== undefined) updates[PAYMENT_SETTING_KEYS.stripePk] = st.publishableKey;
    if (st.secretKey !== undefined) updates[PAYMENT_SETTING_KEYS.stripeSecret] = st.secretKey;
    if (st.webhookSecret !== undefined) updates[PAYMENT_SETTING_KEYS.stripeWebhookSecret] = st.webhookSecret;

    for (const [key, value] of Object.entries(updates)) {
      await db.siteSetting.upsert({ where: { key }, create: { id: newId(), key, value }, update: { value } });
    }

    await audit(
      {
        actor: admin,
        action: "admin.payment.config.update",
        entityType: "SiteSetting",
        metadata: {
          provider: data.provider,
          keys: Object.keys(updates).filter((k) => k !== PAYMENT_SETTING_KEYS.provider),
        },
      },
      req
    );

    const cfg = await getGatewayConfig();
    return ok(res, buildGatewayStatus(cfg));
  })
);

adminRouter.post(
  "/admin/payments/test",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`paytest:${ip}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many test attempts. Please wait a moment.", 429);

    const parsed = paymentTestSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "VALIDATION_ERROR", "Choose a gateway to test.", 422);

    const result = await testGatewayConnection(parsed.data.provider, parsed.data.keys);
    await audit(
      {
        actor: admin,
        action: "admin.payment.test",
        entityType: "SiteSetting",
        metadata: { provider: parsed.data.provider, ok: result.ok, typedKeys: !!parsed.data.keys },
      },
      req
    );
    return ok(res, result);
  })
);

/* ================= Settings ================= */

// Payment-gateway keys live in the same SiteSetting collection but are
// managed ONLY through /admin/payments/* — they are masked there and must
// never leak through the generic settings endpoints. seo.config likewise
// has its own dedicated /admin/seo endpoints below.
const isPaymentSecretKey = (key: string) =>
  key.startsWith("payment.") || key === "seo.config";

adminRouter.get(
  "/admin/settings",
  handle(async (req, res) => {
    await requireAdmin(req);
    const rows = await db.siteSetting.findMany({ orderBy: { key: "asc" } });
    return ok(res, rows.filter((r) => !isPaymentSecretKey(r.key)).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt })));
  })
);

adminRouter.put(
  "/admin/settings",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = settingsSchema.parse(req.body);

    const entries = Object.entries(data).filter(([key]) => !isPaymentSecretKey(key));
    for (const [key, value] of entries) {
      await db.siteSetting.upsert({ where: { key }, create: { id: newId(), key, value }, update: { value } });
    }

    // Delivery partner settings changed → refresh the short-lived cache.
    const { invalidateDeliveryCache } = await import("../services/delivery");
    invalidateDeliveryCache();

    await audit(
      {
        actor: admin,
        action: "admin.settings.update",
        entityType: "SiteSetting",
        metadata: { keys: Object.keys(data) },
      },
      req
    );
    return ok(res, { updated: Object.keys(data).length });
  })
);

/* ================= SEO (website-wide, admin-controlled) ================= */

adminRouter.get(
  "/admin/seo",
  handle(async (req, res) => {
    await requireAdmin(req);
    return ok(res, await getSeoConfig());
  })
);

adminRouter.put(
  "/admin/seo",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      throw new HttpError("VALIDATION", "SEO settings must be a JSON object.", 400);
    }
    const saved = await saveSeoConfig(req.body);
    await audit(
      {
        actor: admin,
        action: "admin.seo.update",
        entityType: "SiteSetting",
        entityId: "seo.config",
        metadata: { title: saved.defaultTitle, keywords: saved.keywords.length, cities: saved.citiesServed.length },
      },
      req
    );
    return ok(res, saved);
  })
);

/* ================= Auto-pilot (automation engine) ================= */

adminRouter.get(
  "/admin/automation",
  handle(async (req, res) => {
    await requireAdmin(req);
    const config = await getAutomationConfig();
    const cutoff = new Date(Date.now() - config.staleOrderHours * 60 * 60 * 1000);
    const [stalePending, pendingRestockAlerts] = await Promise.all([
      db.order.count({ where: { status: "PENDING", createdAt: { lt: cutoff } } }),
      db.restockAlert.count({ where: { notifiedAt: null } }),
    ]);
    return ok(res, {
      ...schedulerSnapshot(),
      config,
      stalePending,
      pendingRestockAlerts,
    });
  })
);

adminRouter.post(
  "/admin/automation/run",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`automation-run:${ip}`, 10, 60 * 1000);
    if (!rl.allowed) {
      return fail(res, "RATE_LIMITED", "Too many manual runs. Please wait a minute.", 429);
    }
    const jobId = (req.body as { job?: unknown })?.job;
    if (!isJobId(jobId)) {
      return fail(res, "VALIDATION_ERROR", "Unknown automation job.", 422);
    }
    const result = await triggerJob(jobId);
    await audit(
      {
        actor: admin,
        action: "automation.job.run",
        entityType: "Scheduler",
        entityId: jobId,
        metadata: { affected: result.affected, ok: result.ok },
      },
      req
    );
    return ok(res, { job: jobId, result });
  })
);

/* ================= Shipping rates ================= */

adminRouter.get(
  "/admin/shipping",
  handle(async (req, res) => {
    await requireAdmin(req);
    const rates = await db.shippingRate.findMany({ orderBy: { sortOrder: "asc" } });
    return ok(res, rates.map((r) => ({ id: r.id, name: r.name, baseFee: r.baseFee, freeAbove: r.freeAbove ?? null, isActive: r.isActive, sortOrder: r.sortOrder }))
    );
  })
);

adminRouter.post(
  "/admin/shipping",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = shippingRateSchema.parse(req.body);
    const rate = await db.shippingRate.create({
      data: {
        id: newId(),
        name: data.name,
        baseFee: data.baseFee,
        freeAbove: data.freeAbove ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    });
    await audit(
      { actor: admin, action: "admin.shipping.create", entityType: "ShippingRate", entityId: rate.id, metadata: { name: rate.name } },
      req
    );
    return ok(res, { id: rate.id, name: rate.name }, 201);
  })
);

adminRouter.put(
  "/admin/shipping/:rateId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const rateId = String(req.params.rateId);
    const data = shippingRateSchema.parse(req.body);
    const existing = await db.shippingRate.findUnique({ where: { id: rateId } });
    if (!existing) return fail(res, "NOT_FOUND", "Rate not found.", 404);
    const rate = await db.shippingRate.update({
      where: { id: rateId },
      data: {
        name: data.name,
        baseFee: data.baseFee,
        freeAbove: data.freeAbove ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    });
    await audit(
      { actor: admin, action: "admin.shipping.update", entityType: "ShippingRate", entityId: rateId },
      req
    );
    return ok(res, { id: rate.id, name: rate.name });
  })
);

adminRouter.delete(
  "/admin/shipping/:rateId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const rateId = String(req.params.rateId);
    await db.shippingRate.deleteMany({ where: { id: rateId } });
    await audit(
      { actor: admin, action: "admin.shipping.delete", entityType: "ShippingRate", entityId: rateId },
      req
    );
    return ok(res, { deleted: true });
  })
);

/* ================= Contact messages ================= */

adminRouter.get(
  "/admin/messages-list",
  handle(async (req, res) => {
    await requireAdmin(req);
    const messages = await db.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return ok(res, messages.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        subject: m.subject,
        message: m.message,
        status: m.status,
        createdAt: m.createdAt,
      }))
    );
  })
);

adminRouter.patch(
  "/admin/messages/:messageId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const messageId = String(req.params.messageId);
    const status = String(req.body?.status ?? "HANDLED");
    if (!["NEW", "HANDLED"].includes(status)) {
      return fail(res, "VALIDATION_ERROR", "Invalid status.", 422);
    }
    const existing = await db.contactMessage.findUnique({ where: { id: messageId } });
    if (!existing) return fail(res, "NOT_FOUND", "Message not found.", 404);
    const updated = await db.contactMessage.update({ where: { id: messageId }, data: { status: status as never } });
    await audit(
      { actor: admin, action: "admin.message.status", entityType: "ContactMessage", entityId: messageId, metadata: { status } },
      req
    );
    return ok(res, { id: updated.id, status: updated.status });
  })
);

/* ================= Uploads ================= */

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function sniffMime(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Admin image upload: type/size/content validated, randomized name. */
adminRouter.post(
  "/admin/uploads",
  upload.single("file"),
  handle(async (req, res) => {
    assertSameOrigin(req);
    await requireAdmin(req);

    const file = (req as unknown as { file?: { size: number; mimetype: string; buffer: Buffer } }).file;
    if (!file) {
      return fail(res, "VALIDATION_ERROR", "No file provided.", 422);
    }

    const maxBytes = env.UPLOAD_MAX_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return fail(res, "FILE_TOO_LARGE", `Image must be under ${env.UPLOAD_MAX_MB} MB.`, 422);
    }
    if (file.size < 100) {
      return fail(res, "VALIDATION_ERROR", "File appears to be empty or invalid.", 422);
    }

    const buffer = file.buffer;
    const sniffed = sniffMime(buffer);
    if (!sniffed || !ALLOWED_TYPES[sniffed]) {
      return fail(res, "INVALID_TYPE",
        "Only JPEG, PNG or WebP images are accepted (verified by content, not just extension).",
        422
      );
    }

    const ext = ALLOWED_TYPES[sniffed];
    const name = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${ext}`;
    const dir = path.join(process.cwd(), "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buffer);

    return ok(res, { url: `/api/media/${name}` }, 201);
  })
);

/* ================= POS — Point of Sale (in-store billing) ================= */

const WALKIN_EMAIL = "pos-walkin@stellora.local";

/**
 * POS checkout: bills items at the counter, decrements stock inside a
 * transaction, marks the order CONFIRMED + PAID immediately, and (when a
 * registered customer is attached) credits Stellora Rewards points.
 * All prices/totals are computed server-side from live variant data.
 */
adminRouter.post(
  "/admin/pos/orders",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = posCheckoutSchema.parse(req.body);

    // Resolve the customer: attached by mobile number (mobile-first shop) or
    // email — else the shared walk-in account (Order.userId is required).
    let customer: { id: string; name: string; email: string | null; phone?: string | null } | null = null;
    if (data.customerPhone) {
      customer = await db.user.findFirst({
        where: { phone: data.customerPhone },
        select: { id: true, name: true, email: true, phone: true },
      });
    }
    if (!customer && data.customerEmail) {
      customer = await db.user.findFirst({
        where: { email: data.customerEmail },
        select: { id: true, name: true, email: true, phone: true },
      });
    }
    if (!customer) {
      customer = await db.user.upsert({
        where: { email: WALKIN_EMAIL },
        create: {
          id: newId(),
          email: WALKIN_EMAIL,
          name: "Walk-in Customer",
          role: "CUSTOMER",
          passwordHash: randomBytes(24).toString("hex"), // unusable random password
          phone: null,
        },
        update: {},
        select: { id: true, name: true, email: true },
      });
    }

    // Load every referenced variant once (active variants of ACTIVE products
    // only); build a variant lookup map
    const variantIds = data.items.map((i) => i.variantId);
    const variants = await db.productVariant.findMany({
      where: {
        id: { in: variantIds },
        isActive: true,
        product: { is: { status: "ACTIVE" } },
      },
      include: { product: { include: { images: true } } },
    });
    const variantMap = new Map(variants.map((v) => [v.id, { product: v.product, variant: v }]));

    // Resolve lines server-side — client only sends variantId + quantity
    const lines: {
      productId: string;
      variantId: string;
      productName: string;
      variantName: string;
      sku: string;
      imageUrl: string | null;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
    }[] = [];
    let subtotal = 0;
    for (const item of data.items) {
      const found = variantMap.get(item.variantId);
      if (!found) {
        return fail(res, "NOT_FOUND", "One of the billed items is no longer available.", 422);
      }
      const { product, variant } = found;
      if (item.quantity > variant.stock) {
        return fail(
          res,
          "OUT_OF_STOCK",
          `Only ${variant.stock} left of ${product.name} (${variant.name}).`,
          409
        );
      }
      const lineTotal = Math.round(Number(variant.price) * item.quantity * 100) / 100;
      subtotal += lineTotal;
      lines.push({
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        imageUrl: (product.images ?? []).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0]?.url ?? null,
        unitPrice: Number(variant.price),
        quantity: item.quantity,
        lineTotal,
      });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    // Coupon — the same engine the storefront uses, applied to the bill subtotal.
    let couponDiscount = 0;
    let appliedCouponCode: string | null = null;
    if (data.couponCode) {
      try {
        const result = await validateCoupon(
          data.couponCode,
          subtotal,
          customer && customer.email !== WALKIN_EMAIL ? customer.id : null
        );
        couponDiscount = result.discount;
        appliedCouponCode = result.coupon.code;
      } catch (err) {
        const message = err instanceof HttpError ? err.message : "Coupon is not valid.";
        return fail(res, "COUPON_INVALID", message, 422);
      }
    }

    const discountAmount = Math.min((data.discountAmount ?? 0) + couponDiscount, subtotal);
    const payableSubtotal = Math.max(subtotal - discountAmount, 0);
    // GST-style tax on the discounted subtotal + flat shipping (both POS inputs).
    const taxPercent = data.taxPercent ?? 0;
    const taxTotal = Math.round(payableSubtotal * taxPercent) / 100;
    const shippingFee = Math.round((data.shippingFee ?? 0) * 100) / 100;
    const grandTotal = Math.round((payableSubtotal + taxTotal + shippingFee) * 100) / 100;

    // Split tenders (Stocky-style): validate the sum covers the grand total.
    // Single-method bills stay on the paymentMethod default.
    const tenders = (data.payments ?? [{ method: data.paymentMethod, amount: grandTotal }]).map(
      (p) => ({ method: p.method, amount: Math.round(p.amount * 100) / 100 })
    );
    const tenderSum = Math.round(tenders.reduce((n, p) => n + p.amount, 0) * 100) / 100;
    if (tenderSum + 0.011 < grandTotal) {
      return fail(
        res,
        "VALIDATION_ERROR",
        `Split payments add up to ${tenderSum.toFixed(2)} but the total is ${grandTotal.toFixed(2)}.`,
        422
      );
    }
    const changeDue = Math.round(Math.max(tenderSum - grandTotal, 0) * 100) / 100;

    const orderNumber = generateOrderNumber();
    const now = new Date();

    let createdOrderId = "";
    await db.$transaction(
      async (tx) => {
        for (const line of lines) {
          // Conditional stock decrement — race-safe (UPDATE ... WHERE stock >= qty)
          const updated = await tx.productVariant.updateMany({
            where: {
              id: line.variantId,
              productId: line.productId,
              isActive: true,
              stock: { gte: line.quantity },
              product: { is: { status: "ACTIVE" } },
            },
            data: { stock: { decrement: line.quantity } },
          });
          if (updated.count !== 1) {
            throw new HttpError(
              "OUT_OF_STOCK",
              `${line.productName} (${line.variantName}) just went out of stock.`,
              409
            );
          }
          await tx.stockMovement.create({
            data: {
              id: newId(),
              variantId: line.variantId,
              delta: -line.quantity,
              reason: "ORDER_COMMIT",
              reference: orderNumber,
              note: "POS sale",
              createdById: admin.id,
            },
          });
        }

        const order = await tx.order.create({
          data: {
            id: newId(),
            orderNumber,
            userId: customer!.id,
            status: "CONFIRMED",
            paymentStatus: "PAID",
            paymentMethod: "GATEWAY",
            source: "POS",
            subtotal,
            discountTotal: discountAmount,
            shippingFee,
            grandTotal,
            couponCode: appliedCouponCode,
            pointsRedeemed: 0,
            idempotencyKey: `pos-${orderNumber}`,
            shipName: customer!.name,
            shipPhone: data.customerPhone || "In-store",
            shipLine1: "Counter sale (POS)",
            shipLine2: null,
            shipCity: "In-store",
            shipState: "In-store",
            shipPincode: "000000",
            shipCountry: "India",
            adminNote: data.note || null,
            items: {
              create: lines.map((l) => ({
                id: newId(),
                productId: l.productId,
                variantId: l.variantId,
                productName: l.productName,
                variantName: l.variantName,
                sku: l.sku,
                imageUrl: l.imageUrl,
                unitPrice: l.unitPrice,
                quantity: l.quantity,
                lineTotal: l.lineTotal,
              })),
            },
            payment: {
              create: {
                id: newId(),
                method: "GATEWAY",
                status: "PAID",
                amount: grandTotal,
                // Machine-parseable tender breakdown for the cash-register report:
                // POS:CASH:500.00+UPI:358.50|CHG:8.50
                providerRef: `POS:${tenders.map((t) => `${t.method}:${t.amount.toFixed(2)}`).join("+")}${
                  changeDue > 0 ? `|CHG:${changeDue.toFixed(2)}` : ""
                }`,
                verifiedAt: now,
              },
            },
            events: {
              create: [
                {
                  id: newId(),
                  status: "CONFIRMED",
                  note: `Billed at counter via POS (${tenders.map((t) => t.method).join(" + ")})`,
                },
              ],
            },
          },
        });
        createdOrderId = order.id;

        // Coupon accounting — mirror the online checkout (usage + redemption).
        if (appliedCouponCode) {
          const couponDoc = await tx.coupon.update({
            where: { code: appliedCouponCode },
            data: { timesUsed: { increment: 1 } },
          });
          await tx.couponRedemption.create({
            data: {
              id: newId(),
              couponId: couponDoc.id,
              orderId: order.id,
              userId: customer!.id,
              amount: discountAmount,
            },
          });
        }
      },
      { timeout: 15_000 }
    );

    // Rewards earn for registered customers (never for the walk-in account).
    let pointsEarned = 0;
    if (customer!.id && customer!.email !== WALKIN_EMAIL) {
      const earn = await accrueEarn(createdOrderId, "POS sale confirmed");
      pointsEarned = earn.earned;
    }

    await audit(
      {
        actor: admin,
        action: "admin.pos.checkout",
        entityType: "Order",
        entityId: createdOrderId,
        metadata: {
          orderNumber,
          grandTotal,
          tenders,
          changeDue,
          couponCode: appliedCouponCode,
          taxPercent,
          shippingFee,
          items: lines.length,
        },
      },
      req
    );

    const populated = await db.order.findUnique({
      where: { id: createdOrderId },
      include: {
        user: { select: { name: true, email: true } },
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        payment: true,
        shipment: true,
      },
    });

    // Realtime: POS sale lands on every admin's dashboard instantly + stock ticks.
    try {
      const { notifyNewOrder, notifyLowStock, notifyStockUpdate } = await import("../services/realtime");
      const owner = populated?.user ?? null;
      notifyNewOrder({
        orderNumber,
        orderId: createdOrderId,
        grandTotal,
        itemCount: lines.reduce((n, l) => n + l.quantity, 0),
        items: lines.map((l) => ({ productName: l.productName, variantName: l.variantName, quantity: l.quantity })),
        customerName: owner?.name ?? customer!.name,
        customerEmail: owner?.email ?? null,
        paymentMethod: "POS",
        city: null,
        at: now.toISOString(),
      });
      const soldVariants = await db.productVariant.findMany({
        where: { id: { in: lines.map((l) => l.variantId) } },
        select: {
          id: true,
          name: true,
          sku: true,
          stock: true,
          lowStockThreshold: true,
          productId: true,
          product: { select: { name: true, slug: true } },
        },
      });
      const ticks: { productId: string; variantId: string; stock: number }[] = [];
      const low: { productName: string; variantName: string; sku: string; stock: number; threshold: number; slug: string }[] = [];
      for (const v of soldVariants) {
        ticks.push({ productId: v.productId, variantId: v.id, stock: v.stock });
        if (v.stock <= v.lowStockThreshold) {
          low.push({ productName: v.product.name, variantName: v.name, sku: v.sku, stock: v.stock, threshold: v.lowStockThreshold, slug: v.product.slug });
        }
      }
      notifyStockUpdate(ticks);
      notifyLowStock(low);
    } catch {
      // best-effort
    }

    return ok(
      res,
      {
        order: await serializeOrderDetail(populated),
        pointsEarned,
        changeDue,
      },
      201
    );
  })
);

/* ================= POS cash register (Stocky-style sessions) ================= */

/** Parse "POS:CASH:500.00+UPI:100.00|CHG:8.50" → cash in/out for the drawer. */
function parsePosCash(providerRef: string): { cashIn: number; change: number } | null {
  if (!providerRef.startsWith("POS:")) return null;
  const [tenderPart, changePart] = providerRef.split("|");
  let cashIn = 0;
  for (const t of tenderPart.slice(4).split("+")) {
    const [method, amount] = t.split(":");
    if (method === "CASH") cashIn += Number(amount) || 0;
  }
  const change = changePart?.startsWith("CHG:") ? Number(changePart.slice(4)) || 0 : 0;
  return { cashIn, change };
}

/** One OPEN session per terminal — opening a second one is rejected. */
adminRouter.post(
  "/admin/pos/register/open",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const terminalId = String(req.body?.terminalId ?? "").trim().slice(0, 16);
    if (!terminalId) return fail(res, "VALIDATION_ERROR", "Terminal id is required.", 422);
    const openingBalance = Math.max(Number(req.body?.openingBalance) || 0, 0);
    const note = String(req.body?.note ?? "").trim().slice(0, 300) || null;

    const existing = await db.cashSession.findFirst({ where: { terminalId, status: "OPEN" } });
    if (existing) {
      return fail(res, "CONFLICT", "This terminal already has an open register session.", 409);
    }
    const doc = await db.cashSession.create({
      data: {
        id: newId(),
        terminalId,
        status: "OPEN",
        openedById: admin.id,
        openedByName: admin.name ?? admin.email,
        openingBalance,
        openingNote: note,
        openedAt: new Date(),
      },
    });
    await audit(
      {
        actor: admin,
        action: "admin.pos.register.open",
        entityType: "CashSession",
        entityId: doc.id,
        metadata: { terminalId, openingBalance },
      },
      req
    );
    return ok(res, { session: normalizeJson(doc) }, 201);
  })
);

adminRouter.get(
  "/admin/pos/register/current",
  handle(async (req, res) => {
    await requireAdmin(req);
    const terminalId = String(req.query.terminalId ?? "").trim().slice(0, 16);
    if (!terminalId) return fail(res, "VALIDATION_ERROR", "Terminal id is required.", 422);
    const session = await db.cashSession.findFirst({ where: { terminalId, status: "OPEN" } });
    if (!session) return ok(res, { session: null });
    // Live drawer math: opening float + cash sales − change paid out.
    const orders = await db.order.findMany({
      where: { source: "POS", createdAt: { gte: session.openedAt } },
      select: { payment: { select: { providerRef: true } } },
    });
    let cashIn = 0;
    let change = 0;
    let nonCash = 0;
    for (const o of orders) {
      const parsed = parsePosCash(o.payment?.providerRef ?? "");
      if (!parsed) continue;
      cashIn += parsed.cashIn;
      change += parsed.change;
      // non-cash tenders, parsed from the same machine-readable ref
      const ref: string = o.payment?.providerRef ?? "";
      for (const t of ref.split("|")[0].slice(4).split("+")) {
        const [method, amount] = t.split(":");
        if (method && method !== "CASH") nonCash += Number(amount) || 0;
      }
    }
    const expectedCash = Math.round((Number(session.openingBalance) + cashIn - change) * 100) / 100;
    return ok(res, {
      session: normalizeJson(session),
      live: {
        expectedCash,
        cashIn: Math.round(cashIn * 100) / 100,
        change: Math.round(change * 100) / 100,
        nonCash: Math.round(nonCash * 100) / 100,
      },
    });
  })
);

adminRouter.post(
  "/admin/pos/register/close",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const terminalId = String(req.body?.terminalId ?? "").trim().slice(0, 16);
    if (!terminalId) return fail(res, "VALIDATION_ERROR", "Terminal id is required.", 422);
    const counted = Math.max(Number(req.body?.countedBalance) || 0, 0);
    const note = String(req.body?.note ?? "").trim().slice(0, 300) || null;

    const session = await db.cashSession.findFirst({ where: { terminalId, status: "OPEN" } });
    if (!session) return fail(res, "NOT_FOUND", "No open register session for this terminal.", 404);

    const orders = await db.order.findMany({
      where: { source: "POS", createdAt: { gte: session.openedAt } },
      select: { payment: { select: { providerRef: true } } },
    });
    let cashIn = 0;
    let change = 0;
    for (const o of orders) {
      const parsed = parsePosCash(o.payment?.providerRef ?? "");
      if (parsed) {
        cashIn += parsed.cashIn;
        change += parsed.change;
      }
    }
    const expectedCash = Math.round((Number(session.openingBalance) + cashIn - change) * 100) / 100;
    const variance = Math.round((counted - expectedCash) * 100) / 100;

    const closed = await db.cashSession.update({
      where: { id: session.id },
      data: {
        status: "CLOSED",
        countedBalance: counted,
        expectedCash,
        cashSales: Math.round(cashIn * 100) / 100,
        variance,
        closingNote: note,
        closedAt: new Date(),
      },
    });

    await audit(
      {
        actor: admin,
        action: "admin.pos.register.close",
        entityType: "CashSession",
        entityId: session.id,
        metadata: { terminalId, counted, expectedCash, variance },
      },
      req
    );
    return ok(res, {
      session: normalizeJson(closed),
      summary: { expectedCash, counted, variance, cashIn: Math.round(cashIn * 100) / 100, change: Math.round(change * 100) / 100 },
    });
  })
);

/* ================= POS customer quick-search (bill picker) ================= */

adminRouter.get(
  "/admin/pos/customers",
  handle(async (req, res) => {
    await requireAdmin(req);
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    const where: Prisma.UserWhereInput = { role: "CUSTOMER", isActive: true };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
      ];
    }
    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, email: true, phone: true, loyaltyPoints: true },
    });
    return ok(
      res,
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? null,
        points: u.loyaltyPoints ?? 0,
      }))
    );
  })
);

/* ================= POS quick customer create (name + mobile) ================ */

adminRouter.post(
  "/admin/pos/customers",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const name = String(req.body?.name ?? "").trim().slice(0, 80);
    const phone = normalizePhone(String(req.body?.phone ?? ""));
    const emailRaw = String(req.body?.email ?? "").trim().toLowerCase();
    const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
    if (name.length < 2) return fail(res, "VALIDATION_ERROR", "Customer name is required.", 422);
    if (!phone) return fail(res, "VALIDATION_ERROR", "Enter a valid 10-digit mobile number.", 422);

    const dup = await db.user.findFirst({ where: { OR: [{ phone }, ...(email ? [{ email }] : [])] } });
    if (dup) {
      return fail(
        res,
        "CONFLICT",
        dup.phone === phone
          ? "This mobile number is already registered."
          : "This email is already registered.",
        409
      );
    }

    // Counter-created customers get an unusable random password — they can set
    // one later via the storefront's forgot-password flow (or in person).
    // (MySQL's unique index allows multiple NULL emails, so the Mongo
    // sparse-index workaround of storing undefined is no longer needed.)
    const user = await db.user.create({
      data: {
        id: newId(),
        name,
        phone,
        email: email || null,
        role: "CUSTOMER",
        passwordHash: await hashPassword(randomBytes(24).toString("hex")),
      },
    });
    await audit(
      {
        actor: admin,
        action: "admin.pos.customer.create",
        entityType: "User",
        entityId: user.id,
        metadata: { name, phone, email },
      },
      req
    );
    return ok(
      res,
      { customer: { id: user.id, name: user.name, email: user.email, phone: user.phone, points: 0 } },
      201
    );
  })
);

/* ================= POS live feed — real-time stock + today strip ============
   The terminal polls this every few seconds while visible. `since` scopes the
   stock diff: every StockMovement after `since` marks a variant as changed,
   and the CURRENT stock of exactly those variants is returned. Also carries
   the day summary (IST business day) so the header chips stay live. */

adminRouter.get(
  "/admin/pos/live",
  handle(async (req, res) => {
    await requireAdmin(req);
    const terminalId = String(req.query.terminalId ?? "").trim().slice(0, 16);
    const sinceRaw = String(req.query.since ?? "");
    const sinceMs = Date.parse(sinceRaw);
    const since = Number.isFinite(sinceMs) ? new Date(sinceMs) : new Date(Date.now() - 15 * 60 * 1000);
    const now = new Date();

    // Which variants moved since the last poll?
    const moves = await db.stockMovement.findMany({
      where: { createdAt: { gte: since } },
      select: { variantId: true },
      take: 1000,
    });
    const changedIds = Array.from(new Set(moves.map((m) => String(m.variantId))));
    const stocks: { variantId: string; stock: number }[] = [];
    if (changedIds.length > 0) {
      const movedVariants = await db.productVariant.findMany({
        where: { id: { in: changedIds } },
        select: { id: true, stock: true },
      });
      for (const v of movedVariants) {
        stocks.push({ variantId: v.id, stock: Number(v.stock) || 0 });
      }
    }

    // IST business-day bounds (the shop runs on Asia/Kolkata)
    const IST = 5.5 * 60 * 60 * 1000;
    const istMidnight = new Date(Math.floor((now.getTime() + IST) / 86400000) * 86400000 - IST);

    const todayOrders = await db.order.findMany({
      where: { createdAt: { gte: istMidnight }, status: { not: "CANCELLED" } },
      select: {
        grandTotal: true,
        items: { select: { quantity: true } },
        payment: { select: { providerRef: true } },
      },
    });
    let revenue = 0;
    let itemsSold = 0;
    let cashSales = 0;
    let nonCashSales = 0;
    let posCount = 0;
    for (const o of todayOrders) {
      revenue += Number(o.grandTotal) || 0;
      itemsSold += (o.items ?? []).reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
      const ref: string = o.payment?.providerRef ?? "";
      if (ref.startsWith("POS:")) {
        posCount += 1;
        const parsed = parsePosCash(ref);
        if (parsed) cashSales += parsed.cashIn - parsed.change;
        for (const t of ref.split("|")[0].slice(4).split("+")) {
          const [method, amount] = t.split(":");
          if (method && method !== "CASH") nonCashSales += Number(amount) || 0;
        }
      }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;

    // Register state for this terminal (same math as /register/current)
    let session: any = null;
    let live: { expectedCash: number; cashIn: number; change: number; nonCash: number } | null = null;
    if (terminalId) {
      session = await db.cashSession.findFirst({ where: { terminalId, status: "OPEN" } });
      if (session) {
        const regOrders = await db.order.findMany({
          where: { source: "POS", createdAt: { gte: session.openedAt } },
          select: { payment: { select: { providerRef: true } } },
        });
        let cashIn = 0;
        let change = 0;
        let nonCash = 0;
        for (const o of regOrders) {
          const parsed = parsePosCash(o.payment?.providerRef ?? "");
          if (!parsed) continue;
          cashIn += parsed.cashIn;
          change += parsed.change;
          const ref: string = o.payment?.providerRef ?? "";
          for (const t of ref.split("|")[0].slice(4).split("+")) {
            const [method, amount] = t.split(":");
            if (method && method !== "CASH") nonCash += Number(amount) || 0;
          }
        }
        live = {
          expectedCash: Math.round((Number(session.openingBalance) + cashIn - change) * 100) / 100,
          cashIn: r2(cashIn),
          change: r2(change),
          nonCash: r2(nonCash),
        };
      }
    }

    return ok(res, {
      at: now.toISOString(),
      stocks,
      today: {
        orders: todayOrders.length,
        posOrders: posCount,
        revenue: r2(revenue),
        cashSales: r2(Math.max(cashSales, 0)),
        nonCashSales: r2(nonCashSales),
        itemsSold,
      },
      session: session ? normalizeJson(session) : null,
      live,
    });
  })
);

/* ================= POS coupon preview (cart-free validation) ================= */

adminRouter.get(
  "/admin/pos/coupon",
  handle(async (req, res) => {
    await requireAdmin(req);
    const code = String(req.query.code ?? "").trim();
    const subtotal = Math.max(Number(req.query.subtotal) || 0, 0);
    if (!code) return fail(res, "VALIDATION_ERROR", "Enter a coupon code.", 422);
    if (subtotal <= 0) return fail(res, "VALIDATION_ERROR", "Add items to the bill first.", 422);
    try {
      // The walk-in identity can't earn per-user limits, so validate anonymously.
      const result = await validateCoupon(code, subtotal, null);
      return ok(res, { valid: true, code: result.coupon.code, discount: result.discount });
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "Coupon is not valid.";
      return ok(res, { valid: false, message });
    }
  })
);

/* ================= POS scanner — barcode/SKU lookup ================= */

adminRouter.get(
  "/admin/pos/lookup",
  handle(async (req, res) => {
    assertSameOrigin(req);
    await requireAdmin(req);

    const raw = String(req.query.code ?? "").trim();
    const code = raw.toUpperCase();
    if (!code || code.length > 64) {
      return fail(res, "VALIDATION_ERROR", "A valid scan code is required.", 422);
    }

    // Match order: (1) exact SKU — labels printed in CODE128 of the SKU,
    // (2) exact assigned barcode number (EAN-13 numeric labels). Both are
    // scanner-shaped: the whole code arrives in one shot, no fuzzy match.
    const lookupInclude = {
      product: {
        include: {
          variants: true,
          images: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      },
    } as const;
    const hit =
      (await db.productVariant.findFirst({
        where: { sku: code, product: { is: { status: "ACTIVE" } } },
        include: lookupInclude,
      })) ??
      (await db.productVariant.findFirst({
        where: { barcode: code, product: { is: { status: "ACTIVE" } } },
        include: lookupInclude,
      }));
    if (hit) {
      const product = hit.product;
      const api = serializeProduct(product);
      const variant = api.variants.find(
        (v: any) =>
          String(v.sku).toUpperCase() === code ||
          (v.barcode && String(v.barcode).toUpperCase() === code)
      );
      if (variant) {
        return ok(res, { product: api, variant });
      }
    }
    return fail(res, "NOT_FOUND", `No active product matches code "${raw}".`, 404);
  })
);

/* ================= Barcode numbering — bulk EAN-13 assignment ================= */

/** EAN-13 check digit: weights 1,3 alternating from the left of 12 digits. */
function ean13CheckDigit(d12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function randomEan12(): string {
  // First digit 2-9 keeps it out of GS1-restricted ranges; rest random.
  let s = String(2 + Math.floor(Math.random() * 8));
  for (let i = 1; i < 12; i += 1) s += String(Math.floor(Math.random() * 10));
  return s;
}

adminRouter.post(
  "/admin/barcodes/assign",
  handle(async (req, res) => {
    assertSameOrigin(req);
    await requireAdmin(req);

    const body = (req.body ?? {}) as { variantIds?: unknown; overwrite?: unknown };
    const overwrite = body.overwrite === true;
    const requestedIds = Array.isArray(body.variantIds)
      ? body.variantIds.map((x) => String(x)).filter((x) => /^[a-f\d]{24}$/i.test(x))
      : null;

    // Collect targets: every ACTIVE variant, optionally restricted to ids,
    // skipping ones that already carry a number unless overwrite was asked.
    const catalogVariants = await db.productVariant.findMany({
      where: { product: { is: { status: "ACTIVE" } } },
      select: { id: true, barcode: true, productId: true },
    });
    const targets: { productId: string; variantId: string }[] = [];
    const wanted = requestedIds ? new Set(requestedIds.map((x) => x.toLowerCase())) : null;
    for (const v of catalogVariants) {
      if (wanted && !wanted.has(String(v.id))) continue;
      if (!overwrite && v.barcode) continue;
      targets.push({ productId: v.productId, variantId: v.id });
    }
    if (targets.length === 0) {
      return ok(res, { assigned: 0, items: [] });
    }

    // Uniqueness against the live catalog before writing.
    const taken = new Set<string>();
    const existing = await db.productVariant.findMany({
      where: { barcode: { not: null } },
      select: { barcode: true },
    });
    for (const row of existing) {
      if (row.barcode) taken.add(String(row.barcode));
    }

    const assigned: { productId: string; variantId: string; barcode: string }[] = [];
    for (const t of targets) {
      let code = "";
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const d12 = randomEan12();
        const full = d12 + ean13CheckDigit(d12);
        if (!taken.has(full)) {
          taken.add(full);
          code = full;
          break;
        }
      }
      if (!code) continue;
      assigned.push({ ...t, barcode: code });
    }

    // Persist each variant's new barcode (updateMany: no-op safe).
    let written = 0;
    for (const a of assigned) {
      const r = await db.productVariant.updateMany({
        where: { id: a.variantId },
        data: { barcode: a.barcode },
      });
      written += r.count;
    }

    return ok(res, {
      assigned: written,
      items: assigned.map((a) => ({ variantId: a.variantId, barcode: a.barcode })),
    });
  })
);
