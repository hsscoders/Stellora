import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin } from "@/lib/http";
import { loginSchema } from "@/lib/validation/auth";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, readCartKey } from "@/lib/auth/session";
import { mergeGuestCart } from "@/lib/services/cart";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/services/audit";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const body = await req.json();
    const data = loginSchema.parse(body);

    const rl = rateLimit(`login:${ip}:${data.email}`, 8, 15 * 60 * 1000);
    if (!rl.allowed) {
      return fail(
        "RATE_LIMITED",
        `Too many sign-in attempts. Please try again in ${rl.retryAfterSec} seconds.`,
        429
      );
    }

    const user = await db.user.findUnique({ where: { email: data.email } });
    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      return fail("INVALID_CREDENTIALS", "Incorrect email or password.", 401);
    }
    if (!user.isActive) {
      return fail("ACCOUNT_DISABLED", "This account has been deactivated. Contact support.", 403);
    }

    const guestKey = await readCartKey();
    if (guestKey) await mergeGuestCart(user.id, guestKey);

    await createSession(user.id, {
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    await audit(
      { actor: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone }, action: "auth.login", entityType: "User", entityId: user.id },
      req
    );

    return ok({ id: user.id, email: user.email, name: user.name, role: user.role });
  });
}
