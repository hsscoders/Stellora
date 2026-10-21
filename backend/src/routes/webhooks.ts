import type { Request, Response } from "express";
import { Router } from "express";
import { handle } from "../lib/http";
import crypto from "node:crypto";
import { db, newId } from "../lib/db";
import { settleGatewayPayment } from "../services/payments";
import { getGatewayConfig, resolveActiveProvider } from "../services/gateway-config";

/**
 * Payment gateway webhooks (server-to-server).
 *
 * Mounted in server.ts at the /api/payments/webhook prefix BEFORE
 * express.json() with express.raw(), because both Stripe and Razorpay sign
 * the exact raw request body:
 *   - Razorpay: x-razorpay-signature = HMAC-SHA256(rawBody, webhookSecret)
 *   - Stripe:   stripe-signature v1  = HMAC-SHA256("<t>.<rawBody>", whsec)
 * Scoped to this prefix so the raw parser never touches any other route.
 *
 * Webhooks are a safety net: they settle orders that were verified in the
 * browser but whose confirm call never made it (closed tab, network drop).
 * settleGatewayPayment is idempotent, and every received event is stored in
 * the webhookevents collection keyed by the provider's unique event id.
 *
 * These routes are intentionally unauthenticated (signature IS the auth) and
 * never assertSameOrigin — they come from gateway servers, not browsers.
 */

export const webhooksRouter = Router();

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

async function recordEvent(
  provider: string,
  eventId: string,
  payload: unknown,
  status: string
): Promise<boolean> {
  try {
    await db.webhookEvent.create({
      data: {
        id: newId(),
        provider,
        eventId,
        payload: payload as never,
        status,
        processedAt: status === "PROCESSED" ? new Date() : null,
      },
    });
    return true;
  } catch {
    // Duplicate eventId → already stored; treat as received-and-seen.
    return false;
  }
}

async function settleByOrderNumber(
  provider: "razorpay" | "stripe",
  orderNumber: string,
  gatewayOrderId: string,
  providerRef: string
): Promise<{ settled: boolean; reason: string }> {
  const normalized = String(orderNumber ?? "").trim().toUpperCase();
  if (!normalized) return { settled: false, reason: "NO_ORDER_REF" };
  const order = await db.order.findUnique({
    where: { orderNumber: normalized },
    select: {
      id: true,
      paymentStatus: true,
      paymentIntentProvider: true,
      paymentIntentGatewayOrderId: true,
    },
  });
  if (!order) return { settled: false, reason: "ORDER_NOT_FOUND" };
  if (!order.paymentIntentProvider || order.paymentIntentProvider !== provider) {
    return { settled: false, reason: "PROVIDER_MISMATCH" };
  }
  if (gatewayOrderId && order.paymentIntentGatewayOrderId && order.paymentIntentGatewayOrderId !== gatewayOrderId) {
    return { settled: false, reason: "GATEWAY_ORDER_MISMATCH" };
  }
  if (order.paymentStatus === "PAID") return { settled: false, reason: "ALREADY_PAID" };

  const note =
    provider === "stripe"
      ? "Payment received via Stripe (webhook) — order confirmed."
      : "Payment received via Razorpay (webhook) — order confirmed.";
  await settleGatewayPayment(order.id, provider, providerRef, note);
  return { settled: true, reason: "SETTLED" };
}

/* ---------- Razorpay ---------- */

webhooksRouter.post(
  "/razorpay",
  handle(async (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from(JSON.stringify(req.body ?? {}));
    const cfg = await getGatewayConfig();

    const signature = String(req.headers["x-razorpay-signature"] ?? "");
    if (!cfg.razorpay.webhookSecret) {
      return res.status(400).json({ ok: false, error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook secret is not set." } });
    }
    const expected = crypto.createHmac("sha256", cfg.razorpay.webhookSecret).update(raw).digest("hex");
    if (!signature || !timingSafeEqualHex(expected, signature)) {
      return res.status(400).json({ ok: false, error: { code: "SIGNATURE_INVALID", message: "Invalid webhook signature." } });
    }

    let event: any;
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ ok: false, error: { code: "BAD_PAYLOAD", message: "Malformed JSON." } });
    }

    const eventId = String(req.headers["x-razorpay-event-id"] ?? `rzp_${crypto.randomBytes(8).toString("hex")}`);
    const eventType = String(event?.event ?? "unknown");
    const pay = event?.payload?.payment?.entity ?? {};
    const orderNumber = String(pay?.notes?.orderNumber ?? "");

    if ((eventType === "payment.captured" || eventType === "order.paid") && pay?.id) {
      const result = await settleByOrderNumber("razorpay", orderNumber, String(pay.order_id ?? ""), String(pay.id));
      await recordEvent("razorpay", eventId, event, result.settled ? "PROCESSED" : `SKIPPED:${result.reason}`);
      return res.status(200).json({ ok: true, data: result });
    }

    await recordEvent("razorpay", eventId, event, "IGNORED");
    return res.status(200).json({ ok: true, data: { ignored: eventType } });
  })
);

/* ---------- Stripe ---------- */

webhooksRouter.post(
  "/stripe",
  handle(async (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from(JSON.stringify(req.body ?? {}));
    const cfg = await getGatewayConfig();

    const header = String(req.headers["stripe-signature"] ?? "");
    const parts = Object.fromEntries(
      header.split(",").map((p) => {
        const idx = p.indexOf("=");
        return idx > 0 ? [p.slice(0, idx).trim(), p.slice(idx + 1).trim()] : ["", ""];
      })
    );
    const timestamp = parts["t"] ?? "";
    const received = parts["v1"] ?? "";

    if (!cfg.stripe.webhookSecret) {
      return res.status(400).json({ ok: false, error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook secret is not set." } });
    }
    if (!timestamp || !received) {
      return res.status(400).json({ ok: false, error: { code: "SIGNATURE_INVALID", message: "Missing Stripe signature." } });
    }
    // 5-minute tolerance, mirroring the official SDK's default.
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) {
      return res.status(400).json({ ok: false, error: { code: "SIGNATURE_EXPIRED", message: "Webhook timestamp outside tolerance." } });
    }
    const expected = crypto
      .createHmac("sha256", cfg.stripe.webhookSecret)
      .update(`${timestamp}.${raw.toString("utf8")}`)
      .digest("hex");
    if (!timingSafeEqualHex(expected, received)) {
      return res.status(400).json({ ok: false, error: { code: "SIGNATURE_INVALID", message: "Invalid webhook signature." } });
    }

    let event: any;
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ ok: false, error: { code: "BAD_PAYLOAD", message: "Malformed JSON." } });
    }

    const eventId = String(event?.id ?? `stripe_${crypto.randomBytes(8).toString("hex")}`);
    const eventType = String(event?.type ?? "unknown");

    if (eventType === "payment_intent.succeeded") {
      const pi = event?.data?.object ?? {};
      const result = await settleByOrderNumber(
        "stripe",
        String(pi?.metadata?.orderNumber ?? ""),
        String(pi?.id ?? ""),
        String(pi?.id ?? "")
      );
      await recordEvent("stripe", eventId, event, result.settled ? "PROCESSED" : `SKIPPED:${result.reason}`);
      return res.status(200).json({ ok: true, data: result });
    }

    await recordEvent("stripe", eventId, event, "IGNORED");
    return res.status(200).json({ ok: true, data: { ignored: eventType } });
  })
);

/* ---------- Diagnostics: which provider webhooks are wired for ---------- */

webhooksRouter.get(
  "/status",
  handle(async (_req: Request, res: Response) => {
    const cfg = await getGatewayConfig();
    return res.status(200).json({
      ok: true,
      data: {
        activeProvider: resolveActiveProvider(cfg),
        razorpayWebhookConfigured: !!cfg.razorpay.webhookSecret,
        stripeWebhookConfigured: !!cfg.stripe.webhookSecret,
      },
    });
  })
);
