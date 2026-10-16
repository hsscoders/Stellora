import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "path";
import { env } from "./env";
import { fail } from "./lib/http";
import { storefrontRouter } from "./routes/storefront";
import { authRouter } from "./routes/auth";
import { accountRouter } from "./routes/account";
import { cartRouter, wishlistRouter } from "./routes/cart";
import { commerceRouter } from "./routes/commerce";
import { adminRouter } from "./routes/admin";

const app = express();

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: [env.APP_URL, "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Uploaded media (admin uploads) — served under /api/media
app.use(
  "/api/media",
  express.static(path.join(process.cwd(), "uploads"), {
    fallthrough: true,
    maxAge: "30d",
  })
);

// Public product/contact imagery fallback used by legacy URLs
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

// API routers (paths inside routers include their prefixes: /auth, /account, /cart, /admin, ...)
app.use("/api", storefrontRouter);
app.use("/api", authRouter);
app.use("/api", accountRouter);
app.use("/api", cartRouter);
app.use("/api", wishlistRouter);
app.use("/api", commerceRouter);
app.use("/api", adminRouter);

// Contact form (public) — mounted here to keep routes table tidy
import { ContactMessage } from "./models";
import { contactSchema } from "./validation";
import { handle as wrap, assertSameOrigin, ok as okRes } from "./lib/http";
import { rateLimit, getClientIp } from "./lib/rate-limit";

app.post(
  "/api/contact",
  wrap(async (req, res) => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`contact:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Too many messages. Please try again later." },
      });
    }
    const data = contactSchema.parse(req.body);
    await ContactMessage.create({
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
    });
    return okRes(res, {
      message: "Thank you for reaching out. Our team will get back to you soon.",
    });
  })
);

// 404 for unknown API paths
app.use("/api", (_req, res) => {
  fail(res, "NOT_FOUND", "Endpoint not found.", 404);
});

async function main() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`[backend] MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  app.listen(env.PORT, "127.0.0.1", () => {
    console.log(`[backend] Stellora API listening on http://127.0.0.1:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("[backend] fatal:", err);
  process.exit(1);
});
