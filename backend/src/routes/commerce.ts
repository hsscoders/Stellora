import { Router } from "express";
import { db } from "../lib/db";
import { ok, fail, handle, assertSameOrigin } from "../lib/http";
import { requireUser, getCurrentUser, readCartKey } from "../lib/auth";
import { checkoutSchema, trackOrderSchema, normalizePhone } from "../validation";
import { createOrderFromCart } from "../services/orders";
import { rateLimit, getClientIp } from "../lib/rate-limit";
import { validateCoupon } from "../services/pricing";
import { getCartView, resolveCart } from "../services/cart";
import { getLoyaltySnapshot } from "../services/loyalty";
import { money } from "../lib/money";
import { getDeliveryConfig, resolvePartner, buildTrackingUrl, estimateDeliveryIso } from "../services/delivery";

export const commerceRouter = Router();

/* ---------- Checkout ---------- */

commerceRouter.post(
  "/checkout",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const rl = rateLimit(`checkout:${user.id}`, 12, 10 * 60 * 1000);
    if (!rl.allowed) {
      return fail(res, "RATE_LIMITED", "Too many attempts. Please wait a moment.", 429);
    }

    const data = checkoutSchema.parse(req.body);
    const result = await createOrderFromCart({
      userId: user.id,
      addressId: data.addressId,
      couponCode: data.couponCode || undefined,
      idempotencyKey: data.idempotencyKey,
      paymentMethod: data.paymentMethod,
      redeemPoints: data.redeemPoints,
    });

    return ok(res, result, result.replayed ? 200 : 201);
  })
);

/* ---------- Stellora Rewards (my points balance + ledger) ---------- */

commerceRouter.get(
  "/loyalty",
  handle(async (req, res) => {
    const user = await requireUser(req);
    return ok(res, await getLoyaltySnapshot(user.id));
  })
);

/* ---------- My orders (list) ---------- */

commerceRouter.get(
  "/orders",
  handle(async (req, res) => {
    const user = await requireUser(req);
    const all = await db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        payment: true,
        shipment: true,
      },
    });
    return ok(res, await Promise.all(all.map(async (o) => {
        const itemCount = (o.items ?? []).length;
        // Full order shape with the first 3 items (preview thumbnails)
        const detail = await serializeOrderDetail(o);
        return { ...detail, items: detail.items.slice(0, 3), itemCount, preview: detail.items[0]?.productName ?? null };
      }))
    );
  })
);

/* ---------- My order detail ---------- */

commerceRouter.get(
  "/orders/:orderNumber",
  handle(async (req, res) => {
    const user = await requireUser(req);
    const orderNumber = String(req.params.orderNumber);
    const order = await db.order.findFirst({
      where: { orderNumber, userId: user.id },
      include: {
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        payment: true,
        shipment: true,
      },
    });
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    return ok(res, await serializeOrderDetail(order));
  })
);

/**
 * Serialize a Prisma order row (with included items/events/payment/shipment)
 * into the exact API shape the storefront has always consumed. `o.user` may
 * be included by admin routes — userId itself is always the plain id string.
 */
export async function serializeOrderDetail(o: any) {
  const cfg = await getDeliveryConfig();
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    // userId is a plain Char(24) string in MySQL (admin endpoints may also
    // include a `user` relation object — never serialized into this field).
    userId: typeof o.userId === "string" ? o.userId : String(o.userId ?? ""),
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    shippingFee: o.shippingFee,
    grandTotal: o.grandTotal,
    currency: o.currency,
    couponCode: o.couponCode ?? null,
    pointsRedeemed: o.pointsRedeemed ?? 0,
    pointsEarned: o.pointsEarned ?? 0,
    idempotencyKey: o.idempotencyKey,
    shipName: o.shipName,
    shipPhone: o.shipPhone,
    shipLine1: o.shipLine1,
    shipLine2: o.shipLine2 ?? null,
    shipCity: o.shipCity,
    shipState: o.shipState,
    shipPincode: o.shipPincode,
    shipCountry: o.shipCountry,
    cancelledReason: o.cancelledReason ?? null,
    adminNote: o.adminNote ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    items: (o.items ?? []).map((i: any) => ({
      id: i.id,
      productId: i.productId ?? null,
      variantId: i.variantId ?? null,
      productName: i.productName,
      variantName: i.variantName,
      sku: i.sku,
      imageUrl: i.imageUrl ?? null,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    payments: o.payment
      ? [
          {
            id: o.payment.id ?? "payment",
            method: o.payment.method,
            status: o.payment.status,
            amount: o.payment.amount,
            providerRef: o.payment.providerRef ?? null,
            verifiedAt: o.payment.verifiedAt ?? null,
            createdAt: o.payment.createdAt,
          },
        ]
      : [],
    events: (o.events ?? []).map((e: any) => ({
      id: e.id ?? "",
      status: e.status,
      note: e.note ?? null,
      createdAt: e.createdAt,
    })),
    estimatedDelivery:
      o.status === "DELIVERED" || o.status === "CANCELLED"
        ? null
        : estimateDeliveryIso(cfg.etaDays, o.shipment?.shippedAt ?? o.createdAt),
    shipment: o.shipment
      ? {
          id: o.shipment.id ?? "shipment",
          carrier: resolvePartner(cfg, o.shipment.carrier ?? null).name,
          partnerId: resolvePartner(cfg, o.shipment.carrier ?? null).id,
          trackingNumber: o.shipment.trackingNumber ?? null,
          trackingUrl: buildTrackingUrl(
            resolvePartner(cfg, o.shipment.carrier ?? null),
            o.shipment.trackingNumber ?? null
          ),
          status: o.shipment.status,
          shippedAt: o.shipment.shippedAt ?? null,
          deliveredAt: o.shipment.deliveredAt ?? null,
        }
      : null,
  };
}

/* ---------- Public order tracking (order number + email or mobile) ---------- */

commerceRouter.post(
  "/track",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`track:${ip}`, 20, 10 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many attempts. Please wait.", 429);

    const data = trackOrderSchema.parse(req.body);
    const orderNumber = data.orderNumber.trim().toUpperCase();
    const order = await db.order.findUnique({
      where: { orderNumber },
      include: {
        events: { orderBy: { createdAt: "asc" } },
        shipment: true,
      },
    });
    if (!order) {
      return fail(res, "NOT_FOUND",
        "We could not find an order with that order number and contact combination.",
        404
      );
    }

    /* Mobile-first: the guest may verify with the mobile number they left at
       checkout (shipPhone) or the account email — both stay one-way hashed
       against the actual record, no enumeration either way. */
    const contact = (data.contact ?? data.email ?? "").trim();
    const phoneCandidate = normalizePhone(contact);
    const owner = await db.user.findUnique({ where: { id: order.userId }, select: { email: true } });
    const shipPhone = normalizePhone(order.shipPhone ?? "");
    const emailMatch = !!owner?.email && !!contact && owner.email === contact.toLowerCase();
    const phoneMatch = !!phoneCandidate && !!shipPhone && phoneCandidate === shipPhone;
    if (!emailMatch && !phoneMatch) {
      return fail(res, "NOT_FOUND",
        "We could not find an order with that order number and contact combination.",
        404
      );
    }
    const cfg = await getDeliveryConfig();
    const partner = resolvePartner(cfg, order.shipment?.carrier ?? null);
    const trackingUrl = buildTrackingUrl(partner, order.shipment?.trackingNumber ?? null);
    return ok(res, {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      placedAt: order.createdAt,
      shippedAt: order.shipment?.shippedAt ?? null,
      carrier: partner.name,
      partnerId: partner.id,
      trackingNumber: order.shipment?.trackingNumber ?? null,
      trackingUrl,
      estimatedDelivery:
        order.status === "DELIVERED" || order.status === "CANCELLED"
          ? null
          : estimateDeliveryIso(cfg.etaDays, order.shipment?.shippedAt ?? order.createdAt),
      events: (order.events ?? []).map((e: any) => ({ status: e.status, note: e.note, at: e.createdAt })),
    });
  })
);

/* ---------- Coupon validation ---------- */

commerceRouter.post(
  "/coupons/validate",
  handle(async (req, res) => {
    assertSameOrigin(req);
    // Throttle code guessing: 12 validations / 10 min / IP.
    const rl = rateLimit(`coupon:${getClientIp(req)}`, 12, 10 * 60 * 1000);
    if (!rl.allowed) {
      return fail(res, "RATE_LIMITED", "Too many coupon attempts. Please try again later.", 429);
    }
    const code = String(req.body?.code ?? "");
    if (!code) return fail(res, "VALIDATION_ERROR", "Enter a coupon code.", 422);

    const user = await getCurrentUser(req);
    const sessionKey = user ? null : readCartKey(req);
    if (!user && !sessionKey) return fail(res, "EMPTY_CART", "Your cart is empty.", 422);
    const cart = await resolveCart(user?.id ?? null, sessionKey);
    const view = await getCartView(cart.id);
    if (view.items.length === 0) return fail(res, "EMPTY_CART", "Your cart is empty.", 422);

    try {
      const result = await validateCoupon(code, view.subtotal, user?.id ?? null);
      const payable = Math.max(view.subtotal - result.discount, 0);
      return ok(res, {
        valid: true,
        code: result.coupon.code,
        discount: result.discount,
        payableSubtotal: payable,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "This coupon cannot be applied.";
      return ok(res, { valid: false, message });
    }
  })
);

/* ---------- Shipping rate (public) ---------- */

commerceRouter.get(
  "/shipping",
  handle(async (_req, res) => {
    const { getActiveShippingRate } = await import("../services/pricing");
    const rate = await getActiveShippingRate();
    if (!rate) return ok(res, null);
    return ok(res, {
      name: rate.name,
      baseFee: money(rate.baseFee),
      freeAbove: rate.freeAbove ? money(rate.freeAbove) : null,
    });
  })
);
