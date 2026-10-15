import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin } from "@/lib/http";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { hashPassword, sha256 } from "@/lib/auth/password";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`reset:${ip}`, 10, 60 * 60 * 1000);
    if (!rl.allowed) {
      return fail("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const data = resetPasswordSchema.parse(await req.json());
    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash: sha256(data.token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
      return fail("INVALID_TOKEN", "This reset link is invalid or has expired.", 422);
    }

    const passwordHash = await hashPassword(data.password);
    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      db.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all existing sessions for safety
      db.session.deleteMany({ where: { userId: record.userId } }),
    ]);

    return ok({ message: "Password updated. You can now sign in with your new password." });
  });
}
