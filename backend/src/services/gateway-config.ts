import { SiteSetting } from "../models";
import { env } from "../env";

/**
 * Payment gateway configuration.
 *
 * Keys are managed from the admin panel (Business Settings → Payment gateway)
 * and stored in the SiteSetting key-value collection. Environment variables
 * remain a fallback so existing deployments keep working unchanged:
 *
 *   DB setting wins → else env var → else empty (gateway inactive).
 *
 * Secret keys NEVER leave the backend unmasked — admin GET responses only
 * ever contain masked previews (last 4 chars).
 */

export type GatewayProvider = "razorpay" | "stripe" | "demo";

/* ---------- SiteSetting keys ---------- */

export const PAYMENT_SETTING_KEYS = {
  provider: "payment.provider",
  razorpayKeyId: "payment.razorpay.key_id",
  razorpayKeySecret: "payment.razorpay.key_secret",
  razorpayWebhookSecret: "payment.razorpay.webhook_secret",
  stripePk: "payment.stripe.publishable_key",
  stripeSecret: "payment.stripe.secret_key",
  stripeWebhookSecret: "payment.stripe.webhook_secret",
} as const;

export interface GatewayConfig {
  provider: string; // raw stored/derived preference
  razorpay: { keyId: string; keySecret: string; webhookSecret: string };
  stripe: { pk: string; secret: string; webhookSecret: string };
}

async function loadSettingMap(): Promise<Map<string, string>> {
  const rows = await SiteSetting.find({
    key: {
      $in: [
        PAYMENT_SETTING_KEYS.provider,
        PAYMENT_SETTING_KEYS.razorpayKeyId,
        PAYMENT_SETTING_KEYS.razorpayKeySecret,
        PAYMENT_SETTING_KEYS.razorpayWebhookSecret,
        PAYMENT_SETTING_KEYS.stripePk,
        PAYMENT_SETTING_KEYS.stripeSecret,
        PAYMENT_SETTING_KEYS.stripeWebhookSecret,
      ],
    },
  })
    .lean<{ key: string; value: string }[]>()
    .exec();
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function getGatewayConfig(): Promise<GatewayConfig> {
  const s = await loadSettingMap();
  return {
    provider:
      s.get(PAYMENT_SETTING_KEYS.provider) ??
      (env.PAYMENTS_ENABLED ? env.PAYMENT_PROVIDER || "demo" : "demo"),
    razorpay: {
      keyId: s.get(PAYMENT_SETTING_KEYS.razorpayKeyId) || env.PAYMENT_KEY_ID,
      keySecret: s.get(PAYMENT_SETTING_KEYS.razorpayKeySecret) || env.PAYMENT_KEY_SECRET,
      webhookSecret: s.get(PAYMENT_SETTING_KEYS.razorpayWebhookSecret) || env.PAYMENT_WEBHOOK_SECRET,
    },
    stripe: {
      pk: s.get(PAYMENT_SETTING_KEYS.stripePk) || env.STRIPE_PUBLISHABLE_KEY,
      secret: s.get(PAYMENT_SETTING_KEYS.stripeSecret) || env.STRIPE_SECRET_KEY,
      webhookSecret: s.get(PAYMENT_SETTING_KEYS.stripeWebhookSecret) || env.STRIPE_WEBHOOK_SECRET,
    },
  };
}

/* ---------- Active-provider resolution ---------- */

export function razorpayConfigured(cfg: GatewayConfig): boolean {
  return !!cfg.razorpay.keyId && !!cfg.razorpay.keySecret;
}

export function stripeConfigured(cfg: GatewayConfig): boolean {
  return !!cfg.stripe.pk && !!cfg.stripe.secret;
}

/**
 * The provider actually used for checkout:
 *  - "razorpay" / "stripe" only when that gateway is both selected AND has keys
 *  - otherwise the built-in demo gateway
 */
export function resolveActiveProvider(cfg: GatewayConfig): GatewayProvider {
  if (cfg.provider === "razorpay" && razorpayConfigured(cfg)) return "razorpay";
  if (cfg.provider === "stripe" && stripeConfigured(cfg)) return "stripe";
  return "demo";
}

/* ---------- Masking helpers (secrets never leave unmasked) ---------- */

export function maskKey(value: string): string {
  const v = String(value ?? "");
  if (!v) return "";
  const tail = v.slice(-4);
  const head = v.startsWith("sk_") || v.startsWith("rzp_") ? v.slice(0, Math.min(6, v.length)) : "";
  return `${head}${head ? "…" : ""}••••${tail}`;
}

export interface GatewayStatus {
  provider: GatewayProvider;
  selected: string;
  razorpay: { configured: boolean; keyId: string; keySecretMasked: string; webhookSecretMasked: string };
  stripe: { configured: boolean; pk: string; secretMasked: string; webhookSecretMasked: string };
}

export function buildGatewayStatus(cfg: GatewayConfig): GatewayStatus {
  return {
    provider: resolveActiveProvider(cfg),
    selected: cfg.provider || "demo",
    razorpay: {
      configured: razorpayConfigured(cfg),
      keyId: cfg.razorpay.keyId,
      keySecretMasked: maskKey(cfg.razorpay.keySecret),
      webhookSecretMasked: maskKey(cfg.razorpay.webhookSecret),
    },
    stripe: {
      configured: stripeConfigured(cfg),
      pk: cfg.stripe.pk,
      secretMasked: maskKey(cfg.stripe.secret),
      webhookSecretMasked: maskKey(cfg.stripe.webhookSecret),
    },
  };
}
