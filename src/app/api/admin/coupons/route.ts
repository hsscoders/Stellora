import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { couponSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const coupons = await db.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { redemptions: true } } },
    });
    return ok(coupons);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const data = couponSchema.parse(await req.json());

    const clash = await db.coupon.findUnique({ where: { code: data.code } });
    if (clash) return fail("CODE_TAKEN", "This coupon code already exists.", 409, { code: "Already in use" });

    if (data.discountType === "PERCENT" && data.value > 100) {
      return fail("VALIDATION_ERROR", "Percent discount cannot exceed 100.", 422, { value: "Max 100" });
    }

    const coupon = await db.coupon.create({
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
      { actor: admin, action: "admin.coupon.create", entityType: "Coupon", entityId: coupon.id, metadata: { code: coupon.code } },
      req
    );
    return ok(coupon, 201);
  });
}
