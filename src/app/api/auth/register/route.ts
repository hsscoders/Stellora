import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin } from "@/lib/http";
import { registerSchema } from "@/lib/validation/auth";
import { hashPassword } from "@/lib/auth/password";
import { createSession, readCartKey, getOrCreateCartKey } from "@/lib/auth/session";
import { mergeGuestCart } from "@/lib/services/cart";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/services/audit";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`register:${ip}`, 8, 60 * 60 * 1000);
    if (!rl.allowed) {
      return fail("RATE_LIMITED", "Too many sign-up attempts. Please try again later.", 429);
    }

    const body = await req.json();
    const data = registerSchema.parse(body);

    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return fail("EMAIL_TAKEN", "An account with this email already exists.", 409, {
        email: "An account with this email already exists.",
      });
    }

    const passwordHash = await hashPassword(data.password);
    const user = await db.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone || null,
        role: "CUSTOMER",
      },
    });

    // Merge guest cart into the new user cart
    const guestKey = await readCartKey();
    if (guestKey) {
      await mergeGuestCart(user.id, guestKey);
    } else {
      await getOrCreateCartKey();
    }

    await createSession(user.id, {
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    await audit(
      {
        actor: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
        action: "auth.register",
        entityType: "User",
        entityId: user.id,
      },
      req
    );

    return ok({ id: user.id, email: user.email, name: user.name, role: user.role }, 201);
  });
}
