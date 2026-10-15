import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ customerId: string }> };

/** Customers are deactivated/reactivated — never deleted (order records must persist). */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { customerId } = await params;
    const body = await req.json();
    const isActive = Boolean(body?.isActive);

    const target = await db.user.findFirst({ where: { id: customerId, role: "CUSTOMER" } });
    if (!target) return fail("NOT_FOUND", "Customer not found.", 404);

    await db.$transaction([
      db.user.update({ where: { id: customerId }, data: { isActive } }),
      ...(isActive ? [] : [db.session.deleteMany({ where: { userId: customerId } })]),
    ]);

    await audit(
      {
        actor: admin,
        action: isActive ? "admin.customer.activate" : "admin.customer.deactivate",
        entityType: "User",
        entityId: customerId,
        metadata: { email: target.email },
      },
      req
    );
    return ok({ id: customerId, isActive });
  });
}
