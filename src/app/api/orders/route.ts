import { db } from "@/lib/db";
import { handle, ok, requireUser } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const orders = await db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { items: { take: 1 } },
    });
    return ok(
      orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        grandTotal: o.grandTotal,
        currency: o.currency,
        createdAt: o.createdAt,
        itemCount: o.items.length,
        preview: o.items[0]?.productName ?? null,
      }))
    );
  });
}
