import { Router, Request } from "express";
import mongoose from "mongoose";
import { Order, Product, User, Review, NewsletterSubscriber, RestockAlert, ReturnRequest } from "../models";
import { ok, fail, handle, assertSameOrigin, HttpError } from "../lib/http";
import { requireUser, requireAdmin, getCurrentUser } from "../lib/auth";
import { audit } from "../services/audit";
import { transitionOrderStatus } from "../services/orders";
import { rateLimit, getClientIp } from "../lib/rate-limit";
import {
  reviewCreateSchema,
  newsletterSubscribeSchema,
  restockAlertSchema,
  returnRequestSchema,
  returnStatusSchema,
  reviewModerationSchema,
} from "../validation";
import { serializeProduct } from "./storefront";

export const engagementRouter = Router();

/* ================= Product reviews (public read, customer write) ================= */

engagementRouter.get(
  "/products/:productId/reviews",
  handle(async (req, res) => {
    const productId = String(req.params.productId);
    if (!mongoose.isValidObjectId(productId)) return fail(res, "VALIDATION_ERROR", "Invalid product.", 422);

    // Public viewer sees own pending review too (so it's not lost after submit);
    // everyone sees approved reviews.
    const user = await getCurrentUser(req);
    const visibleStatuses: string[] = ["APPROVED"];
    const orFilter: Record<string, unknown>[] = [{ status: { $in: visibleStatuses } }];
    if (user) orFilter.push({ status: "PENDING", userId: new mongoose.Types.ObjectId(user.id) });

    const [reviews, summary] = await Promise.all([
      Review.find({ productId, $or: orFilter }).sort({ createdAt: -1 }).limit(50).lean<any[]>(),
      Review.aggregate<{ _id: number; count: number }>([
        { $match: { productId: new mongoose.Types.ObjectId(productId), status: "APPROVED" } },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
      ]),
    ]);

    const count = summary.reduce((s, r) => s + r.count, 0);
    const avg = count ? summary.reduce((s, r) => s + r._id * r.count, 0) / count : 0;
    const distribution = Object.fromEntries(summary.map((r) => [String(r._id), r.count]));

    const mine = user
      ? reviews.find((r) => String(r.userId) === user.id && r.status === "PENDING") ?? null
      : null;

    return ok(res, {
      summary: { average: Math.round(avg * 10) / 10, count, distribution },
      reviews: reviews.map((r) => ({
        id: String(r._id),
        authorName: r.authorName,
        rating: r.rating,
        title: r.title ?? "",
        body: r.body,
        isVerifiedPurchase: !!r.isVerifiedPurchase,
        status: r.status,
        isMine: user ? String(r.userId) === user.id : false,
        createdAt: r.createdAt,
      })),
      myPendingReview: mine
        ? { id: String(mine._id), rating: mine.rating, title: mine.title ?? "", body: mine.body }
        : null,
    });
  })
);

engagementRouter.post(
  "/products/:productId/reviews",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const productId = String(req.params.productId);
    if (!mongoose.isValidObjectId(productId)) return fail(res, "VALIDATION_ERROR", "Invalid product.", 422);

    const product = await Product.findOne({ _id: productId, status: "ACTIVE" }).select("_id").lean<any>();
    if (!product) return fail(res, "NOT_FOUND", "Product not found.", 404);

    const rl = rateLimit(`review:${user.id}`, 8, 60 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many reviews submitted. Please try later.", 429);

    const data = reviewCreateSchema.parse(req.body);

    // Verified purchase: any non-cancelled order containing this product.
    const purchased = await Order.exists({
      userId: user.id,
      status: { $in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] },
      "items.productId": new mongoose.Types.ObjectId(productId),
    });

    const doc = await Review.findOneAndUpdate(
      { productId: new mongoose.Types.ObjectId(productId), userId: new mongoose.Types.ObjectId(user.id) },
      {
        authorName: user.name || "Stellora Customer",
        rating: data.rating,
        title: data.title || "",
        body: data.body,
        isVerifiedPurchase: !!purchased,
        status: "PENDING",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<any>();

    await audit(
      { actor: user, action: "review.submit", entityType: "Review", entityId: String(doc._id), metadata: { productId } },
      req
    );

    return ok(res, { submitted: true, status: "PENDING", isUpdate: true }, 201);
  })
);

/* ================= Newsletter (public) ================= */

engagementRouter.post(
  "/newsletter",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`newsletter:${ip}`, 6, 10 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many attempts. Please try later.", 429);

    const data = newsletterSubscribeSchema.parse(req.body);
    await NewsletterSubscriber.updateOne(
      { email: data.email },
      { $set: { unsubscribedAt: null }, $setOnInsert: { source: data.source || "footer" } },
      { upsert: true }
    );
    return ok(res, { subscribed: true, message: "You're on the list! Welcome to Stellora." }, 201);
  })
);

/* ================= Back-in-stock alerts (public) ================= */

engagementRouter.post(
  "/restock-alerts",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`restock:${ip}`, 8, 10 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many attempts. Please try later.", 429);

    const data = restockAlertSchema.parse(req.body);
    if (!mongoose.isValidObjectId(data.productId)) {
      return fail(res, "VALIDATION_ERROR", "Invalid product.", 422);
    }
    await RestockAlert.updateOne(
      { productId: new mongoose.Types.ObjectId(data.productId), email: data.email },
      {
        $setOnInsert: {
          variantId: data.variantId && mongoose.isValidObjectId(data.variantId)
            ? new mongoose.Types.ObjectId(data.variantId)
            : null,
        },
      },
      { upsert: true }
    );
    return ok(res, { registered: true, message: "We'll email you the moment it's back." }, 201);
  })
);

/* ================= Recently viewed hydration (public) ================= */

engagementRouter.get(
  "/products/by-ids",
  handle(async (req: Request, res) => {
    const raw = String(req.query.ids ?? "");
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => mongoose.isValidObjectId(s))
      .slice(0, 12)
      .map((s) => new mongoose.Types.ObjectId(s));
    if (ids.length === 0) return ok(res, []);

    const products = await Product.find({
      _id: { $in: ids },
      status: "ACTIVE",
    })
      .populate("categoryId", "name slug")
      .lean<any[]>();

    // Preserve the caller's order (most recently viewed first)
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);
    return ok(res, ordered.map((p: any) => serializeProduct(p)));
  })
);

/* ================= Customer order cancellation ================= */

engagementRouter.post(
  "/orders/:orderNumber/cancel",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const order = await Order.findOne({ orderNumber: String(req.params.orderNumber).toUpperCase(), userId: user.id })
      .select("_id status")
      .lean<any>();
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    if (!["PENDING", "CONFIRMED", "PROCESSING"].includes(order.status)) {
      return fail(res, "INVALID_TRANSITION", "This order can no longer be cancelled. Contact support for help.", 422);
    }
    await transitionOrderStatus(order._id, "CANCELLED", {
      actorId: user.id,
      note: "Cancelled by customer",
    });
    await audit({ actor: user, action: "order.customer_cancel", entityType: "Order", entityId: order.orderNumber }, req);
    return ok(res, { cancelled: true, status: "CANCELLED" });
  })
);

/* ================= Return / Exchange requests ================= */

engagementRouter.post(
  "/orders/:orderNumber/requests",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const order = await Order.findOne({ orderNumber: String(req.params.orderNumber).toUpperCase(), userId: user.id })
      .select("_id orderNumber status items")
      .lean<any>();
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    if (!["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)) {
      return fail(res, "INVALID_TRANSITION", "Requests can only be raised on active or delivered orders.", 422);
    }

    const rl = rateLimit(`return:${user.id}`, 6, 60 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many requests. Please try later.", 429);

    const data = returnRequestSchema.parse(req.body);

    // Keep only items that actually belong to this order.
    const orderItemNames = new Set((order.items ?? []).map((i: any) => i.productName));
    const items = data.items
      .filter((i) => orderItemNames.has(i.productName))
      .map((i, idx) => ({
        orderItemId: (order.items ?? [])[idx] ? String((order.items ?? [])[idx]._id ?? "") : "",
        productName: i.productName,
        variantName: i.variantName || "",
        quantity: i.quantity,
      }));
    if (items.length === 0) {
      return fail(res, "VALIDATION_ERROR", "Selected items are not part of this order.", 422, { items: "Select items from this order." });
    }

    const existing = await ReturnRequest.countDocuments({ orderNumber: order.orderNumber, status: { $in: ["REQUESTED", "APPROVED"] } });
    if (existing > 0) {
      return fail(res, "DUPLICATE", "There is already an open request for this order.", 409);
    }

    const created = await ReturnRequest.create({
      orderNumber: order.orderNumber,
      userId: user.id,
      type: data.type,
      reason: data.reason,
      details: data.details || "",
      items,
      status: "REQUESTED",
    });
    await audit({ actor: user, action: `order.${data.type.toLowerCase()}_request`, entityType: "ReturnRequest", entityId: String(created._id) }, req);

    return ok(res, {
      id: String(created._id),
      orderNumber: created.orderNumber,
      type: created.type,
      status: created.status,
      message: "Request submitted. Our team will reach out within 24-48 hours.",
    }, 201);
  })
);

engagementRouter.get(
  "/orders/:orderNumber/requests",
  handle(async (req, res) => {
    const user = await requireUser(req);
    const requests = await ReturnRequest.find({
      orderNumber: String(req.params.orderNumber).toUpperCase(),
      userId: user.id,
    })
      .sort({ createdAt: -1 })
      .lean<any[]>();
    return ok(res, requests.map((r) => ({
      id: String(r._id),
      orderNumber: r.orderNumber,
      type: r.type,
      reason: r.reason,
      details: r.details ?? "",
      items: r.items ?? [],
      status: r.status,
      adminNote: r.adminNote ?? null,
      createdAt: r.createdAt,
    })));
  })
);

/* ================= Admin: review moderation ================= */

engagementRouter.get(
  "/admin/reviews",
  handle(async (req, res) => {
    await requireAdmin(req);
    const status = req.query.status ? String(req.query.status) : undefined;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const perPage = 20;
    const where: Record<string, unknown> = status ? { status } : {};

    const [rows, total] = await Promise.all([
      Review.find(where)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate("productId", "name slug")
        .lean<any[]>(),
      Review.countDocuments(where),
    ]);

    return ok(res, {
      reviews: rows.map((r) => ({
        id: String(r._id),
        product: r.productId ? { name: r.productId.name, slug: r.productId.slug } : null,
        authorName: r.authorName,
        authorEmail: r.userId ? `user:${String(r.userId).slice(-6)}` : null,
        rating: r.rating,
        title: r.title ?? "",
        body: r.body,
        isVerifiedPurchase: !!r.isVerifiedPurchase,
        status: r.status,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / perPage)),
    });
  })
);

engagementRouter.post(
  "/admin/reviews/:reviewId/status",
  handle(async (req, res) => {
    await requireAdmin(req);
    assertSameOrigin(req);
    const data = reviewModerationSchema.parse(req.body);
    const updated = await Review.findByIdAndUpdate(
      req.params.reviewId,
      { status: data.status },
      { new: true }
    ).lean<any>();
    if (!updated) return fail(res, "NOT_FOUND", "Review not found.", 404);
    await audit({ action: `review.${data.status.toLowerCase()}`, entityType: "Review", entityId: String(updated._id) }, req);
    return ok(res, { id: String(updated._id), status: updated.status });
  })
);

engagementRouter.delete(
  "/admin/reviews/:reviewId",
  handle(async (req, res) => {
    const admin = await requireAdmin(req);
    assertSameOrigin(req);
    const deleted = await Review.findByIdAndDelete(req.params.reviewId).lean<any>();
    if (!deleted) return fail(res, "NOT_FOUND", "Review not found.", 404);
    await audit({ actor: admin, action: "review.delete", entityType: "Review", entityId: String(deleted._id) }, req);
    return ok(res, { deleted: true });
  })
);

/* ================= Admin: newsletter + restock alerts ================= */

engagementRouter.get(
  "/admin/newsletter",
  handle(async (req, res) => {
    await requireAdmin(req);
    const rows = await NewsletterSubscriber.find().sort({ createdAt: -1 }).limit(1000).lean<any[]>();
    return ok(res, rows.map((r) => ({
      id: String(r._id),
      email: r.email,
      source: r.source ?? "footer",
      subscribed: !r.unsubscribedAt,
      subscribedAt: r.createdAt,
    })));
  })
);

engagementRouter.get(
  "/admin/newsletter/export",
  handle(async (req, res) => {
    await requireAdmin(req);
    const rows = await NewsletterSubscriber.find({ unsubscribedAt: null })
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean<any[]>();
    const csv = ["email,source,subscribedAt", ...rows.map((r) => `${r.email},${r.source ?? "footer"},${new Date(r.createdAt).toISOString()}`)].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=stellora-newsletter.csv");
    return res.status(200).send(csv);
  })
);

engagementRouter.get(
  "/admin/restock-alerts",
  handle(async (req, res) => {
    await requireAdmin(req);
    const rows = await RestockAlert.find()
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("productId", "name slug")
      .lean<any[]>();
    return ok(res, rows.map((r) => ({
      id: String(r._id),
      email: r.email,
      product: r.productId ? { name: r.productId.name, slug: r.productId.slug } : null,
      notifiedAt: r.notifiedAt,
      requestedAt: r.createdAt,
    })));
  })
);

engagementRouter.post(
  "/admin/restock-alerts/:alertId/notified",
  handle(async (req, res) => {
    const admin = await requireAdmin(req);
    assertSameOrigin(req);
    const updated = await RestockAlert.findByIdAndUpdate(
      req.params.alertId,
      { notifiedAt: new Date() },
      { new: true }
    ).lean<any>();
    if (!updated) return fail(res, "NOT_FOUND", "Alert not found.", 404);
    await audit({ actor: admin, action: "restock.notified", entityType: "RestockAlert", entityId: String(updated._id) }, req);
    return ok(res, { id: String(updated._id), notifiedAt: updated.notifiedAt });
  })
);

/* ================= Admin: returns management ================= */

engagementRouter.get(
  "/admin/returns",
  handle(async (req, res) => {
    await requireAdmin(req);
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Record<string, unknown> = status ? { status } : {};
    const rows = await ReturnRequest.find(where)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("userId", "name email")
      .lean<any[]>();
    return ok(res, rows.map((r) => ({
      id: String(r._id),
      orderNumber: r.orderNumber,
      customer: r.userId ? { name: r.userId.name, email: r.userId.email } : null,
      type: r.type,
      reason: r.reason,
      details: r.details ?? "",
      items: r.items ?? [],
      status: r.status,
      adminNote: r.adminNote ?? null,
      createdAt: r.createdAt,
    })));
  })
);

engagementRouter.post(
  "/admin/returns/:requestId/status",
  handle(async (req, res) => {
    const admin = await requireAdmin(req);
    assertSameOrigin(req);
    const data = returnStatusSchema.parse(req.body);
    const updated = await ReturnRequest.findByIdAndUpdate(
      req.params.requestId,
      { status: data.status, adminNote: data.adminNote || null },
      { new: true }
    ).lean<any>();
    if (!updated) return fail(res, "NOT_FOUND", "Request not found.", 404);
    await audit(
      { actor: admin, action: `return.${data.status.toLowerCase()}`, entityType: "ReturnRequest", entityId: String(updated._id) },
      req
    );
    return ok(res, { id: String(updated._id), status: updated.status, adminNote: updated.adminNote });
  })
);

/* ================= Admin: CSV exports ================= */

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

engagementRouter.get(
  "/admin/export/:entity",
  handle(async (req, res) => {
    await requireAdmin(req);
    const entity = String(req.params.entity);

    if (entity === "orders") {
      const orders = await Order.find().sort({ createdAt: -1 }).limit(5000).lean<any[]>();
      const csv = toCsv(
        ["orderNumber", "status", "paymentStatus", "paymentMethod", "subtotal", "discountTotal", "shippingFee", "grandTotal", "shipTo", "placedAt"],
        orders.map((o) => [
          o.orderNumber, o.status, o.paymentStatus, o.paymentMethod, o.subtotal, o.discountTotal, o.shippingFee, o.grandTotal,
          `${o.shipName ?? ""}, ${o.shipCity ?? ""} ${o.shipPincode ?? ""}`.trim(),
          new Date(o.createdAt).toISOString(),
        ])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-orders.csv");
      return res.status(200).send(csv);
    }

    if (entity === "customers") {
      const users = await User.find({ role: "CUSTOMER" }).sort({ createdAt: -1 }).limit(5000).lean<any[]>();
      const csv = toCsv(
        ["name", "email", "phone", "addresses", "joinedAt"],
        users.map((u) => [u.name, u.email, u.phone ?? "", (u.addresses ?? []).length, new Date(u.createdAt).toISOString()])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-customers.csv");
      return res.status(200).send(csv);
    }

    if (entity === "products") {
      const products = await Product.find().sort({ createdAt: -1 }).limit(5000).populate("categoryId", "name").lean<any[]>();
      const csv = toCsv(
        ["name", "slug", "category", "status", "featured", "newArrival", "bestSeller", "trending", "variants", "priceMin"],
        products.map((p) => [
          p.name,
          p.slug,
          p.categoryId?.name ?? "",
          p.status,
          p.isFeatured ? "yes" : "no",
          p.isNewArrival ? "yes" : "no",
          p.isBestSeller ? "yes" : "no",
          p.isTrending ? "yes" : "no",
          (p.variants ?? []).length,
          (p.variants ?? []).length ? Math.min(...p.variants.map((v: any) => v.price)) : "",
        ])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-products.csv");
      return res.status(200).send(csv);
    }

    throw new HttpError("NOT_FOUND", "Unknown export entity.", 404);
  })
);
