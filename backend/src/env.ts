import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  PORT: z.string().default("4000").transform((v) => Number(v) || 4000),
  APP_URL: z.string().default("http://localhost:3000"),
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
