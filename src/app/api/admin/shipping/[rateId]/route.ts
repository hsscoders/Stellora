import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { shippingRateSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ rateId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { rateId } = await params;
    const data = shippingRateSchema.parse(await req.json());
    const rate = await db.shippingRate.update({
      where: { id: rateId },
      data: {
        name: data.name,
        baseFee: data.baseFee,
        freeAbove: data.freeAbove ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    });
    await audit(
      { actor: admin, action: "admin.shipping.update", entityType: "ShippingRate", entityId: rateId },
      req
    );
    return ok(rate);
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { rateId } = await params;
    await db.shippingRate.delete({ where: { id: rateId } });
    await audit(
      { actor: admin, action: "admin.shipping.delete", entityType: "ShippingRate", entityId: rateId },
      req
    );
    return ok({ deleted: true });
  });
}
