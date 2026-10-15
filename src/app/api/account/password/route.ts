import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireUser } from "@/lib/http";
import { passwordChangeSchema } from "@/lib/validation/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { audit } from "@/lib/services/audit";

export async function PUT(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const data = passwordChangeSchema.parse(await req.json());

    const record = await db.user.findUnique({ where: { id: user.id } });
    if (!record || !(await verifyPassword(data.currentPassword, record.passwordHash))) {
      return fail("INVALID_CREDENTIALS", "Your current password is incorrect.", 401, {
        currentPassword: "Your current password is incorrect.",
      });
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.newPassword) },
    });
    await audit({ actor: user, action: "account.password_change", entityType: "User", entityId: user.id }, req);
    return ok({ message: "Password updated successfully." });
  });
}
