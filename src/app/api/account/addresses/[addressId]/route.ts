import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireUser } from "@/lib/http";
import { addressSchema } from "@/lib/validation/auth";

type Params = { params: Promise<{ addressId: string }> };

/** Ownership check: customers can only ever touch their own addresses. */
export async function PUT(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { addressId } = await params;
    const data = addressSchema.parse(await req.json());

    const existing = await db.address.findFirst({ where: { id: addressId, userId: user.id } });
    if (!existing) return fail("NOT_FOUND", "Address not found.", 404);

    const updated = await db.address.update({
      where: { id: addressId },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 || null,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        country: data.country || "India",
      },
    });
    if (data.isDefault) {
      await db.address.updateMany({
        where: { userId: user.id, id: { not: addressId } },
        data: { isDefault: false },
      });
      await db.address.update({ where: { id: addressId }, data: { isDefault: true } });
    }
    return ok(updated);
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { addressId } = await params;
    const deleted = await db.address.deleteMany({ where: { id: addressId, userId: user.id } });
    if (deleted.count === 0) return fail("NOT_FOUND", "Address not found.", 404);
    return ok({ deleted: true });
  });
}
