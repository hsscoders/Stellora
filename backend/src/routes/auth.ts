import { Router } from "express";
import { db, newId } from "../lib/db";
import { ok, fail, handle, assertSameOrigin } from "../lib/http";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  normalizePhone,
} from "../validation";
import { hashPassword, verifyPassword, randomToken, sha256 } from "../lib/password";
import {
  createSession,
  destroySession,
  getCurrentUser,
  readCartKey,
  getOrCreateCartKey,
} from "../lib/auth";
import { mergeGuestCart } from "../services/cart";
import { rateLimit, getClientIp } from "../lib/rate-limit";
import { audit } from "../services/audit";
import { env } from "../env";

export const authRouter = Router();

authRouter.post(
  "/auth/register",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`register:${ip}`, 8, 60 * 60 * 1000);
    if (!rl.allowed) {
      return fail(res, "RATE_LIMITED", "Too many sign-up attempts. Please try again later.", 429);
    }

    const data = registerSchema.parse(req.body);

    /* Mobile-first uniqueness checks: the phone number is the primary
       identity, so a duplicate phone blocks sign-up just like a duplicate
       email did before. Email stays unique whenever the customer adds one. */
    const existingPhone = await db.user.findFirst({ where: { phone: data.phone }, select: { id: true } });
    if (existingPhone) {
      return fail(res, "PHONE_TAKEN", "An account with this mobile number already exists.", 409, {
        phone: "An account with this mobile number already exists.",
      });
    }
    if (data.email) {
      const existing = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
      if (existing) {
        return fail(res, "EMAIL_TAKEN", "An account with this email already exists.", 409, {
          email: "An account with this email already exists.",
        });
      }
    }

    const passwordHash = await hashPassword(data.password);
    const user = await db.user.create({
      data: {
        id: newId(),
        /* The MySQL unique index ignores NULLs — the equivalent of Mongo's
           sparse unique index — so phone-only accounts just leave email out. */
        email: data.email || null,
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: "CUSTOMER",
      },
    });

    // Merge guest cart into the new user cart
    const guestKey = readCartKey(req);
    if (guestKey) {
      await mergeGuestCart(user.id, guestKey);
    } else {
      getOrCreateCartKey(req, res);
    }

    await createSession(res, user.id, {
      ip,
      userAgent: req.headers["user-agent"] as string | undefined,
    });

    // Realtime nudge: the admin dashboard grows its customer counter live.
    try {
      const { notifyNewUser } = await import("../services/realtime");
      notifyNewUser({ name: user.name, email: user.email ?? null, at: new Date().toISOString() });
    } catch {
      // best-effort
    }

    await audit(
      {
        actor: { id: user.id, email: user.email ?? null, name: user.name, role: user.role, phone: user.phone ?? null },
        action: "auth.register",
        entityType: "User",
        entityId: user.id,
      },
      req
    );

    return ok(res, { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role }, 201);
  })
);

authRouter.post(
  "/auth/login",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const data = loginSchema.parse(req.body);

    /* One identifier field — the customer types a mobile number (the common
       case at a local shop) or an email; both work with the same password. */
    const rawIdentifier = (data.identifier ?? data.email ?? "").trim();
    if (!rawIdentifier) {
      return fail(res, "VALIDATION_ERROR", "Enter your mobile number or email.", 422, {
        identifier: "Enter your mobile number or email.",
      });
    }
    const phoneCandidate = normalizePhone(rawIdentifier);

    const rl = rateLimit(`login:${ip}:${rawIdentifier.toLowerCase()}`, 8, 15 * 60 * 1000);
    if (!rl.allowed) {
      return fail(res, "RATE_LIMITED",
        `Too many sign-in attempts. Please try again in ${rl.retryAfterSec} seconds.`,
        429
      );
    }

    const user = phoneCandidate
      ? await db.user.findFirst({ where: { phone: phoneCandidate } })
      : rawIdentifier
        ? await db.user.findUnique({ where: { email: rawIdentifier } })
        : null;
    const invalid = "Incorrect mobile number/email or password.";
    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      return fail(res, "INVALID_CREDENTIALS", invalid, 401);
    }
    if (!user.isActive) {
      return fail(res, "ACCOUNT_DISABLED", "This account has been deactivated. Contact support.", 403);
    }

    const guestKey = readCartKey(req);
    if (guestKey) await mergeGuestCart(user.id, guestKey);

    await createSession(res, user.id, {
      ip,
      userAgent: req.headers["user-agent"] as string | undefined,
    });
    await audit(
      {
        actor: { id: user.id, email: user.email ?? null, name: user.name, role: user.role, phone: user.phone ?? null },
        action: "auth.login",
        entityType: "User",
        entityId: user.id,
      },
      req
    );

    return ok(res, { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role });
  })
);

authRouter.post(
  "/auth/logout",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await getCurrentUser(req);
    await destroySession(req, res);
    if (user) {
      await audit({ actor: user, action: "auth.logout", entityType: "User", entityId: user.id }, req);
    }
    return ok(res, { signedOut: true });
  })
);

authRouter.get(
  "/auth/me",
  handle(async (req, res) => {
    const user = await getCurrentUser(req);
    return ok(res, { user });
  })
);

authRouter.post(
  "/auth/forgot-password",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return fail(res, "RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    /* Identifier may be a mobile number or an email — resolve the account the
       same way login does. The response text stays generic (no enumeration). */
    const data = forgotPasswordSchema.parse(req.body);
    const rawIdentifier = (data.identifier ?? data.email ?? "").trim().toLowerCase();
    const phoneCandidate = normalizePhone(rawIdentifier);
    const user = phoneCandidate
      ? await db.user.findFirst({ where: { phone: phoneCandidate }, select: { id: true, email: true, isActive: true } })
      : rawIdentifier
        ? await db.user.findUnique({ where: { email: rawIdentifier }, select: { id: true, email: true, isActive: true } })
        : null;

    // Always return the same generic response (no account enumeration).
    let devLink: string | undefined;
    if (user && user.isActive && user.email) {
      // Reset links arrive by email — accounts created with only a mobile
      // number cannot receive one, so the shop helps those in person.
      const token = randomToken(32);
      await db.passwordResetToken.create({
        data: {
          id: newId(),
          tokenHash: sha256(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      // No SMTP provider is configured in this environment. Until email delivery
      // is configured, the reset link is written to the server log and, in
      // development only, returned with an explicit dev-mode label.
      devLink = `${env.APP_URL}/reset-password?token=${token}`;
      console.log(
        `[auth] password reset requested for ${user.email}. (DEV MODE — SMTP not configured) Reset link: ${devLink}`
      );
    }

    return ok(res, {
      message: "If an account exists, a password reset link has been generated.",
      devLink: env.NODE_ENV === "development" ? devLink : undefined,
    });
  })
);

authRouter.post(
  "/auth/reset-password",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`reset:${ip}`, 10, 60 * 60 * 1000);
    if (!rl.allowed) {
      return fail(res, "RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const data = resetPasswordSchema.parse(req.body);
    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash: sha256(data.token) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return fail(res, "INVALID_TOKEN", "This reset link is invalid or has expired.", 422);
    }
    const target = await db.user.findUnique({ where: { id: record.userId }, select: { isActive: true } });
    if (!target?.isActive) {
      return fail(res, "INVALID_TOKEN", "This reset link is invalid or has expired.", 422);
    }

    const passwordHash = await hashPassword(data.password);
    await db.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    // Invalidate all existing sessions for safety
    await db.session.deleteMany({ where: { userId: record.userId } });

    return ok(res, { message: "Password updated. You can now sign in with your new password." });
  })
);
