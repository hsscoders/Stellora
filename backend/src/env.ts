import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // MySQL — either DATABASE_URL directly or the DB_* parts (DATABASE_URL wins).
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.string().default("3306").transform((v) => Number(v) || 3306),
  DB_NAME: z.string().default("Stellora"),
  DB_USER: z.string().default("Stellora"),
  DB_PASSWORD: z.string().default(""),
  PORT: z.string().default("4000").transform((v) => Number(v) || 4000),
  APP_URL: z.string().default("http://localhost:3000"),
  // Dot-suffix allowlist for dynamic preview/sandbox hosts (e.g. preview-<id>.space-z.ai).
  // A browser Origin whose host ends with one of these is treated as same-origin
  // for the state-changing-request CSRF check. Comma-separated.
  ORIGIN_SUFFIXES: z.string().default(".space-z.ai,.z.ai,.onrender.com"),
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

const parsedInput = envSchema.safeParse(process.env);
if (!parsedInput.success) {
  throw new Error(
    "Invalid environment configuration: " +
      parsedInput.error.issues.map((i) => i.path.join(".")).join(", ")
  );
}

const input = parsedInput.data;

/** Build the Prisma MySQL connection URL from DB_* parts when DATABASE_URL is absent
 *  (or not a mysql:// URL — guards against foreign DATABASE_URL values in shared hosts). */
export const databaseUrl =
  input.DATABASE_URL && input.DATABASE_URL.startsWith("mysql://")
    ? input.DATABASE_URL
    : `mysql://${encodeURIComponent(input.DB_USER)}:${encodeURIComponent(
        input.DB_PASSWORD
      )}@${input.DB_HOST}:${input.DB_PORT}/${encodeURIComponent(input.DB_NAME)}?connection_limit=10`;

export const env = { ...input, DATABASE_URL: databaseUrl };

// Make sure PrismaClient (lib/db.ts) sees the final URL even when only DB_* parts were set.
process.env.DATABASE_URL = databaseUrl;
