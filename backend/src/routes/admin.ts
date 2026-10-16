import { Router } from "express";
import mongoose from "mongoose";
import { Product, Category, Order, User, Coupon, HomepageBanner, SiteSetting, ShippingRate, StockMovement, AuditLog, ContactMessage, Session } from "../models";
import { ok, fail, handle, assertSameOrigin, HttpError } from "../lib/http";
import { requireAdmin } from "../lib/auth";
import {
  productSchema, categorySchema, couponSchema, bannerSchema,
  shippingRateSchema, inventoryAdjustSchema, adminUserSchema, settingsSchema,
  posCheckoutSchema,
} from "../validation";
import { slugify, generateOrderNumber } from "../lib/utils";
import { hashPassword } from "../lib/password";
import { audit } from "../services/audit";
import { accrueEarn } from "../services/loyalty";
import { escapeRegex, serializeProduct } from "./storefront";
import { serializeOrderDetail } from "./commerce";
import { env } from "../env";
import { rateLimit, getClientIp } from "../lib/rate-limit";
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

    const [revAgg, rev24, statusAgg, productCount, lowStockProducts, recentOrders, dailyAgg, topProductsAgg, posAgg, customerCount, pendingReviews, pendingQuestions] = await Promise.all([
      Order.aggregate<{ total: number; count: number }>([
        { $match: { status: { $ne: "CANCELLED" }, createdAt: { $gte: monthAgo } } },
        { $group: { _id: null, total: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
      ]),
      Order.aggregate<{ total: number }>([
        { $match: { status: { $ne: "CANCELLED" }, createdAt: { $gte: dayAgo } } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]),
      Order.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Product.countDocuments({ status: { $ne: "ARCHIVED" } }),
      // Low stock: unwind embedded variants, filter low + active
      Product.aggregate([
        { $unwind: "$variants" },
        { $match: { "variants.isActive": true, "variants.stock": { $lte: 20 } } },
        { $sort: { "variants.stock": 1 } },
        { $limit: 8 },
        { $project: { name: 1, slug: 1, variantId: "$variants._id", variantName: "$variants.name", sku: "$variants.sku", stock: "$variants.stock", lowStockThreshold: "$variants.lowStockThreshold" } },
      ]),
      Order.find().sort({ createdAt: -1 }).limit(8).populate("userId", "name email").lean<any[]>(),
      // Revenue per day for the last 14 days (fills missing days client-side)
      Order.aggregate<{ _id: string; total: number; count: number }>([
        { $match: { status: { $ne: "CANCELLED" }, createdAt: { $gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            total: { $sum: "$grandTotal" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Best sellers by quantity sold in the last 30 days
      Order.aggregate<{ _id: string | null; name: { $first: string }; qty: number; revenue: number }>([
        { $match: { status: { $ne: "CANCELLED" }, createdAt: { $gte: monthAgo } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.productId",
            name: { $first: "$items.productName" },
            qty: { $sum: "$items.quantity" },
            revenue: { $sum: "$items.lineTotal" },
          },
        },
        { $sort: { qty: -1 } },
        { $limit: 5 },
      ]),
      // POS vs ONLINE split (30d)
      Order.aggregate<{ _id: string; total: number; count: number }>([
        { $match: { status: { $ne: "CANCELLED" }, createdAt: { $gte: monthAgo } } },
        { $group: { _id: "$source", total: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
      ]),
      User.countDocuments({ role: "CUSTOMER" }),
      (await import("../models")).Review.countDocuments({ status: "PENDING" }),
      (await import("../models")).ProductQuestion.countDocuments({ status: "PENDING" }),
    ]);

    const posOnline = Object.fromEntries(posAgg.map((s) => [s._id ?? "ONLINE", { total: s.total, count: s.count }]));

    return ok(res, {
      revenue30d: revAgg[0]?.total ?? 0,
      orders30d: revAgg[0]?.count ?? 0,
      revenue24h: rev24[0]?.total ?? 0,
      ordersByStatus: Object.fromEntries(statusAgg.map((s) => [s._id, s.count])),
      productCount,
      customerCount,
      pendingReviews,
      pendingQuestions,
      posVsOnline: {
        POS: posOnline["POS"] ?? { total: 0, count: 0 },
        ONLINE: posOnline["ONLINE"] ?? { total: 0, count: 0 },
      },
      dailyRevenue: dailyAgg.map((d) => ({ date: d._id, total: d.total, count: d.count })),
      topProducts: topProductsAgg.map((t) => ({
        productId: t._id ? String(t._id) : null,
        name: t.name,
        qty: t.qty,
        revenue: t.revenue,
      })),
      lowStock: lowStockProducts.map((v: any) => ({
        variantId: String(v.variantId),
        variantName: v.variantName,
        sku: v.sku,
        stock: v.stock,
        lowStockThreshold: v.lowStockThreshold,
        product: { name: v.name, slug: v.slug },
      })),
      recentOrders: recentOrders.map((o: any) => ({
        id: String(o._id),
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        grandTotal: o.grandTotal,
        createdAt: o.createdAt,
        source: o.source ?? "ONLINE",
        user:
          o.userId && typeof o.userId === "object"
            ? { name: (o.userId as any).name, email: (o.userId as any).email }
            : null,
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

    const rx = new RegExp(escapeRegex(q), "i");

    // Orders: match the order number, or the customer's email via their user doc.
    const emailUsers = await User.find({ email: rx }).select("_id").lean<{ _id: any }[]>();
    const userIds = emailUsers.map((u) => u._id);

    const [orders, products, customers] = await Promise.all([
      Order.find(userIds.length > 0 ? { $or: [{ orderNumber: rx }, { userId: { $in: userIds } }] } : { orderNumber: rx })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("userId", "email")
        .lean<any[]>(),
      Product.find({ $or: [{ name: rx }, { slug: rx }] })
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean<any[]>(),
      User.find({ role: "CUSTOMER", $or: [{ name: rx }, { email: rx }] })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean<any[]>(),
    ]);

    return ok(res, {
      orders: orders.map((o) => ({
        id: String(o._id),
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        grandTotal: o.grandTotal,
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
          id: String(p._id),
          name: p.name,
          slug: p.slug,
          price,
          isActive: p.status === "ACTIVE",
          imageUrl: images[0]?.url ?? null,
        };
      }),
      customers: customers.map((u) => ({
        id: String(u._id),
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
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [orders, topAgg, lowStockProducts] = await Promise.all([
      Order.find({ createdAt: { $gte: since }, status: { $ne: "CANCELLED" } })
        .select("grandTotal createdAt")
        .lean<any[]>(),
      Order.aggregate<{ _id: string; quantity: number; lineTotal: number; orders: number }>([
        { $match: { createdAt: { $gte: since }, status: { $ne: "CANCELLED" } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.productName",
            quantity: { $sum: "$items.quantity" },
            lineTotal: { $sum: "$items.lineTotal" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 8 },
      ]),
      Product.aggregate([
        { $unwind: "$variants" },
        { $match: { "variants.isActive": true } },
        { $sort: { "variants.stock": 1 } },
        { $limit: 10 },
        { $project: { name: 1, slug: 1, variantName: "$variants.name", sku: "$variants.sku", stock: "$variants.stock", lowStockThreshold: "$variants.lowStockThreshold" } },
      ]),
    ]);

    return ok(res, {
      daily: orders.map((o) => ({ date: o.createdAt, grandTotal: o.grandTotal })),
      topItems: topAgg.map((t) => ({ productName: t._id, quantity: t.quantity, lineTotal: t.lineTotal, orders: t.orders })),
      lowStock: lowStockProducts.map((v: any) => ({
        variantName: v.variantName,
        sku: v.sku,
        stock: v.stock,
        lowStockThreshold: v.lowStockThreshold,
        product: { name: v.name, slug: v.slug },
      })),
    });
  })
);

/* ================= Audit logs ================= */

adminRouter.get(
  "/admin/audit-logs",
  handle(async (req, res) => {
    await requireAdmin(req);
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean<any[]>();
    return ok(res, logs.map((l) => ({
        id: String(l._id),
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
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("userId", "name email phone").lean<any>();
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    const detail = serializeOrderDetail(order);
    return ok(res, {
      ...detail,
      user:
        order.userId && typeof order.userId === "object"
          ? {
              id: String((order.userId as any)._id),
              name: (order.userId as any).name,
              email: (order.userId as any).email,
              phone: (order.userId as any).phone ?? null,
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
    const { productId } = req.params;
    const product = await Product.findById(productId).populate("categoryId").lean<any>();
    if (!product) return fail(res, "NOT_FOUND", "Product not found.", 404);
    const s = serializeProduct(product);
    return ok(res, {
      ...s,
      variants: [...(product.variants ?? [])]
        .sort((a: any, b: any) => a.price - b.price)
        .map((v: any) => ({
          id: String(v._id),
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
    const where: Record<string, unknown> = q
      ? { $or: [{ name: new RegExp(escapeRegex(q), "i") }, { slug: new RegExp(escapeRegex(q), "i") }] }
      : {};
    const products = await Product.find(where)
      .sort({ createdAt: -1 })
      .populate("categoryId")
      .lean<any[]>();
    // Admin view keeps ALL variants (even inactive), sorted by price asc
    return ok(res, products.map((p) => {
        const s = serializeProduct(p);
        return {
          ...s,
          variants: [...(p.variants ?? [])]
            .sort((a: any, b: any) => a.price - b.price)
            .map((v: any) => ({
              id: String(v._id),
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
      })
    );
  })
);

adminRouter.post(
  "/admin/products",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = productSchema.parse(req.body);

    const slug = data.slug && data.slug.length > 0 ? data.slug : slugify(data.name);
    const clash = await Product.findOne({ slug }).lean<{ _id: any }>();
    if (clash) {
      return ok(res, { error: "A product with this slug already exists." });
    }

    const product = await Product.create({
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
      images: data.images.map((img, i) => ({ url: img.url, alt: img.alt ?? null, sortOrder: i })),
      variants: data.variants.map((v) => ({
        name: v.name,
        sku: v.sku.toUpperCase(),
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        stock: v.stock,
        lowStockThreshold: v.lowStockThreshold,
        isActive: v.isActive,
      })),
    });

    // Record initial stock movements
    for (const v of product.variants) {
      if (v.stock > 0) {
        await StockMovement.create({
          variantId: v._id,
          delta: v.stock,
          reason: "INITIAL",
          note: "Initial stock at product creation",
          createdById: admin.id,
        });
      }
    }

    await audit(
      {
        actor: admin,
        action: "admin.product.create",
        entityType: "Product",
        entityId: String(product._id),
        metadata: { name: product.name, slug: product.slug },
      },
      req
    );
    return ok(res, serializeProduct(product.toObject()), 201);
  })
);

adminRouter.put(
  "/admin/products/:productId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const productId = String(req.params.productId);
    const data = productSchema.parse(req.body);

    const existing = await Product.findById(productId);
    if (!existing) return fail(res, "NOT_FOUND", "Product not found.", 404);

    const slug = data.slug && data.slug.length > 0 ? data.slug : undefined;
    if (slug && slug !== existing.slug) {
      const clash = await Product.findOne({ slug }).lean<{ _id: any }>();
      if (clash) return fail(res, "SLUG_TAKEN", "A product with this slug already exists.", 409, { slug: "Already in use" });
    }

    // Check SKU uniqueness across OTHER products' variants
    for (const v of data.variants) {
      const sku = v.sku.toUpperCase();
      const clash = await Product.findOne({ "variants.sku": sku, _id: { $ne: productId } }).select("name").lean<{ name: string } | null>();
      if (clash) {
        return fail(res, "SKU_TAKEN", `SKU ${sku} is already used by "${clash.name}".`, 409, { sku: "Already in use" });
      }
    }

    // Replace images wholesale; variants: upsert by id, create new, remove deleted
    existing.images = data.images.map((img, i) => ({
      url: img.url,
      alt: img.alt ?? null,
      sortOrder: i,
    })) as never;
    if (slug) existing.slug = slug;
    existing.categoryId = data.categoryId as never;
    existing.name = data.name;
    existing.shortDescription = data.shortDescription;
    existing.description = data.description || null;
    existing.materials = data.materials || null;
    existing.careInstructions = data.careInstructions || null;
    existing.status = data.status;
    existing.isFeatured = data.isFeatured;
    existing.isNewArrival = data.isNewArrival;
    existing.isBestSeller = data.isBestSeller;
    existing.isTrending = data.isTrending;
    existing.videoUrl = data.videoUrl || null;

    // Order history check helper: does any order reference this variant?
    const { Order: OrderModel } = await import("../models");
    const keepIds: string[] = [];
    const newVariants: any[] = [];
    for (const v of data.variants) {
      if (v.id) {
        const ev = (existing.variants as unknown as any[]).find(
          (x) => String(x._id) === v.id
        );
        if (ev) {
          ev.name = v.name;
          ev.sku = v.sku.toUpperCase();
          ev.price = v.price;
          ev.compareAtPrice = v.compareAtPrice ?? null;
          ev.lowStockThreshold = v.lowStockThreshold;
          ev.isActive = v.isActive;
          // NOTE: stock is NOT overwritten here; use inventory adjust for stock changes
          keepIds.push(String(ev._id));
          newVariants.push(ev);
        }
      } else {
        const created = {
          _id: new mongoose.Types.ObjectId(),
          name: v.name,
          sku: v.sku.toUpperCase(),
          price: v.price,
          compareAtPrice: v.compareAtPrice ?? null,
          stock: v.stock,
          lowStockThreshold: v.lowStockThreshold,
          isActive: v.isActive,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        newVariants.push(created);
        keepIds.push(String(created._id));
        if (created.stock > 0) {
          await StockMovement.create({
            variantId: created._id,
            delta: created.stock,
            reason: "INITIAL",
            note: "Stock at variant creation",
            createdById: admin.id,
          });
        }
      }
    }
    // Delete removed variants (soft-deactivate if they have order history)
    for (const ev of [...(existing.variants as unknown as any[])]) {
      if (!keepIds.includes(String(ev._id))) {
        const used = await OrderModel.countDocuments({ "items.variantId": String(ev._id) });
        if (used > 0) {
          ev.isActive = false;
          newVariants.push(ev);
        }
        // else drop entirely
      }
    }
    existing.variants = newVariants as never;
    await existing.save();

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
    const updated = await Product.findById(productId).populate("categoryId").lean<any>();
    return ok(res, serializeProduct(updated));
  })
);

adminRouter.delete(
  "/admin/products/:productId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const productId = String(req.params.productId);

    const used = await Order.countDocuments({ "items.productId": productId });
    if (used > 0) {
      // Safeguard: products with order history are archived, never deleted
      await Product.updateOne({ _id: productId }, { status: "ARCHIVED" });
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

    await Product.deleteOne({ _id: productId });
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
    const categories = await Category.find().sort({ sortOrder: 1 }).lean<any[]>();
    const counts = await Product.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return ok(res, categories.map((c) => ({
        id: String(c._id),
        slug: c.slug,
        name: c.name,
        description: c.description ?? null,
        imageUrl: c.imageUrl ?? null,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        _count: { products: countMap.get(String(c._id)) ?? 0 },
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
    const clash = await Category.findOne({ slug }).lean<{ _id: any }>();
    if (clash) return fail(res, "SLUG_TAKEN", "A category with this slug already exists.", 409, { slug: "Already in use" });

    const category = await Category.create({
      name: data.name,
      slug,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    });
    await audit(
      { actor: admin, action: "admin.category.create", entityType: "Category", entityId: String(category._id), metadata: { name: category.name } },
      req
    );
    return ok(res, { id: String(category._id), slug: category.slug, name: category.name, description: category.description ?? null, imageUrl: category.imageUrl ?? null, sortOrder: category.sortOrder, isActive: category.isActive, createdAt: category.createdAt, updatedAt: category.updatedAt, _count: { products: 0 } }, 201);
  })
);

adminRouter.put(
  "/admin/categories/:categoryId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const categoryId = String(req.params.categoryId);
    const data = categorySchema.parse(req.body);

    const existing = await Category.findById(categoryId);
    if (!existing) return fail(res, "NOT_FOUND", "Category not found.", 404);

    const slug = data.slug && data.slug.length > 0 ? data.slug : undefined;
    if (slug && slug !== existing.slug) {
      const clash = await Category.findOne({ slug }).lean<{ _id: any }>();
      if (clash) return fail(res, "SLUG_TAKEN", "Slug already in use.", 409, { slug: "Already in use" });
    }

    existing.name = data.name;
    if (slug) existing.slug = slug;
    existing.description = data.description || null;
    existing.imageUrl = data.imageUrl || null;
    existing.sortOrder = data.sortOrder;
    existing.isActive = data.isActive;
    await existing.save();
    await audit(
      { actor: admin, action: "admin.category.update", entityType: "Category", entityId: categoryId, metadata: { name: existing.name } },
      req
    );
    return ok(res, { id: String(existing._id), slug: existing.slug, name: existing.name, description: existing.description ?? null, imageUrl: existing.imageUrl ?? null, sortOrder: existing.sortOrder, isActive: existing.isActive, createdAt: existing.createdAt, updatedAt: existing.updatedAt });
  })
);

adminRouter.delete(
  "/admin/categories/:categoryId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const categoryId = String(req.params.categoryId);
    const count = await Product.countDocuments({ categoryId });
    if (count > 0) {
      return fail(res, "CATEGORY_IN_USE",
        `This category has ${count} product(s). Move them to another category first.`,
        422
      );
    }
    await Category.deleteOne({ _id: categoryId });
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
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("userId", "name email")
      .lean<any[]>();
    return ok(res, orders.map((o) => {
        const detail = serializeOrderDetail(o);
        return {
          ...detail,
          user: o.userId && typeof o.userId === "object" ? { id: String((o.userId as any)._id), name: (o.userId as any).name, email: (o.userId as any).email } : null,
        };
      })
    );
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

    const order = await Order.findById(orderId);
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

    order.paymentStatus = nextStatus as never;
    if (order.payment) {
      order.payment.status = nextStatus as never;
      order.payment.verifiedAt = nextStatus === "PAID" ? new Date() : null;
    }
    await order.save();

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
    const customers = await User.find({ role: "CUSTOMER" })
      .sort({ createdAt: -1 })
      .lean<any[]>();
    const counts = await Order.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return ok(res, customers.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        phone: u.phone ?? null,
        isActive: u.isActive,
        createdAt: u.createdAt,
        _count: { orders: countMap.get(String(u._id)) ?? 0 },
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

    const target = await User.findOne({ _id: customerId, role: "CUSTOMER" }).lean<{ _id: any; email: string } | null>();
    if (!target) return fail(res, "NOT_FOUND", "Customer not found.", 404);

    await User.updateOne({ _id: customerId }, { isActive });
    if (!isActive) await Session.deleteMany({ userId: customerId });

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
    const users = await User.find({ role: "ADMIN" })
      .sort({ createdAt: 1 })
      .select("name email role isActive createdAt")
      .lean<any[]>();
    return ok(res, users.map((u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt }))
    );
  })
);

adminRouter.post(
  "/admin/users",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = adminUserSchema.parse(req.body);

    const clash = await User.findOne({ email: data.email }).lean<{ _id: any }>();
    if (clash) return fail(res, "EMAIL_TAKEN", "A user with this email already exists.", 409, { email: "Already registered" });

    const user = await User.create({
      email: data.email,
      passwordHash: await hashPassword(data.password),
      name: data.name,
      role: data.role,
    });
    await audit(
      {
        actor: admin,
        action: "admin.user.create",
        entityType: "User",
        entityId: String(user._id),
        metadata: { email: user.email, role: user.role },
      },
      req
    );
    return ok(res, { id: String(user._id), email: user.email, name: user.name, role: user.role }, 201);
  })
);

adminRouter.patch(
  "/admin/users/:userId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const userId = String(req.params.userId);
    const isActive = Boolean(req.body?.isActive);

    const target = await User.findOne({ _id: userId, role: "ADMIN" }).lean<{ _id: any; email: string } | null>();
    if (!target) return fail(res, "NOT_FOUND", "Admin user not found.", 404);
    if (String(target._id) === admin.id && !isActive) {
      return fail(res, "SELF_LOCKOUT", "You cannot deactivate your own account.", 422);
    }

    await User.updateOne({ _id: userId }, { isActive });
    if (!isActive) await Session.deleteMany({ userId });

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

    const product = await Product.findOne({ "variants._id": variantId }).select("variants").lean<{ variants: { _id: any; sku: string; stock: number }[] } | null>();
    const variant = product?.variants.find((v) => String(v._id) === variantId);
    if (!product || !variant) return fail(res, "NOT_FOUND", "Variant not found.", 404);
    if (variant.stock + data.delta < 0) {
      return fail(res, "NEGATIVE_STOCK", `Cannot reduce below zero (current: ${variant.stock}).`, 422);
    }

    await Product.updateOne(
      { "variants._id": variantId },
      { $inc: { "variants.$.stock": data.delta }, $currentDate: { "variants.$.updatedAt": true } }
    );
    const updatedStock = variant.stock + data.delta;

    await StockMovement.create({
      variantId,
      delta: data.delta,
      reason: "MANUAL_ADJUST",
      note: data.note || null,
      createdById: admin.id,
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
    const movements = await StockMovement.find({ variantId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<any[]>();
    return ok(res, movements.map((m) => ({
        id: String(m._id),
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
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean<any[]>();
    return ok(res, coupons.map((c) => ({
        id: String(c._id),
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
        _count: { redemptions: (c.redemptions ?? []).length },
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

    const clash = await Coupon.findOne({ code: data.code }).lean<{ _id: any }>();
    if (clash) return fail(res, "CODE_TAKEN", "This coupon code already exists.", 409, { code: "Already in use" });

    if (data.discountType === "PERCENT" && data.value > 100) {
      return fail(res, "VALIDATION_ERROR", "Percent discount cannot exceed 100.", 422, { value: "Max 100" });
    }

    const coupon = await Coupon.create(couponPayload(data));
    await audit(
      { actor: admin, action: "admin.coupon.create", entityType: "Coupon", entityId: String(coupon._id), metadata: { code: coupon.code } },
      req
    );
    return ok(res, { id: String(coupon._id), code: coupon.code, discountType: coupon.discountType, value: coupon.value, isActive: coupon.isActive }, 201);
  })
);

adminRouter.put(
  "/admin/coupons/:couponId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const couponId = String(req.params.couponId);
    const data = couponSchema.parse(req.body);

    const existing = await Coupon.findById(couponId);
    if (!existing) return fail(res, "NOT_FOUND", "Coupon not found.", 404);

    if (data.code !== existing.code) {
      const clash = await Coupon.findOne({ code: data.code }).lean<{ _id: any }>();
      if (clash) return fail(res, "CODE_TAKEN", "Code already in use.", 409, { code: "Already in use" });
    }

    Object.assign(existing, couponPayload(data));
    await existing.save();
    await audit(
      { actor: admin, action: "admin.coupon.update", entityType: "Coupon", entityId: couponId, metadata: { code: existing.code } },
      req
    );
    return ok(res, { id: String(existing._id), code: existing.code, discountType: existing.discountType, value: existing.value, isActive: existing.isActive });
  })
);

adminRouter.delete(
  "/admin/coupons/:couponId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const couponId = String(req.params.couponId);
    const coupon = await Coupon.findById(couponId).select("redemptions").lean<{ redemptions: unknown[] } | null>();
    if (coupon && (coupon.redemptions ?? []).length > 0) {
      await Coupon.updateOne({ _id: couponId }, { isActive: false });
      await audit(
        { actor: admin, action: "admin.coupon.deactivate", entityType: "Coupon", entityId: couponId, metadata: { reason: "has redemptions" } },
        req
      );
      return ok(res, { deactivated: true, message: "Coupon has redemptions — deactivated instead of deleted." });
    }
    await Coupon.deleteOne({ _id: couponId });
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
    const banners = await HomepageBanner.find().sort({ sortOrder: 1 }).lean<any[]>();
    return ok(res, banners.map((b) => ({ id: String(b._id), title: b.title, subtitle: b.subtitle ?? null, imageUrl: b.imageUrl, ctaLabel: b.ctaLabel ?? null, ctaHref: b.ctaHref ?? null, sortOrder: b.sortOrder, isActive: b.isActive }))
    );
  })
);

adminRouter.post(
  "/admin/banners",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = bannerSchema.parse(req.body);
    const banner = await HomepageBanner.create({
      title: data.title,
      subtitle: data.subtitle || null,
      imageUrl: data.imageUrl,
      ctaLabel: data.ctaLabel || null,
      ctaHref: data.ctaHref || null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    });
    await audit(
      { actor: admin, action: "admin.banner.create", entityType: "HomepageBanner", entityId: String(banner._id), metadata: { title: banner.title } },
      req
    );
    return ok(res, { id: String(banner._id), title: banner.title }, 201);
  })
);

adminRouter.put(
  "/admin/banners/:bannerId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const bannerId = String(req.params.bannerId);
    const data = bannerSchema.parse(req.body);
    const banner = await HomepageBanner.findByIdAndUpdate(
      bannerId,
      {
        title: data.title,
        subtitle: data.subtitle || null,
        imageUrl: data.imageUrl,
        ctaLabel: data.ctaLabel || null,
        ctaHref: data.ctaHref || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
      { new: true }
    );
    if (!banner) return fail(res, "NOT_FOUND", "Banner not found.", 404);
    await audit(
      { actor: admin, action: "admin.banner.update", entityType: "HomepageBanner", entityId: bannerId },
      req
    );
    return ok(res, { id: String(banner._id), title: banner.title });
  })
);

adminRouter.delete(
  "/admin/banners/:bannerId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const bannerId = String(req.params.bannerId);
    await HomepageBanner.deleteOne({ _id: bannerId });
    await audit(
      { actor: admin, action: "admin.banner.delete", entityType: "HomepageBanner", entityId: bannerId },
      req
    );
    return ok(res, { deleted: true });
  })
);

/* ================= Settings ================= */

adminRouter.get(
  "/admin/settings",
  handle(async (req, res) => {
    await requireAdmin(req);
    const rows = await SiteSetting.find().sort({ key: 1 }).lean<any[]>();
    return ok(res, rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt })));
  })
);

adminRouter.put(
  "/admin/settings",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = settingsSchema.parse(req.body);

    for (const [key, value] of Object.entries(data)) {
      await SiteSetting.updateOne({ key }, { value }, { upsert: true });
    }

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

/* ================= Shipping rates ================= */

adminRouter.get(
  "/admin/shipping",
  handle(async (req, res) => {
    await requireAdmin(req);
    const rates = await ShippingRate.find().sort({ sortOrder: 1 }).lean<any[]>();
    return ok(res, rates.map((r) => ({ id: String(r._id), name: r.name, baseFee: r.baseFee, freeAbove: r.freeAbove ?? null, isActive: r.isActive, sortOrder: r.sortOrder }))
    );
  })
);

adminRouter.post(
  "/admin/shipping",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const data = shippingRateSchema.parse(req.body);
    const rate = await ShippingRate.create({
      name: data.name,
      baseFee: data.baseFee,
      freeAbove: data.freeAbove ?? null,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    });
    await audit(
      { actor: admin, action: "admin.shipping.create", entityType: "ShippingRate", entityId: String(rate._id), metadata: { name: rate.name } },
      req
    );
    return ok(res, { id: String(rate._id), name: rate.name }, 201);
  })
);

adminRouter.put(
  "/admin/shipping/:rateId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const rateId = String(req.params.rateId);
    const data = shippingRateSchema.parse(req.body);
    const rate = await ShippingRate.findByIdAndUpdate(
      rateId,
      {
        name: data.name,
        baseFee: data.baseFee,
        freeAbove: data.freeAbove ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
      { new: true }
    );
    if (!rate) return fail(res, "NOT_FOUND", "Rate not found.", 404);
    await audit(
      { actor: admin, action: "admin.shipping.update", entityType: "ShippingRate", entityId: rateId },
      req
    );
    return ok(res, { id: String(rate._id), name: rate.name });
  })
);

adminRouter.delete(
  "/admin/shipping/:rateId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    const rateId = String(req.params.rateId);
    await ShippingRate.deleteOne({ _id: rateId });
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
    const messages = await ContactMessage.find().sort({ createdAt: -1 }).limit(200).lean<any[]>();
    return ok(res, messages.map((m) => ({
        id: String(m._id),
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
    const updated = await ContactMessage.findByIdAndUpdate(messageId, { status }, { new: true }).lean<any>();
    if (!updated) return fail(res, "NOT_FOUND", "Message not found.", 404);
    await audit(
      { actor: admin, action: "admin.message.status", entityType: "ContactMessage", entityId: messageId, metadata: { status } },
      req
    );
    return ok(res, { id: String(updated._id), status: updated.status });
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

    // Resolve the customer: registered user by email, else the shared
    // walk-in account (Order.userId is required by the schema).
    let customer: { _id: any; name: string; email: string } | null = null;
    if (data.customerEmail) {
      customer = await User.findOne({ email: data.customerEmail })
        .select("_id name email")
        .lean<{ _id: any; name: string; email: string } | null>();
    }
    if (!customer) {
      customer = await User.findOneAndUpdate(
        { email: WALKIN_EMAIL },
        {
          $setOnInsert: {
            email: WALKIN_EMAIL,
            name: "Walk-in Customer",
            role: "CUSTOMER",
            passwordHash: randomBytes(24).toString("hex"), // unusable random password
            phone: null,
          },
        },
        { new: true, upsert: true, select: "_id name email" }
      ).lean<any>();
    }

    // Load every referenced product once; build a variant lookup map
    const variantIds = data.items.map((i) => new mongoose.Types.ObjectId(i.variantId));
    const products = await Product.find({
      status: "ACTIVE",
      "variants._id": { $in: variantIds },
    }).lean<any[]>();
    const variantMap = new Map<string, { product: any; variant: any }>();
    for (const p of products) {
      for (const v of p.variants ?? []) {
        if (v.isActive && variantIds.some((id) => String(id) === String(v._id))) {
          variantMap.set(String(v._id), { product: p, variant: v });
        }
      }
    }

    // Resolve lines server-side — client only sends variantId + quantity
    const lines: {
      productId: any;
      variantId: any;
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
      const lineTotal = Math.round(variant.price * item.quantity * 100) / 100;
      subtotal += lineTotal;
      lines.push({
        productId: product._id,
        variantId: variant._id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        imageUrl: (product.images ?? []).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0]?.url ?? null,
        unitPrice: variant.price,
        quantity: item.quantity,
        lineTotal,
      });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    const discountAmount = Math.min(data.discountAmount ?? 0, subtotal);
    const grandTotal = Math.round((subtotal - discountAmount) * 100) / 100;
    if (grandTotal < 0) return fail(res, "VALIDATION_ERROR", "Invalid discount amount.", 422);

    const orderNumber = generateOrderNumber();
    const now = new Date();

    const session = await mongoose.startSession();
    let createdOrderId = "";
    try {
      await session.withTransaction(async () => {
        for (const line of lines) {
          const updated = await Product.updateOne(
            {
              _id: line.productId,
              status: "ACTIVE",
              variants: {
                $elemMatch: { _id: line.variantId, stock: { $gte: line.quantity }, isActive: true },
              },
            },
            { $inc: { "variants.$[v].stock": -line.quantity } },
            { arrayFilters: [{ "v._id": line.variantId }], session }
          );
          if (updated.modifiedCount !== 1) {
            throw new HttpError(
              "OUT_OF_STOCK",
              `${line.productName} (${line.variantName}) just went out of stock.`,
              409
            );
          }
          await StockMovement.create(
            [
              {
                variantId: line.variantId,
                delta: -line.quantity,
                reason: "ORDER_COMMIT",
                reference: orderNumber,
                note: "POS sale",
                createdById: admin.id,
              },
            ],
            { session }
          );
        }

        const [order] = await Order.create(
          [
            {
              orderNumber,
              userId: customer!._id,
              status: "CONFIRMED",
              paymentStatus: "PAID",
              paymentMethod: "GATEWAY",
              source: "POS",
              subtotal,
              discountTotal: discountAmount,
              shippingFee: 0,
              grandTotal,
              couponCode: null,
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
              items: lines,
              payment: {
                method: "GATEWAY",
                status: "PAID",
                amount: grandTotal,
                providerRef: `POS:${data.paymentMethod}`,
                verifiedAt: now,
              },
              events: [
                {
                  status: "CONFIRMED",
                  note: `Billed at counter via POS (${data.paymentMethod})`,
                },
              ],
            },
          ],
          { session }
        );
        createdOrderId = String(order._id);
      });
    } finally {
      await session.endSession();
    }

    // Rewards earn for registered customers (never for the walk-in account).
    let pointsEarned = 0;
    if (String(customer!._id) && customer!.email !== WALKIN_EMAIL) {
      const earn = await accrueEarn(createdOrderId, "POS sale confirmed");
      pointsEarned = earn.earned;
    }

    await audit(
      {
        actor: admin,
        action: "admin.pos.checkout",
        entityType: "Order",
        entityId: createdOrderId,
        metadata: { orderNumber, grandTotal, paymentMethod: data.paymentMethod, items: lines.length },
      },
      req
    );

    const populated = await Order.findById(createdOrderId).populate("userId", "name email").lean<any>();
    return ok(
      res,
      {
        order: serializeOrderDetail(populated),
        pointsEarned,
      },
      201
    );
  })
);
