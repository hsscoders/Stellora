import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { randomToken, sha256 } from "@/lib/auth/password";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return fail("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const data = forgotPasswordSchema.parse(await req.json());
    const user = await db.user.findUnique({ where: { email: data.email } });

    // Always return the same generic response (no account enumeration).
    let devLink: string | undefined;
    if (user && user.isActive) {
      const token = randomToken(32);
      await db.passwordResetToken.create({
        data: {
          tokenHash: sha256(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      // No SMTP provider is configured in this environment. Until email delivery
      // is configured, the reset link is written to the server log and, in
      // development only, returned with an explicit dev-mode label.
      devLink = `${env.APP_URL}/reset-password?token=${token}`;
      console.log(`[auth] password reset requested for ${user.email}. (DEV MODE — SMTP not configured) Reset link: ${devLink}`);
    }

    return ok({
      message:
        "If an account exists for this email, a password reset link has been generated.",
      // Dev-mode only convenience; absent in production once SMTP is configured.
      devLink: env.NODE_ENV === "development" ? devLink : undefined,
    });
  });
}
