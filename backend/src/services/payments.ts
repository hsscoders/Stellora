import crypto from "node:crypto";
import { HttpError } from "../lib/http";
import { env } from "../env";
import { Order } from "../models";
import { accrueEarn } from "./loyalty";
import {
  getGatewayConfig,
  resolveActiveProvider,
  type GatewayProvider,
} from "./gateway-config";

/**
 * Payment gateway abstraction.
 *
 * - Providers are configured from the admin panel (Business Settings →
 *   Payment gateway) and stored in SiteSetting; environment variables remain
 *   a fallback for headless deploys.
 * - When a real provider is selected AND its keys are present, that gateway
 *   is used for checkout (Razorpay Orders API / Stripe PaymentIntents, both
 *   plain REST — no SDK dependency).
 * - Otherwise the built-in DEMO gateway runs: a fully in-house simulated
 *   acquiring flow (card capture, decline rules, HMAC signature handshake)
 *   that mirrors Razorpay's signature algorithm exactly.
 */

export type PaymentProvider = GatewayProvider;

async function activeProvider(): Promise<PaymentProvider> {
  const cfg = await getGatewayConfig();
  return resolveActiveProvider(cfg);
}

export async function getPaymentProvider(): Promise<PaymentProvider> {
  return activeProvider();
}

export async function isDemoMode(): Promise<boolean> {
  return (await activeProvider()) === "demo";
}

/** Razorpay public key id (safe to expose) when Razorpay is active. */
export async function getPublicKeyId(): Promise<string | null> {
  const cfg = await getGatewayConfig();
  return resolveActiveProvider(cfg) === "razorpay" ? cfg.razorpay.keyId : null;
}

/** Stripe publishable key (safe to expose) when Stripe is active. */
export async function getStripePk(): Promise<string | null> {
  const cfg = await getGatewayConfig();
  return resolveActiveProvider(cfg) === "stripe" ? cfg.stripe.pk : null;
}

function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function computeSignature(
  provider: PaymentProvider,
  gatewayOrderId: string,
  gatewayPaymentId: string
): Promise<string> {
  let secret = env.PAYMENT_DEMO_SECRET;
  if (provider === "razorpay") {
    const cfg = await getGatewayConfig();
    secret = cfg.razorpay.keySecret;
  }
  return hmacHex(secret, `${gatewayOrderId}|${gatewayPaymentId}`);
}

export async function verifySignature(
  provider: PaymentProvider,
  gatewayOrderId: string,
  gatewayPaymentId: string,
  signature: string
): Promise<boolean> {
  const expected = await computeSignature(provider, gatewayOrderId, gatewayPaymentId);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature ?? ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ---------- Gateway order creation ---------- */

export interface GatewayOrder {
  provider: PaymentProvider;
  gatewayOrderId: string;
  keyId: string | null;
  /** Stripe only — client secret for Payment Element (safe to expose). */
  clientSecret?: string | null;
}

async function stripeRequest(
  method: "GET" | "POST",
  path: string,
  secret: string,
  body?: Record<string, string>
): Promise<{ ok: boolean; status: number; json: any; errMessage: string | null }> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
    signal: AbortSignal.timeout(12_000),
  });
  let json: any = null;
  let errMessage: string | null = null;
  try {
    json = await res.json();
    if (!res.ok && json?.error?.message) errMessage = String(json.error.message);
  } catch {
    /* network/HTML error body */
  }
  return { ok: res.ok, status: res.status, json, errMessage };
}

async function createStripePaymentIntent(input: {
  orderNumber: string;
  grandTotal: number;
  currency: string;
}): Promise<GatewayOrder> {
  const cfg = await getGatewayConfig();
  const res = await stripeRequest("POST", "payment_intents", cfg.stripe.secret, {
    amount: String(Math.round(input.grandTotal * 100)), // smallest unit (paise)
    currency: (input.currency || "INR").toLowerCase(),
    description: `Stellora order ${input.orderNumber}`,
    "metadata[orderNumber]": input.orderNumber,
    "automatic_payment_methods[enabled]": "true",
  });
  if (!res.ok || !res.json?.id || !res.json?.client_secret) {
    throw new HttpError(
      "PAYMENT_PROVIDER_ERROR",
      "Payment gateway is not responding right now. Please try again in a moment.",
      502
    );
  }
  return {
    provider: "stripe",
    gatewayOrderId: String(res.json.id),
    keyId: cfg.stripe.pk,
    clientSecret: String(res.json.client_secret),
  };
}

export async function createGatewayOrder(input: {
  orderNumber: string;
  grandTotal: number;
  currency: string;
}): Promise<GatewayOrder> {
  const provider = await activeProvider();

  if (provider === "stripe") {
    return createStripePaymentIntent(input);
  }

  if (provider === "razorpay") {
    const cfg = await getGatewayConfig();
    const auth = Buffer.from(`${cfg.razorpay.keyId}:${cfg.razorpay.keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: Math.round(input.grandTotal * 100), // paise
        currency: input.currency || "INR",
        receipt: input.orderNumber,
        notes: { orderNumber: input.orderNumber },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new HttpError(
        "PAYMENT_PROVIDER_ERROR",
        "Payment gateway is not responding right now. Please try again in a moment.",
        502
      );
    }
    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      throw new HttpError("PAYMENT_PROVIDER_ERROR", "Payment gateway rejected the order. Please try again.", 502);
    }
    return { provider: "razorpay", gatewayOrderId: String(json.id), keyId: cfg.razorpay.keyId };
  }

  // Demo gateway — deterministic, signed handshake happens at confirm time.
  const gatewayOrderId = `demo_order_${crypto.randomBytes(9).toString("hex")}`;
  return { provider: "demo", gatewayOrderId, keyId: null, clientSecret: null };
}

/* ---------- Server-side Stripe verification (confirm path) ---------- */

export interface StripeVerifyResult {
  ok: boolean;
  paymentId: string | null;
  error: string | null;
}

/**
 * Verifies a Stripe PaymentIntent server-side: status must be `succeeded`,
 * amount/currency must match the order, and metadata.orderNumber must match.
 * Never trusts client-reported state.
 */
export async function verifyStripePayment(
  paymentIntentId: string,
  expected: { orderNumber: string; grandTotal: number; currency: string }
): Promise<StripeVerifyResult> {
  const cfg = await getGatewayConfig();
  const id = String(paymentIntentId ?? "").trim();
  if (!/^pi_[A-Za-z0-9]+$/.test(id)) {
    return { ok: false, paymentId: null, error: "Invalid Stripe payment reference." };
  }
  let res: Awaited<ReturnType<typeof stripeRequest>>;
  try {
    res = await stripeRequest("GET", `payment_intents/${encodeURIComponent(id)}`, cfg.stripe.secret);
  } catch {
    return { ok: false, paymentId: null, error: "Payment gateway is not responding right now." };
  }
  if (!res.ok || !res.json?.id) {
    return { ok: false, paymentId: null, error: "We could not verify this payment. Please try again." };
  }
  const pi = res.json;
  const amountOk = Number(pi.amount) === Math.round(expected.grandTotal * 100);
  const currencyOk = String(pi.currency ?? "").toLowerCase() === (expected.currency || "inr").toLowerCase();
  const metaOk = String(pi.metadata?.orderNumber ?? "") === expected.orderNumber;
  if (pi.status !== "succeeded" || !amountOk || !currencyOk || !metaOk) {
    return { ok: false, paymentId: null, error: "We could not verify this payment. Please try again." };
  }
  return { ok: true, paymentId: String(pi.id), error: null };
}

/* ---------- Admin: live connection test (read-only API pings) ---------- */

export interface GatewayTestResult {
  ok: boolean;
  message: string;
}

export interface GatewayTestOverrides {
  razorpay?: { keyId?: string; keySecret?: string };
  stripe?: { secretKey?: string };
}

/**
 * Live read-only API ping. Uses the keys currently typed in the admin form
 * when provided (they are NOT stored), otherwise the saved configuration.
 */
export async function testGatewayConnection(
  provider: "razorpay" | "stripe",
  override?: GatewayTestOverrides
): Promise<GatewayTestResult> {
  const cfg = await getGatewayConfig();
  const rzpKey = override?.razorpay?.keySecret ? override.razorpay : cfg.razorpay;
  const stripeSecret = override?.stripe?.secretKey || cfg.stripe.secret;
  try {
    if (provider === "razorpay") {
      if (!rzpKey.keyId || !rzpKey.keySecret) {
        return { ok: false, message: "Razorpay Key ID and Key Secret are required." };
      }
      const auth = Buffer.from(`${rzpKey.keyId}:${rzpKey.keySecret}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { ok: true, message: "Razorpay keys verified — gateway is live." };
      if (res.status === 401) return { ok: false, message: "Razorpay rejected these keys (401). Please re-check them." };
      return { ok: false, message: `Razorpay responded with HTTP ${res.status}. Please try again.` };
    }

    if (!stripeSecret) {
      return { ok: false, message: "Stripe Secret key is required." };
    }
    const res = await stripeRequest("GET", "balance", stripeSecret);
    if (res.ok) return { ok: true, message: "Stripe keys verified — gateway is live." };
    if (res.status === 401) return { ok: false, message: "Stripe rejected this key (401). Please re-check it." };
    return { ok: false, message: res.errMessage ?? `Stripe responded with HTTP ${res.status}.` };
  } catch {
    return { ok: false, message: "Could not reach the payment gateway. Check the server's internet connection." };
  }
}

/* ---------- Shared settlement (confirm route + webhooks) ---------- */

/**
 * Marks a gateway order as PAID and confirms it, exactly once.
 * Used by the client-driven confirm endpoint AND by gateway webhooks,
 * so whichever arrives first settles the order and the other is a no-op.
 */
export async function settleGatewayPayment(
  order: InstanceType<typeof Order>,
  provider: PaymentProvider,
  providerRef: string,
  confirmedNote: string
): Promise<number> {
  if (order.paymentStatus === "PAID") return 0;

  order.paymentMethod = "GATEWAY";
  order.payment = {
    method: "GATEWAY",
    status: "PAID",
    amount: order.grandTotal,
    providerRef,
    verifiedAt: new Date(),
    createdAt: new Date(),
  };
  order.paymentStatus = "PAID";

  if (order.status === "PENDING") {
    order.status = "CONFIRMED";
    order.events.push({ status: "CONFIRMED", note: confirmedNote });
  } else {
    order.events.push({ status: order.status, note: "Payment received online." });
  }
  await order.save();

  // Stellora Rewards: credit earn points once the order is confirmed via
  // payment. Ledger-guarded, so retries and double-confirms are no-ops.
  let pointsEarned = 0;
  if (order.status === "CONFIRMED") {
    const earn = await accrueEarn(String(order._id), "Payment received online");
    pointsEarned = earn.earned;
  }
  return pointsEarned;
}

/* ---------- Demo acquiring simulation ---------- */

export interface DemoProcessResult {
  approved: boolean;
  gatewayPaymentId: string | null;
  reason: string | null;
}

/**
 * Simulates the demo gateway's card authorization.
 * Test behaviour (mirrors common sandbox conventions):
 *   - any card ending 0002 → declined by issuing bank
 *   - any card ending 1111 → extra 3D-Secure-ish delay then approved
 *   - anything else valid → approved
 */
export function demoProcessCard(cardNumber: string): DemoProcessResult {
  const digits = String(cardNumber ?? "").replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 19) {
    return { approved: false, gatewayPaymentId: null, reason: "Enter a valid card number." };
  }
  if (digits.endsWith("0002")) {
    return { approved: false, gatewayPaymentId: null, reason: "Payment declined by the issuing bank. Try another card." };
  }
  return { approved: true, gatewayPaymentId: `demo_pay_${crypto.randomBytes(9).toString("hex")}`, reason: null };
}

/** Simulates a UPI collect approval in the demo gateway. */
export function demoProcessUpi(upiId: string): DemoProcessResult {
  const valid = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(String(upiId ?? "").trim());
  if (!valid) {
    return { approved: false, gatewayPaymentId: null, reason: "Enter a valid UPI ID (name@bank)." };
  }
  return { approved: true, gatewayPaymentId: `demo_upi_${crypto.randomBytes(9).toString("hex")}`, reason: null };
}
