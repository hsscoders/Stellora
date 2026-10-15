import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ orderId: string }> };

/** Payment status is changed only by an admin and only with explicit human confirmation. */
const ALLOWED: Record<string, string[]> = {
  PENDING: ["PAID", "FAILED"],
  PAID: ["REFUNDED"],
  FAILED: ["PENDING", "PAID"],
  REFUNDED: [],
};

export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { orderId } = await params;
    const body = await req.json();
    const nextStatus = String(body?.paymentStatus ?? "");

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) return fail("NOT_FOUND", "Order not found.", 404);

    if (!ALLOWED[order.paymentStatus]?.includes(nextStatus)) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot change payment status from ${order.paymentStatus} to ${nextStatus}.`,
        422
      );
    }

    await db.$transaction([
      db.order.update({ where: { id: orderId }, data: { paymentStatus: nextStatus as never } }),
      db.payment.updateMany({
        where: { orderId, status: { not: "REFUNDED" } },
        data: {
          status: nextStatus as never,
          verifiedAt: nextStatus === "PAID" ? new Date() : null,
        },
      }),
    ]);

    await audit(
      {
        actor: admin,
        action: "admin.order.payment_status",
        entityType: "Order",
        entityId: orderId,
        metadata: { orderNumber: order.orderNumber, paymentStatus: nextStatus },
      },
      req
    );
    return ok({ paymentStatus: nextStatus });
  });
}
