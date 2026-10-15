import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, requireUser } from "@/lib/http";

type Params = { params: Promise<{ orderNumber: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { orderNumber } = await params;
    const order = await db.order.findFirst({
      where: { orderNumber, userId: user.id },
      include: {
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        shipment: true,
        payments: true,
      },
    });
    if (!order) return fail("NOT_FOUND", "Order not found.", 404);
    return ok(order);
  });
}
