import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ userId: string }> };

/** Deactivate/reactivate an admin account. Self-deactivation is blocked to prevent lockout. */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { userId } = await params;
    const body = await req.json();
    const isActive = Boolean(body?.isActive);

    const target = await db.user.findFirst({ where: { id: userId, role: "ADMIN" } });
    if (!target) return fail("NOT_FOUND", "Admin user not found.", 404);
    if (target.id === admin.id && !isActive) {
      return fail("SELF_LOCKOUT", "You cannot deactivate your own account.", 422);
    }

    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { isActive } }),
      ...(isActive ? [] : [db.session.deleteMany({ where: { userId } })]),
    ]);

    await audit(
      {
        actor: admin,
        action: isActive ? "admin.user.activate" : "admin.user.deactivate",
        entityType: "User",
        entityId: userId,
        metadata: { email: target.email },
      },
      req
    );
    return ok({ id: userId, isActive });
  });
}
