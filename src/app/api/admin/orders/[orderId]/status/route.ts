import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { transitionOrderStatus } from "@/lib/services/orders";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ orderId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { orderId } = await params;
    const body = await req.json();
    const status = String(body?.status ?? "");
    const note = body?.note ? String(body.note).slice(0, 300) : undefined;
    const carrier = body?.carrier ? String(body.carrier).slice(0, 80) : undefined;
    const trackingNumber = body?.trackingNumber ? String(body.trackingNumber).slice(0, 80) : undefined;

    if (!status) return fail("VALIDATION_ERROR", "Status is required.", 422);

    const result = await transitionOrderStatus(orderId, status, {
      actorId: admin.id,
      note,
      carrier,
      trackingNumber,
    });

    await audit(
      {
        actor: admin,
        action: "admin.order.status_change",
        entityType: "Order",
        entityId: orderId,
        metadata: { orderNumber: result.orderNumber, to: status },
      },
      req
    );
    return ok(result);
  });
}
