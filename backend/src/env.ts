import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  PORT: z.string().default("4000").transform((v) => Number(v) || 4000),
  APP_URL: z.string().default("http://localhost:3000"),
  // Dot-suffix allowlist for dynamic preview/sandbox hosts (e.g. preview-<id>.space-z.ai).
  // A browser Origin whose host ends with one of these is treated as same-origin
  // for the state-changing-request CSRF check. Comma-separated.
  ORIGIN_SUFFIXES: z.string().default(".space-z.ai,.z.ai"),
  ADMIN_BOOTSTRAP_EMAIL: z.string().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),
  DEMO_CUSTOMER_EMAIL: z.string().optional(),
  DEMO_CUSTOMER_PASSWORD: z.string().optional(),
  PAYMENTS_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  PAYMENT_PROVIDER: z.string().default(""),
  PAYMENT_KEY_ID: z.string().default(""),
  PAYMENT_KEY_SECRET: z.string().default(""),
  PAYMENT_WEBHOOK_SECRET: z.string().default(""),
  PAYMENT_DEMO_SECRET: z.string().default("stellora_demo_secret_2026"),
  // Stripe fallbacks — the admin panel's DB-stored keys take precedence.
  STRIPE_PUBLISHABLE_KEY: z.string().default(""),
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  UPLOAD_MAX_MB: z.string().default("5").transform((v) => Number(v) || 5),
  NODE_ENV: z.string().default("development"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    "Invalid environment configuration: " +
      parsed.error.issues.map((i) => i.path.join(".")).join(", ")
  );
}

export const env = parsed.data;
