import { db } from "@/lib/db";
import { handle, ok, requireAdmin } from "@/lib/http";

/** Admin customer listing — read-only personal data (no password material ever returned). */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const customers = await db.user.findMany({
      where: { role: "CUSTOMER" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(customers);
  });
}
