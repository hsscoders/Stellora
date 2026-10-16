import { Router } from "express";
import { Order, User } from "../models";
import { ok, fail, handle, assertSameOrigin } from "../lib/http";
import { requireUser, getCurrentUser, readCartKey } from "../lib/auth";
import { checkoutSchema, trackOrderSchema } from "../validation";
import { createOrderFromCart } from "../services/orders";
import { rateLimit, getClientIp } from "../lib/rate-limit";
import { validateCoupon } from "../services/pricing";
import { getCartView, resolveCart } from "../services/cart";
import { money } from "../lib/money";

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
    });

    return ok(res, result, result.replayed ? 200 : 201);
  })
);

/* ---------- My orders (list) ---------- */

commerceRouter.get(
  "/orders",
  handle(async (req, res) => {
    const user = await requireUser(req);
    const all = await Order.find({ userId: user.id }).sort({ createdAt: -1 }).lean<any[]>();
    return ok(res, all.map((o) => {
        const itemCount = (o.items ?? []).length;
        // Full order shape with the first 3 items (preview thumbnails)
        const detail = serializeOrderDetail(o);
        return { ...detail, items: detail.items.slice(0, 3), itemCount, preview: detail.items[0]?.productName ?? null };
      })
    );
  })
);

/* ---------- My order detail ---------- */

commerceRouter.get(
  "/orders/:orderNumber",
  handle(async (req, res) => {
    const user = await requireUser(req);
    const orderNumber = String(req.params.orderNumber);
    const order = await Order.findOne({ orderNumber, userId: user.id }).lean<any>();
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    return ok(res, serializeOrderDetail(order));
  })
);

export function serializeOrderDetail(o: any) {
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    userId: String(o.userId),
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    shippingFee: o.shippingFee,
    grandTotal: o.grandTotal,
    currency: o.currency,
    couponCode: o.couponCode ?? null,
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
      id: String(i._id),
      productId: i.productId ? String(i.productId) : null,
      variantId: i.variantId ? String(i.variantId) : null,
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
            id: String(o.payment._id ?? "payment"),
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
      id: String(e._id ?? ""),
      status: e.status,
      note: e.note ?? null,
      createdAt: e.createdAt,
    })),
    shipment: o.shipment
      ? {
          id: String(o.shipment._id ?? "shipment"),
          carrier: o.shipment.carrier ?? null,
          trackingNumber: o.shipment.trackingNumber ?? null,
          status: o.shipment.status,
          shippedAt: o.shipment.shippedAt ?? null,
          deliveredAt: o.shipment.deliveredAt ?? null,
        }
      : null,
  };
}

/* ---------- Public order tracking (order number + email) ---------- */

commerceRouter.post(
  "/track",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`track:${ip}`, 20, 10 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many attempts. Please wait.", 429);

    const data = trackOrderSchema.parse(req.body);
    const orderNumber = data.orderNumber.trim().toUpperCase();
    const order = await Order.findOne({ orderNumber }).lean<any>();
    if (!order) {
      return fail(res, "NOT_FOUND",
        "We could not find an order with that order number and email combination.",
        404
      );
    }
    const owner = await User.findById(order.userId).select("email").lean<{ email: string } | null>();
    if (!owner || owner.email !== data.email) {
      return fail(res, "NOT_FOUND",
        "We could not find an order with that order number and email combination.",
        404
      );
    }
    return ok(res, {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      placedAt: order.createdAt,
      shippedAt: order.shipment?.shippedAt ?? null,
      carrier: order.shipment?.carrier ?? null,
      trackingNumber: order.shipment?.trackingNumber ?? null,
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
    const view = await getCartView(String(cart._id));
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
