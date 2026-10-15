import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { inventoryAdjustSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ variantId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { variantId } = await params;
    const data = inventoryAdjustSchema.parse(await req.json());

    const variant = await db.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) return fail("NOT_FOUND", "Variant not found.", 404);
    if (variant.stock + data.delta < 0) {
      return fail("NEGATIVE_STOCK", `Cannot reduce below zero (current: ${variant.stock}).`, 422);
    }

    const updated = await db.productVariant.update({
      where: { id: variantId },
      data: { stock: { increment: data.delta } },
    });

    await db.stockMovement.create({
      data: {
        variantId,
        delta: data.delta,
        reason: "MANUAL_ADJUST",
        note: data.note || undefined,
        createdById: admin.id,
      },
    });

    await audit(
      {
        actor: admin,
        action: "admin.inventory.adjust",
        entityType: "ProductVariant",
        entityId: variantId,
        metadata: { delta: data.delta, newStock: updated.stock, sku: variant.sku },
      },
      req
    );
    return ok(updated);
  });
}
