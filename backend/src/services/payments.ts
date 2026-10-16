import crypto from "node:crypto";
import { HttpError } from "../lib/http";
import { env } from "../env";

/**
 * Payment gateway abstraction.
 *
 * - If PAYMENTS_ENABLED=true, PAYMENT_PROVIDER=razorpay and API keys are set in
 *   the environment, the real Razorpay Orders API is used (client-side checkout
 *   via Razorpay's SDK, server-side HMAC signature verification).
 * - Otherwise the built-in DEMO gateway runs: a fully in-house simulated
 *   acquiring flow (card capture, decline rules, HMAC signature handshake)
 *   that mirrors Razorpay's signature algorithm exactly, so switching to the
 *   real provider needs no code changes — only environment keys.
 */

export type PaymentProvider = "razorpay" | "demo";

function razorpayActive(): boolean {
  return (
    env.PAYMENTS_ENABLED &&
    env.PAYMENT_PROVIDER === "razorpay" &&
    !!env.PAYMENT_KEY_ID &&
    !!env.PAYMENT_KEY_SECRET
  );
}

export function getPaymentProvider(): PaymentProvider {
  return razorpayActive() ? "razorpay" : "demo";
}

export function isDemoMode(): boolean {
  return getPaymentProvider() === "demo";
}

export function getPublicKeyId(): string | null {
  return razorpayActive() ? env.PAYMENT_KEY_ID : null;
}

function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function computeSignature(provider: PaymentProvider, gatewayOrderId: string, gatewayPaymentId: string): string {
  const secret = provider === "razorpay" ? env.PAYMENT_KEY_SECRET : env.PAYMENT_DEMO_SECRET;
  return hmacHex(secret, `${gatewayOrderId}|${gatewayPaymentId}`);
}

export function verifySignature(
  provider: PaymentProvider,
  gatewayOrderId: string,
  gatewayPaymentId: string,
  signature: string
): boolean {
  const expected = computeSignature(provider, gatewayOrderId, gatewayPaymentId);
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
}

export async function createGatewayOrder(input: {
  orderNumber: string;
  grandTotal: number;
  currency: string;
}): Promise<GatewayOrder> {
  if (getPaymentProvider() === "razorpay") {
    const auth = Buffer.from(`${env.PAYMENT_KEY_ID}:${env.PAYMENT_KEY_SECRET}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: Math.round(input.grandTotal * 100), // paise
        currency: input.currency || "INR",
        receipt: input.orderNumber,
        notes: { orderNumber: input.orderNumber },
      }),
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
    return { provider: "razorpay", gatewayOrderId: String(json.id), keyId: env.PAYMENT_KEY_ID };
  }

  // Demo gateway — deterministic, signed handshake happens at confirm time.
  const gatewayOrderId = `demo_order_${crypto.randomBytes(9).toString("hex")}`;
  return { provider: "demo", gatewayOrderId, keyId: null };
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
