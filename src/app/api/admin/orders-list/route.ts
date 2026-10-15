import { db } from "@/lib/db";
import { handle, ok, requireAdmin } from "@/lib/http";

/** Admin order listing — separate from customer /api/orders which is self-scoped. */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const orders = await db.order.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
      take: 200,
    });
    return ok(orders);
  });
}
