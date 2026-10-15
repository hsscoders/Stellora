import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { couponSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ couponId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { couponId } = await params;
    const data = couponSchema.parse(await req.json());

    const existing = await db.coupon.findUnique({ where: { id: couponId } });
    if (!existing) return fail("NOT_FOUND", "Coupon not found.", 404);

    if (data.code !== existing.code) {
      const clash = await db.coupon.findUnique({ where: { code: data.code } });
      if (clash) return fail("CODE_TAKEN", "Code already in use.", 409, { code: "Already in use" });
    }

    const coupon = await db.coupon.update({
      where: { id: couponId },
      data: {
        code: data.code,
        description: data.description || null,
        discountType: data.discountType,
        value: data.value,
        minSubtotal: data.minSubtotal ?? null,
        maxDiscount: data.maxDiscount ?? null,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        usageLimit: data.usageLimit ?? null,
        perUserLimit: data.perUserLimit ?? null,
        isActive: data.isActive,
      },
    });
    await audit(
      { actor: admin, action: "admin.coupon.update", entityType: "Coupon", entityId: couponId, metadata: { code: coupon.code } },
      req
    );
    return ok(coupon);
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { couponId } = await params;
    const used = await db.couponRedemption.count({ where: { couponId } });
    if (used > 0) {
      await db.coupon.update({ where: { id: couponId }, data: { isActive: false } });
      await audit(
        { actor: admin, action: "admin.coupon.deactivate", entityType: "Coupon", entityId: couponId, metadata: { reason: "has redemptions" } },
        req
      );
      return ok({ deactivated: true, message: "Coupon has redemptions — deactivated instead of deleted." });
    }
    await db.coupon.delete({ where: { id: couponId } });
    await audit(
      { actor: admin, action: "admin.coupon.delete", entityType: "Coupon", entityId: couponId },
      req
    );
    return ok({ deleted: true });
  });
}
