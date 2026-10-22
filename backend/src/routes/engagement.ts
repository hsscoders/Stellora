import { Router, Request } from "express";
import multer from "multer";
import { Prisma, QuestionStatus, ReviewStatus, ReturnStatus } from "@prisma/client";
import { db, newId, isValidId } from "../lib/db";
import { ok, fail, handle, assertSameOrigin, HttpError } from "../lib/http";
import { requireUser, requireAdmin, getCurrentUser } from "../lib/auth";
import { audit } from "../services/audit";
import { transitionOrderStatus } from "../services/orders";
import { rateLimit, getClientIp } from "../lib/rate-limit";
import { slugify } from "../lib/utils";
import {
  reviewCreateSchema,
  newsletterSubscribeSchema,
  restockAlertSchema,
  returnRequestSchema,
  returnStatusSchema,
  reviewModerationSchema,
  questionCreateSchema,
  questionAnswerSchema,
  questionModerationSchema,
} from "../validation";
import { serializeProduct } from "./storefront";

export const engagementRouter = Router();

const upload = multer({ storage: multer.memoryStorage() });

/* ================= Product reviews (public read, customer write) ================= */

engagementRouter.get(
  "/products/:productId/reviews",
  handle(async (req, res) => {
    const productId = String(req.params.productId);
    if (!isValidId(productId)) return fail(res, "VALIDATION_ERROR", "Invalid product.", 422);

    // Public viewer sees own pending review too (so it's not lost after submit);
    // everyone sees approved reviews.
    const user = await getCurrentUser(req);
    const orFilter: Prisma.ReviewWhereInput[] = [{ status: "APPROVED" }];
    if (user) orFilter.push({ status: "PENDING", userId: user.id });

    const [reviews, summary] = await Promise.all([
      db.review.findMany({
        where: { productId, OR: orFilter },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.review.groupBy({
        by: ["rating"],
        where: { productId, status: "APPROVED" },
        _count: { _all: true },
      }),
    ]);

    const count = summary.reduce((s, r) => s + r._count._all, 0);
    const avg = count ? summary.reduce((s, r) => s + r.rating * r._count._all, 0) / count : 0;
    const distribution = Object.fromEntries(summary.map((r) => [String(r.rating), r._count._all]));

    const mine = user
      ? reviews.find((r) => r.userId === user.id && r.status === "PENDING") ?? null
      : null;

    return ok(res, {
      summary: { average: Math.round(avg * 10) / 10, count, distribution },
      reviews: reviews.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        rating: r.rating,
        title: r.title ?? "",
        body: r.body,
        isVerifiedPurchase: !!r.isVerifiedPurchase,
        status: r.status,
        isMine: user ? r.userId === user.id : false,
        createdAt: r.createdAt,
      })),
      myPendingReview: mine
        ? { id: mine.id, rating: mine.rating, title: mine.title ?? "", body: mine.body }
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
    if (!isValidId(productId)) return fail(res, "VALIDATION_ERROR", "Invalid product.", 422);

    const product = await db.product.findFirst({
      where: { id: productId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!product) return fail(res, "NOT_FOUND", "Product not found.", 404);

    const rl = rateLimit(`review:${user.id}`, 8, 60 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many reviews submitted. Please try later.", 429);

    const data = reviewCreateSchema.parse(req.body);

    // Verified purchase: any non-cancelled order containing this product.
    const purchased = await db.order.findFirst({
      where: {
        userId: user.id,
        status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] },
        items: { some: { productId } },
      },
      select: { id: true },
    });

    const changes = {
      authorName: user.name || "Stellora Customer",
      rating: data.rating,
      title: data.title || "",
      body: data.body,
      isVerifiedPurchase: !!purchased,
      status: "PENDING" as const,
    };

    let doc;
    try {
      // Upsert on the (productId, userId) compound unique — one review per user per product.
      doc = await db.review.upsert({
        where: { productId_userId: { productId, userId: user.id } },
        create: { id: newId(), productId, userId: user.id, ...changes },
        update: changes,
      });
    } catch (err: unknown) {
      // Lost a concurrent-create race on the compound unique — the row now
      // exists, so apply the same update instead of surfacing a duplicate error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        doc = await db.review.update({
          where: { productId_userId: { productId, userId: user.id } },
          data: changes,
        });
      } else {
        throw err;
      }
    }

    await audit(
      { actor: user, action: "review.submit", entityType: "Review", entityId: doc.id, metadata: { productId } },
      req
    );

    // Realtime: review moderation queue grows live in the admin console.
    try {
      const { notifyStatsBump } = await import("../services/realtime");
      notifyStatsBump("review");
    } catch {
      // best-effort
    }

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
    // $setOnInsert semantics: source is fixed on first subscribe, resubscribing
    // merely clears an earlier unsubscribe.
    await db.newsletterSubscriber.upsert({
      where: { email: data.email },
      create: { id: newId(), email: data.email, source: data.source || "footer", unsubscribedAt: null },
      update: { unsubscribedAt: null },
    });
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
    if (!isValidId(data.productId)) {
      return fail(res, "VALIDATION_ERROR", "Invalid product.", 422);
    }
    // Never register alerts for products that no longer exist.
    const productExists = await db.product.findFirst({
      where: { id: data.productId },
      select: { id: true },
    });
    if (!productExists) {
      return fail(res, "NOT_FOUND", "This product is no longer available.", 404);
    }
    // $setOnInsert semantics: an existing alert row is left untouched.
    await db.restockAlert.upsert({
      where: { productId_email: { productId: data.productId, email: data.email } },
      create: {
        id: newId(),
        productId: data.productId,
        email: data.email,
        variantId: data.variantId && isValidId(data.variantId) ? data.variantId : null,
      },
      update: {},
    });
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
      .filter((s) => isValidId(s))
      .slice(0, 12);
    if (ids.length === 0) return ok(res, []);

    const products = await db.product.findMany({
      where: { id: { in: ids }, status: "ACTIVE" },
      include: {
        category: { select: { name: true, slug: true } },
        images: true,
        variants: { orderBy: { createdAt: "asc" } },
      },
    });

    // serializeProduct still speaks the Mongoose lean shape (_id + populated
    // categoryId subdoc); map the Prisma rows into that shape.
    const legacy = products.map((p) => ({
      ...p,
      _id: p.id,
      categoryId: p.categoryId
        ? { _id: p.categoryId, name: p.category.name, slug: p.category.slug }
        : null,
      images: p.images.map((i) => ({ ...i, _id: i.id })),
      variants: p.variants.map((v) => ({ ...v, _id: v.id })),
    }));

    // Preserve the caller's order (most recently viewed first)
    const byId = new Map(legacy.map((p) => [String(p._id), p]));
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
    const order = await db.order.findFirst({
      where: { orderNumber: String(req.params.orderNumber).toUpperCase(), userId: user.id },
      select: { id: true, status: true },
    });
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    if (!["PENDING", "CONFIRMED", "PROCESSING"].includes(order.status)) {
      return fail(res, "INVALID_TRANSITION", "This order can no longer be cancelled. Contact support for help.", 422);
    }
    await transitionOrderStatus(order.id, "CANCELLED", {
      actorId: user.id,
      note: "Cancelled by customer",
    });
    await audit({ actor: user, action: "order.customer_cancel", entityType: "Order", entityId: (order as { orderNumber?: string }).orderNumber }, req);
    return ok(res, { cancelled: true, status: "CANCELLED" });
  })
);

/* ================= Return / Exchange requests ================= */

engagementRouter.post(
  "/orders/:orderNumber/requests",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const order = await db.order.findFirst({
      where: { orderNumber: String(req.params.orderNumber).toUpperCase(), userId: user.id },
      select: { id: true, orderNumber: true, status: true, items: true },
    });
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    if (!["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)) {
      return fail(res, "INVALID_TRANSITION", "Requests can only be raised on active or delivered orders.", 422);
    }

    const rl = rateLimit(`return:${user.id}`, 6, 60 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many requests. Please try later.", 429);

    const data = returnRequestSchema.parse(req.body);

    // Keep only items that actually belong to this order.
    const orderItemNames = new Set((order.items ?? []).map((i) => i.productName));
    const items = data.items
      .filter((i) => orderItemNames.has(i.productName))
      .map((i, idx) => ({
        orderItemId: (order.items ?? [])[idx] ? String((order.items ?? [])[idx].id ?? "") : "",
        productName: i.productName,
        variantName: i.variantName || "",
        quantity: i.quantity,
      }));
    if (items.length === 0) {
      return fail(res, "VALIDATION_ERROR", "Selected items are not part of this order.", 422, { items: "Select items from this order." });
    }

    const existing = await db.returnRequest.count({
      where: { orderNumber: order.orderNumber, status: { in: ["REQUESTED", "APPROVED"] } },
    });
    if (existing > 0) {
      return fail(res, "DUPLICATE", "There is already an open request for this order.", 409);
    }

    const created = await db.returnRequest.create({
      data: {
        id: newId(),
        orderNumber: order.orderNumber,
        userId: user.id,
        type: data.type,
        reason: data.reason,
        details: data.details || "",
        status: "REQUESTED",
        items: { create: items.map((it) => ({ id: newId(), ...it })) },
      },
    });
    await audit({ actor: user, action: `order.${data.type.toLowerCase()}_request`, entityType: "ReturnRequest", entityId: created.id }, req);

    // Realtime: returns/exchanges queue pings the admin console.
    try {
      const { notifyStatsBump } = await import("../services/realtime");
      notifyStatsBump("return");
    } catch {
      // best-effort
    }

    return ok(res, {
      id: created.id,
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
    const requests = await db.returnRequest.findMany({
      where: { orderNumber: String(req.params.orderNumber).toUpperCase(), userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
    return ok(res, requests.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      type: r.type,
      reason: r.reason,
      details: r.details ?? "",
      items: r.items.map((it) => ({
        orderItemId: it.orderItemId,
        productName: it.productName,
        variantName: it.variantName,
        quantity: it.quantity,
      })),
      status: r.status,
      adminNote: r.adminNote ?? null,
      createdAt: r.createdAt,
    })));
  })
);

/* ================= Product Q&A (public read, customer ask, admin answer) ================= */

function maskAuthor(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] || "Customer";
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : "";
  return `${first}${lastInitial}`;
}

engagementRouter.get(
  "/products/:productId/questions",
  handle(async (req, res) => {
    const productId = String(req.params.productId);
    if (!isValidId(productId)) return fail(res, "VALIDATION_ERROR", "Invalid product.", 422);

    // Public sees answered questions; a signed-in viewer also sees their own
    // still-pending questions so they don't wonder where their ask went.
    const user = await getCurrentUser(req);
    const orFilter: Prisma.ProductQuestionWhereInput[] = [{ status: "ANSWERED" }];
    if (user) {
      orFilter.push({ status: "PENDING", userId: user.id });
    }

    const rows = await db.productQuestion.findMany({
      where: { productId, OR: orFilter },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return ok(res, {
      questions: rows.map((q) => ({
        id: q.id,
        author: maskAuthor(q.authorName ?? "Customer"),
        question: q.question,
        answer: q.answer ?? null,
        answeredAt: q.answeredAt ?? null,
        status: q.status,
        isMine: user ? q.userId === user.id : false,
        createdAt: q.createdAt,
      })),
    });
  })
);

engagementRouter.post(
  "/products/:productId/questions",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const productId = String(req.params.productId);
    if (!isValidId(productId)) return fail(res, "VALIDATION_ERROR", "Invalid product.", 422);

    const product = await db.product.findFirst({
      where: { id: productId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!product) return fail(res, "NOT_FOUND", "Product not found.", 404);

    const rl = rateLimit(`question:${user.id}`, 6, 30 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many questions submitted. Please try later.", 429);

    // Anti-spam: at most 3 open questions per customer per product.
    const open = await db.productQuestion.count({
      where: { productId, userId: user.id, status: "PENDING" },
    });
    if (open >= 3) {
      return fail(res, "TOO_MANY_OPEN", "You already have 3 open questions on this product.", 409);
    }

    const data = questionCreateSchema.parse(req.body);
    const created = await db.productQuestion.create({
      data: {
        id: newId(),
        productId,
        userId: user.id,
        authorName: user.name || "Stellora Customer",
        question: data.question,
        status: "PENDING",
      },
    });

    await audit(
      { actor: user, action: "question.submit", entityType: "ProductQuestion", entityId: created.id, metadata: { productId } },
      req
    );

    // Realtime: Q&A queue pings the admin console.
    try {
      const { notifyStatsBump } = await import("../services/realtime");
      notifyStatsBump("question");
    } catch {
      // best-effort
    }

    return ok(res, { submitted: true, status: "PENDING" }, 201);
  })
);

/* ================= Admin: Q&A management ================= */

engagementRouter.get(
  "/admin/questions",
  handle(async (req, res) => {
    await requireAdmin(req);
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Prisma.ProductQuestionWhereInput = status ? { status: status as QuestionStatus } : {};

    const rows = await db.productQuestion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        product: { select: { name: true, slug: true } },
        user: { select: { name: true, email: true } },
      },
    });

    return ok(res, {
      questions: rows.map((q) => ({
        id: q.id,
        product: q.product ? { name: q.product.name, slug: q.product.slug } : null,
        customer: q.user ? { name: q.user.name, email: q.user.email } : null,
        authorName: q.authorName,
        question: q.question,
        answer: q.answer ?? null,
        status: q.status,
        createdAt: q.createdAt,
        answeredAt: q.answeredAt ?? null,
      })),
    });
  })
);

engagementRouter.post(
  "/admin/questions/:questionId/answer",
  handle(async (req, res) => {
    const admin = await requireAdmin(req);
    assertSameOrigin(req);
    const data = questionAnswerSchema.parse(req.body);
    const updated = await db.productQuestion
      .update({
        where: { id: String(req.params.questionId) },
        data: {
          answer: data.answer,
          status: "ANSWERED",
          answeredAt: new Date(),
          answeredById: admin.id,
        },
      })
      .catch(() => null);
    if (!updated) return fail(res, "NOT_FOUND", "Question not found.", 404);
    await audit({ actor: admin, action: "question.answer", entityType: "ProductQuestion", entityId: updated.id }, req);
    return ok(res, { id: updated.id, status: updated.status, answer: updated.answer });
  })
);

engagementRouter.post(
  "/admin/questions/:questionId/status",
  handle(async (req, res) => {
    const admin = await requireAdmin(req);
    assertSameOrigin(req);
    const data = questionModerationSchema.parse(req.body);
    const updated = await db.productQuestion
      .update({ where: { id: String(req.params.questionId) }, data: { status: data.status } })
      .catch(() => null);
    if (!updated) return fail(res, "NOT_FOUND", "Question not found.", 404);
    await audit({ actor: admin, action: `question.${data.status.toLowerCase()}`, entityType: "ProductQuestion", entityId: updated.id }, req);
    return ok(res, { id: updated.id, status: updated.status });
  })
);

engagementRouter.delete(
  "/admin/questions/:questionId",
  handle(async (req, res) => {
    const admin = await requireAdmin(req);
    assertSameOrigin(req);
    const deleted = await db.productQuestion
      .delete({ where: { id: String(req.params.questionId) } })
      .catch(() => null);
    if (!deleted) return fail(res, "NOT_FOUND", "Question not found.", 404);
    await audit({ actor: admin, action: "question.delete", entityType: "ProductQuestion", entityId: deleted.id }, req);
    return ok(res, { deleted: true });
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
    const where: Prisma.ReviewWhereInput = status ? { status: status as ReviewStatus } : {};

    const [rows, total] = await Promise.all([
      db.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { product: { select: { name: true, slug: true } } },
      }),
      db.review.count({ where }),
    ]);

    return ok(res, {
      reviews: rows.map((r) => ({
        id: r.id,
        product: r.product ? { name: r.product.name, slug: r.product.slug } : null,
        authorName: r.authorName,
        authorEmail: r.userId ? `user:${r.userId.slice(-6)}` : null,
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
    const updated = await db.review
      .update({ where: { id: String(req.params.reviewId) }, data: { status: data.status } })
      .catch(() => null);
    if (!updated) return fail(res, "NOT_FOUND", "Review not found.", 404);
    await audit({ action: `review.${data.status.toLowerCase()}`, entityType: "Review", entityId: updated.id }, req);
    return ok(res, { id: updated.id, status: updated.status });
  })
);

engagementRouter.delete(
  "/admin/reviews/:reviewId",
  handle(async (req, res) => {
    const admin = await requireAdmin(req);
    assertSameOrigin(req);
    const deleted = await db.review
      .delete({ where: { id: String(req.params.reviewId) } })
      .catch(() => null);
    if (!deleted) return fail(res, "NOT_FOUND", "Review not found.", 404);
    await audit({ actor: admin, action: "review.delete", entityType: "Review", entityId: deleted.id }, req);
    return ok(res, { deleted: true });
  })
);

/* ================= Admin: newsletter + restock alerts ================= */

engagementRouter.get(
  "/admin/newsletter",
  handle(async (req, res) => {
    await requireAdmin(req);
    const rows = await db.newsletterSubscriber.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return ok(res, rows.map((r) => ({
      id: r.id,
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
    const rows = await db.newsletterSubscriber.findMany({
      where: { unsubscribedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
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
    const rows = await db.restockAlert.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    // RestockAlert carries a plain productId reference (no relation in the
    // schema) — resolve product names/slugs with a manual join, exactly like
    // the previous populate("productId", "name slug").
    const productIds = [...new Set(rows.map((r) => r.productId))];
    const alertProducts = productIds.length
      ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, slug: true } })
      : [];
    const productMap = new Map(alertProducts.map((p) => [p.id, p]));
    return ok(res, rows.map((r) => ({
      id: r.id,
      email: r.email,
      product: productMap.get(r.productId)
        ? { name: productMap.get(r.productId)!.name, slug: productMap.get(r.productId)!.slug }
        : null,
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
    const updated = await db.restockAlert
      .update({ where: { id: String(req.params.alertId) }, data: { notifiedAt: new Date() } })
      .catch(() => null);
    if (!updated) return fail(res, "NOT_FOUND", "Alert not found.", 404);
    await audit({ actor: admin, action: "restock.notified", entityType: "RestockAlert", entityId: updated.id }, req);
    return ok(res, { id: updated.id, notifiedAt: updated.notifiedAt });
  })
);

/* ================= Admin: returns management ================= */

engagementRouter.get(
  "/admin/returns",
  handle(async (req, res) => {
    await requireAdmin(req);
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Prisma.ReturnRequestWhereInput = status ? { status: status as ReturnStatus } : {};
    const rows = await db.returnRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { name: true, email: true } },
        items: true,
      },
    });
    return ok(res, rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      customer: r.user ? { name: r.user.name, email: r.user.email } : null,
      type: r.type,
      reason: r.reason,
      details: r.details ?? "",
      items: r.items.map((it) => ({
        orderItemId: it.orderItemId,
        productName: it.productName,
        variantName: it.variantName,
        quantity: it.quantity,
      })),
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
    const updated = await db.returnRequest
      .update({
        where: { id: String(req.params.requestId) },
        data: { status: data.status, adminNote: data.adminNote || null },
      })
      .catch(() => null);
    if (!updated) return fail(res, "NOT_FOUND", "Request not found.", 404);
    await audit(
      { actor: admin, action: `return.${data.status.toLowerCase()}`, entityType: "ReturnRequest", entityId: updated.id },
      req
    );
    return ok(res, { id: updated.id, status: updated.status, adminNote: updated.adminNote });
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
      const orders = await db.order.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
      const csv = toCsv(
        ["orderNumber", "status", "paymentStatus", "paymentMethod", "subtotal", "discountTotal", "shippingFee", "grandTotal", "shipTo", "placedAt"],
        orders.map((o) => [
          o.orderNumber, o.status, o.paymentStatus, o.paymentMethod, Number(o.subtotal), Number(o.discountTotal), Number(o.shippingFee), Number(o.grandTotal),
          `${o.shipName ?? ""}, ${o.shipCity ?? ""} ${o.shipPincode ?? ""}`.trim(),
          new Date(o.createdAt).toISOString(),
        ])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-orders.csv");
      return res.status(200).send(csv);
    }

    if (entity === "customers") {
      const users = await db.user.findMany({
        where: { role: "CUSTOMER" },
        orderBy: { createdAt: "desc" },
        take: 5000,
        include: { _count: { select: { addresses: true } } },
      });
      const csv = toCsv(
        ["name", "email", "phone", "addresses", "joinedAt"],
        users.map((u) => [u.name, u.email, u.phone ?? "", u._count.addresses, new Date(u.createdAt).toISOString()])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-customers.csv");
      return res.status(200).send(csv);
    }

    if (entity === "products") {
      // Variant-per-row export: round-trippable with POST /admin/products/import.
      const products = await db.product.findMany({
        orderBy: { createdAt: "desc" },
        take: 5000,
        include: {
          category: { select: { name: true } },
          images: true,
          variants: { orderBy: { createdAt: "asc" } },
        },
      });
      const rows: (string | number | null | undefined)[][] = [];
      for (const p of products) {
        const images = [...(p.images ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        if (!(p.variants ?? []).length) {
          rows.push([p.name, p.slug, p.category?.name ?? "", p.status, p.shortDescription ?? "", "", "", "", "", "", p.isFeatured ? "yes" : "no", p.isNewArrival ? "yes" : "no", p.isBestSeller ? "yes" : "no", p.isTrending ? "yes" : "no", images[0]?.url ?? ""]);
        }
        for (const v of p.variants ?? []) {
          rows.push([
            p.name,
            p.slug,
            p.category?.name ?? "",
            p.status,
            p.shortDescription ?? "",
            v.name ?? "",
            v.sku ?? "",
            v.price === null ? "" : Number(v.price),
            v.compareAtPrice === null ? "" : Number(v.compareAtPrice),
            v.stock ?? 0,
            p.isFeatured ? "yes" : "no",
            p.isNewArrival ? "yes" : "no",
            p.isBestSeller ? "yes" : "no",
            p.isTrending ? "yes" : "no",
            images[0]?.url ?? "",
          ]);
        }
      }
      const csv = toCsv(
        ["name", "slug", "category", "status", "shortDescription", "variantName", "sku", "price", "compareAtPrice", "stock", "featured", "newArrival", "bestSeller", "trending", "imageUrl"],
        rows
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-products.csv");
      return res.status(200).send(csv);
    }

    if (entity === "coupons") {
      const coupons = await db.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
      const csv = toCsv(
        ["code", "discountType", "value", "minSubtotal", "maxDiscount", "active", "startsAt", "endsAt", "usageLimit", "timesUsed"],
        coupons.map((c) => [
          c.code, c.discountType, Number(c.value), c.minSubtotal === null ? "" : Number(c.minSubtotal),
          c.maxDiscount === null ? "" : Number(c.maxDiscount), c.isActive ? "yes" : "no",
          c.startsAt ? new Date(c.startsAt).toISOString() : "", c.endsAt ? new Date(c.endsAt).toISOString() : "",
          c.usageLimit ?? "", c.timesUsed,
        ])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-coupons.csv");
      return res.status(200).send(csv);
    }

    if (entity === "inventory") {
      const variants = await db.productVariant.findMany({
        orderBy: [{ stock: "asc" }],
        take: 10000,
        include: { product: { select: { name: true, slug: true, status: true } } },
      });
      const csv = toCsv(
        ["product", "variant", "sku", "price", "stock", "lowStockThreshold", "stockValue", "active", "productStatus"],
        variants.map((v) => [
          v.product?.name ?? "", v.name ?? "", v.sku ?? "", Number(v.price), v.stock,
          v.lowStockThreshold, Math.round(Number(v.price) * v.stock * 100) / 100, v.isActive ? "yes" : "no", v.product?.status ?? "",
        ])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-inventory.csv");
      return res.status(200).send(csv);
    }

    if (entity === "newsletter") {
      const subs = await db.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 10000 });
      const csv = toCsv(
        ["email", "source", "subscribedAt", "unsubscribedAt"],
        subs.map((s) => [s.email, s.source, new Date(s.createdAt).toISOString(), s.unsubscribedAt ? new Date(s.unsubscribedAt).toISOString() : ""])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-newsletter.csv");
      return res.status(200).send(csv);
    }

    if (entity === "reviews") {
      const reviews = await db.review.findMany({
        orderBy: { createdAt: "desc" },
        take: 10000,
        include: { user: { select: { email: true } }, product: { select: { name: true } } },
      });
      const csv = toCsv(
        ["product", "author", "email", "rating", "title", "body", "status", "verifiedPurchase", "createdAt"],
        reviews.map((r) => [
          r.product?.name ?? "", r.authorName, r.user?.email ?? "", r.rating, r.title, r.body, r.status, r.isVerifiedPurchase ? "yes" : "no", new Date(r.createdAt).toISOString(),
        ])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-reviews.csv");
      return res.status(200).send(csv);
    }

    if (entity === "audit-logs") {
      const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10000 });
      const csv = toCsv(
        ["when", "actor", "action", "entityType", "entityId", "ip"],
        logs.map((l) => [new Date(l.createdAt).toISOString(), l.actorEmail ?? "", l.action, l.entityType, l.entityId ?? "", l.ip ?? ""])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-audit-logs.csv");
      return res.status(200).send(csv);
    }

    if (entity === "newsletter-subscribers") {
      const subs = await db.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 10000 });
      const csv = toCsv(["email", "subscribedAt"], subs.map((s) => [s.email, new Date(s.createdAt).toISOString()]));
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=stellora-subscribers.csv");
      return res.status(200).send(csv);
    }

    throw new HttpError("NOT_FOUND", "Unknown export entity.", 404);
  })
);

/* ================= Admin: product CSV import ================= */

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

engagementRouter.post(
  "/admin/products/import",
  upload.single("file"),
  handle(async (req, res) => {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);

    if (!req.file) return fail(res, "VALIDATION_ERROR", "Attach a CSV file in the 'file' field.", 400);
    const text = req.file.buffer.toString("utf8").replace(/^\uFEFF/, "");
    const table = parseCsv(text);
    if (table.length < 2) return fail(res, "VALIDATION_ERROR", "CSV needs a header row plus at least one product row.", 400);

    const header = table[0].map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const NEED = ["name", "sku", "price"];
    const missing = NEED.filter((n) => idx(n) === -1);
    if (missing.length) {
      return fail(res, "VALIDATION_ERROR", `Missing required column(s): ${missing.join(", ")}. Export the CSV from this page to get the exact format.`, 400);
    }

    const col = {
      name: idx("name"), slug: idx("slug"), category: idx("category"), status: idx("status"),
      shortDescription: idx("shortdescription"), variantName: idx("variantname"), sku: idx("sku"),
      price: idx("price"), compareAtPrice: idx("compareatprice"), stock: idx("stock"),
      featured: idx("featured"), newArrival: idx("newarrival"), bestSeller: idx("bestseller"),
      trending: idx("trending"), imageUrl: idx("imageurl"),
    };
    const yn = (v: string | undefined) => (v ?? "").trim().toLowerCase() === "yes";
    const num = (v: string | undefined, fallback: number | null = null) => {
      const s = (v ?? "").trim();
      if (s === "") return fallback; // Number("") === 0 — must not treat blank as zero
      const n = Number(s);
      return Number.isFinite(n) ? n : fallback;
    };

    // Group rows into products by slug (or slugified name)
    type VRow = { variantName: string; sku: string; price: number; compareAtPrice: number | null; stock: number };
    type PRow = {
      key: string; name: string; slug: string; category: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; shortDescription: string;
      flags: { featured: boolean; newArrival: boolean; bestSeller: boolean; trending: boolean };
      imageUrl: string; variants: VRow[];
    };
    const groups = new Map<string, PRow>();
    const rowErrors: { line: number; error: string }[] = [];

    for (let i = 1; i < table.length && groups.size < 200; i++) {
      const r = table[i];
      const line = i + 1;
      const name = (r[col.name] ?? "").trim();
      const sku = (r[col.sku] ?? "").trim().toUpperCase();
      const price = num(r[col.price]);
      if (!name || !sku || price === null) {
        rowErrors.push({ line, error: !name ? "missing name" : !sku ? "missing sku" : "invalid price" });
        continue;
      }
      const slug = (r[col.slug] ?? "").trim().toLowerCase() || slugify(name);
      const key = slug;
      let g = groups.get(key);
      if (!g) {
        g = {
          key, name, slug,
          category: (r[col.category] ?? "").trim(),
          status: (["DRAFT", "ACTIVE", "ARCHIVED"].includes((r[col.status] ?? "").trim().toUpperCase()) ? (r[col.status] ?? "ACTIVE").trim().toUpperCase() : "ACTIVE") as PRow["status"],
          shortDescription: (r[col.shortDescription] ?? "").trim() || "Imported product — add a description in the admin panel.",
          flags: { featured: yn(r[col.featured]), newArrival: yn(r[col.newArrival]), bestSeller: yn(r[col.bestSeller]), trending: yn(r[col.trending]) },
          imageUrl: (r[col.imageUrl] ?? "").trim(),
          variants: [],
        };
        groups.set(key, g);
      }
      const dupeSku = g.variants.some((v) => v.sku === sku);
      if (dupeSku) { rowErrors.push({ line, error: `duplicate sku ${sku} within product` }); continue; }
      g.variants.push({
        variantName: (r[col.variantName] ?? "").trim() || sku,
        sku, price,
        compareAtPrice: num(r[col.compareAtPrice]),
        stock: Math.max(0, Math.trunc(num(r[col.stock], 0) ?? 0)),
      });
    }

    // Resolve categories (by name, case-insensitive)
    const cats = await db.category.findMany({ select: { id: true, name: true, slug: true } });
    const catByName = new Map<string, string>();
    for (const c of cats) {
      catByName.set(c.name.toLowerCase(), c.id);
      catByName.set(String(c.slug).toLowerCase(), c.id);
    }

    let created = 0;
    let updated = 0;
    const errors = [...rowErrors];

    for (const g of groups.values()) {
      try {
        const categoryId = catByName.get(g.category.toLowerCase());
        if (!categoryId) {
          errors.push({ line: 0, error: `${g.name}: category "${g.category || "—"}" not found (create it first)` });
          continue;
        }
        const existing = await db.product.findFirst({
          where: { slug: g.slug },
          include: { images: true, variants: true },
        });
        if (existing) {
          // Update scalar fields + upsert variants by SKU (stock changes recorded as MANUAL_ADJUST)
          await db.product.update({
            where: { id: existing.id },
            data: {
              name: g.name,
              status: g.status,
              shortDescription: g.shortDescription,
              isFeatured: g.flags.featured,
              isNewArrival: g.flags.newArrival,
              isBestSeller: g.flags.bestSeller,
              isTrending: g.flags.trending,
              categoryId,
            },
          });
          if (g.imageUrl && !(existing.images ?? []).length) {
            await db.productImage.create({
              data: { id: newId(), productId: existing.id, url: g.imageUrl, alt: g.name, sortOrder: 0 },
            });
          }
          for (const v of g.variants) {
            const match = (existing.variants ?? []).find((x) => String(x.sku).toUpperCase() === v.sku);
            if (match) {
              const newStock = Math.max(0, v.stock);
              const data: Prisma.ProductVariantUpdateInput = {
                price: v.price,
                compareAtPrice: v.compareAtPrice,
                name: v.variantName || match.name,
                isActive: true,
              };
              if (newStock !== match.stock) {
                await db.stockMovement.create({
                  data: {
                    id: newId(),
                    variantId: match.id, delta: newStock - match.stock, reason: "MANUAL_ADJUST",
                    reference: `csv-import-${Date.now()}`, note: "CSV import stock set", createdById: admin.id,
                  },
                });
                data.stock = newStock;
              }
              await db.productVariant.update({ where: { id: match.id }, data });
            } else {
              const pushed = await db.productVariant.create({
                data: {
                  id: newId(),
                  productId: existing.id,
                  name: v.variantName, sku: v.sku, price: v.price, compareAtPrice: v.compareAtPrice,
                  stock: v.stock, lowStockThreshold: 5, isActive: true, barcode: null,
                },
              });
              if (v.stock > 0) {
                await db.stockMovement.create({
                  data: {
                    id: newId(),
                    variantId: pushed.id, delta: v.stock, reason: "INITIAL",
                    reference: `csv-import-${Date.now()}`, note: "CSV import new variant", createdById: admin.id,
                  },
                });
              }
            }
          }
          updated += 1;
        } else {
          const doc = await db.product.create({
            data: {
              id: newId(),
              name: g.name, slug: g.slug, categoryId, shortDescription: g.shortDescription,
              status: g.status, isFeatured: g.flags.featured, isNewArrival: g.flags.newArrival,
              isBestSeller: g.flags.bestSeller, isTrending: g.flags.trending,
              images: g.imageUrl ? { create: [{ id: newId(), url: g.imageUrl, alt: g.name, sortOrder: 0 }] } : undefined,
              variants: {
                create: g.variants.map((v) => ({
                  id: newId(),
                  name: v.variantName, sku: v.sku, price: v.price, compareAtPrice: v.compareAtPrice,
                  stock: v.stock, lowStockThreshold: 5, isActive: true, barcode: null,
                })),
              },
            },
            include: { variants: true },
          });
          for (const v of doc.variants) {
            if (v.stock > 0) {
              await db.stockMovement.create({
                data: {
                  id: newId(),
                  variantId: v.id, delta: v.stock, reason: "INITIAL",
                  reference: `csv-import-${Date.now()}`, note: "CSV import", createdById: admin.id,
                },
              });
            }
          }
          created += 1;
        }
      } catch (e: any) {
        errors.push({ line: 0, error: `${g.name}: ${e?.message ?? "failed"}` });
      }
    }

    await audit(
      { actor: admin, action: "product.import", entityType: "Product", entityId: "csv", metadata: { created, updated, errors: errors.length } },
      req
    );

    return ok(res, { created, updated, failed: errors.length, errors: errors.slice(0, 25) });
  })
);
