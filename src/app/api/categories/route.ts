import { db } from "@/lib/db";
import { handle, ok } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    const categories = await db.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { products: { where: { status: "ACTIVE" } } } } },
    });
    return ok(categories);
  });
}
