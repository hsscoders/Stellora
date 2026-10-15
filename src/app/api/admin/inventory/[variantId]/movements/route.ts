import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, requireAdmin } from "@/lib/http";

type Params = { params: Promise<{ variantId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    await requireAdmin();
    const { variantId } = await params;
    const movements = await db.stockMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(movements);
  });
}
