import { Router } from "express";
import { Order } from "../models";
import { ok, fail, handle, assertSameOrigin } from "../lib/http";
import { requireUser } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { money } from "../lib/money";
import {
  getPaymentProvider,
  isDemoMode,
  getPublicKeyId,
  getStripePk,
  createGatewayOrder,
  verifySignature,
  verifyStripePayment,
  computeSignature,
  settleGatewayPayment,
  demoProcessCard,
  demoProcessUpi,
} from "../services/payments";

export const paymentsRouter = Router();

function readOrderNumber(body: unknown): string {
  return String((body as any)?.orderNumber ?? "").trim().toUpperCase();
}

/* ---------- Public config (which gateway is active) ---------- */

paymentsRouter.get(
  "/payments/config",
  handle(async (_req, res) => {
    const [provider, demo, keyId, stripePk] = await Promise.all([
      getPaymentProvider(),
      isDemoMode(),
      getPublicKeyId(),
      getStripePk(),
    ]);
    return ok(res, {
      provider,
      demo,
      keyId,
      stripePk,
    });
  })
);

/* ---------- Create a payment intent for an order ---------- */

paymentsRouter.post(
  "/payments/create-intent",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const rl = rateLimit(`pay-intent:${user.id}`, 30, 10 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many payment attempts. Please wait a moment.", 429);

    const orderNumber = readOrderNumber(req.body);
    if (!orderNumber) return fail(res, "VALIDATION_ERROR", "Order number is required.", 422);

    const order = await Order.findOne({ orderNumber, userId: user.id });
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    if (order.status === "CANCELLED") return fail(res, "ORDER_CANCELLED", "This order was cancelled.", 409);
    if (order.paymentStatus === "PAID") {
      return ok(res, { alreadyPaid: true, orderNumber, paymentStatus: order.paymentStatus, status: order.status });
    }

    const gateway = await createGatewayOrder({
      orderNumber: order.orderNumber,
      grandTotal: order.grandTotal,
      currency: order.currency ?? "INR",
    });

    order.paymentMethod = "GATEWAY";
    order.payment = {
      method: "GATEWAY",
      status: "PENDING",
      amount: order.grandTotal,
      providerRef: null,
      verifiedAt: null,
      createdAt: new Date(),
    };
    order.paymentIntent = {
      provider: gateway.provider,
      gatewayOrderId: gateway.gatewayOrderId,
      createdAt: new Date(),
    };
    await order.save();

    return ok(res, {
      orderNumber: order.orderNumber,
      amount: money(order.grandTotal),
      currency: order.currency ?? "INR",
      provider: gateway.provider,
      demo: await isDemoMode(),
      keyId: gateway.keyId,
      gatewayOrderId: gateway.gatewayOrderId,
      clientSecret: gateway.clientSecret ?? null,
      stripePk: gateway.provider === "stripe" ? gateway.keyId : null,
      customer: { name: order.shipName, email: user.email },
    });
  })
);

/* ---------- Demo gateway: simulate card authorization ---------- */

paymentsRouter.post(
  "/payments/demo/process",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const rl = rateLimit(`pay-demo:${user.id}`, 40, 10 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many attempts. Please wait a moment.", 429);

    const orderNumber = readOrderNumber(req.body);
    const cardNumber = String(req.body?.cardNumber ?? "");
    const expiry = String(req.body?.expiry ?? "");
    const cvv = String(req.body?.cvv ?? "");

    const order = await Order.findOne({ orderNumber, userId: user.id });
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    if (order.paymentStatus === "PAID") {
      return ok(res, { alreadyPaid: true, approved: true, orderNumber });
    }
    if (!order.paymentIntent || order.paymentIntent.provider !== "demo") {
      return fail(res, "NO_PAYMENT_INTENT", "Start the payment again from the checkout.", 409);
    }

    // UPI path — instant collect approval in the demo gateway.
    const upiId = String(req.body?.upiId ?? "").trim();
    if (upiId) {
      const upi = demoProcessUpi(upiId);
      if (!upi.approved) return ok(res, { approved: false, reason: upi.reason });
      const gatewaySignature = await computeSignature("demo", order.paymentIntent.gatewayOrderId, upi.gatewayPaymentId!);
      return ok(res, { approved: true, gatewayPaymentId: upi.gatewayPaymentId, gatewaySignature });
    }

    // Light field sanity checks for a realistic gateway feel.
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(expiry)) {
      return ok(res, { approved: false, reason: "Enter the card expiry as MM/YY." });
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      return ok(res, { approved: false, reason: "Enter a valid CVV." });
    }

    const result = demoProcessCard(cardNumber);
    if (!result.approved) {
      return ok(res, { approved: false, reason: result.reason });
    }

    const gatewaySignature = await computeSignature("demo", order.paymentIntent.gatewayOrderId, result.gatewayPaymentId!);
    return ok(res, {
      approved: true,
      gatewayPaymentId: result.gatewayPaymentId,
      gatewaySignature,
    });
  })
);

/* ---------- Verify and settle the payment ---------- */

paymentsRouter.post(
  "/payments/confirm",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const rl = rateLimit(`pay-confirm:${user.id}`, 40, 10 * 60 * 1000);
    if (!rl.allowed) return fail(res, "RATE_LIMITED", "Too many attempts. Please wait a moment.", 429);

    const orderNumber = readOrderNumber(req.body);
    const gatewayPaymentId = String(req.body?.gatewayPaymentId ?? "").trim();
    const gatewaySignature = String(req.body?.gatewaySignature ?? "").trim();
    if (!orderNumber || !gatewayPaymentId) {
      return fail(res, "VALIDATION_ERROR", "Payment details are incomplete.", 422);
    }

    const order = await Order.findOne({ orderNumber, userId: user.id });
    if (!order) return fail(res, "NOT_FOUND", "Order not found.", 404);
    if (order.paymentStatus === "PAID") {
      return ok(res, { alreadyPaid: true, orderNumber, paymentStatus: order.paymentStatus, status: order.status });
    }

    const intent = order.paymentIntent;
    if (!intent) return fail(res, "NO_PAYMENT_INTENT", "Start the payment again from the checkout.", 409);

    let providerRef = gatewayPaymentId;
    let confirmedNote: string;

    if (intent.provider === "stripe") {
      // Stripe: verify server-side by retrieving the PaymentIntent from
      // Stripe's API — status, amount, currency and metadata must all match.
      const verified = await verifyStripePayment(gatewayPaymentId, {
        orderNumber: order.orderNumber,
        grandTotal: order.grandTotal,
        currency: order.currency ?? "INR",
      });
      if (!verified.ok) {
        return fail(res, "SIGNATURE_INVALID", verified.error ?? "We could not verify this payment. Please try again.", 400);
      }
      providerRef = verified.paymentId!;
      confirmedNote = "Payment received via Stripe — order confirmed.";
    } else {
      // Razorpay + demo: HMAC signature handshake (gatewayOrderId|paymentId).
      if (!gatewaySignature) {
        return fail(res, "VALIDATION_ERROR", "Payment details are incomplete.", 422);
      }
      const valid = await verifySignature(intent.provider, intent.gatewayOrderId, gatewayPaymentId, gatewaySignature);
      if (!valid) {
        return fail(res, "SIGNATURE_INVALID", "We could not verify this payment. Please try again.", 400);
      }
      confirmedNote = `Payment received via ${intent.provider === "razorpay" ? "Razorpay" : "online checkout"} — order confirmed.`;
    }

    const pointsEarned = await settleGatewayPayment(order, intent.provider, providerRef, confirmedNote);

    return ok(res, {
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      status: order.status,
      pointsEarned,
    });
  })
);
