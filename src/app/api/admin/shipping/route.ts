import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { shippingRateSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const rates = await db.shippingRate.findMany({ orderBy: { sortOrder: "asc" } });
    return ok(rates);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const data = shippingRateSchema.parse(await req.json());
    const rate = await db.shippingRate.create({
      data: {
        name: data.name,
        baseFee: data.baseFee,
        freeAbove: data.freeAbove ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    });
    await audit(
      { actor: admin, action: "admin.shipping.create", entityType: "ShippingRate", entityId: rate.id, metadata: { name: rate.name } },
      req
    );
    return ok(rate, 201);
  });
}
