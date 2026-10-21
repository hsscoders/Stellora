import { db } from "../lib/db";
import { HttpError } from "../lib/http-errors";
import { d, money, computeCouponDiscount } from "../lib/money";
import type { Prisma } from "@prisma/client";

export interface CouponCheck {
  valid: boolean;
  message: string;
  discount: number;
  code?: string;
}

type CouponRow = Prisma.CouponGetPayload<{ include: { redemptions: true } }>;

/** Validate a coupon against a subtotal for an optional user. Server-authoritative. */
export async function validateCoupon(
  rawCode: string,
  subtotal: number,
  userId?: string | null
): Promise<{
  coupon: {
    id: string;
    code: string;
    discountType: "PERCENT" | "FIXED";
    value: string;
    maxDiscount: string | null;
  };
  discount: number;
}> {
  const code = rawCode.trim().toUpperCase();
  const coupon = await db.coupon.findUnique({
    where: { code },
    include: { redemptions: { select: { userId: true } } },
  });
  if (!coupon || !coupon.isActive) {
    throw new HttpError("INVALID_COUPON", "This coupon code is not valid.", 422);
  }
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new HttpError("INVALID_COUPON", "This coupon is not active yet.", 422);
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    throw new HttpError("INVALID_COUPON", "This coupon has expired.", 422);
  }
  if (coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit) {
    throw new HttpError("INVALID_COUPON", "This coupon has reached its usage limit.", 422);
  }
  if (userId && coupon.perUserLimit !== null) {
    const used = (coupon.redemptions ?? []).filter(
      (r) => r.userId && r.userId === userId
    ).length;
    if (used >= coupon.perUserLimit) {
      throw new HttpError("INVALID_COUPON", "You have already used this coupon.", 422);
    }
  }
  if (coupon.minSubtotal && d(subtotal).lt(d(Number(coupon.minSubtotal)))) {
    throw new HttpError(
      "COUPON_MIN_SUBTOTAL",
      `This coupon requires a minimum order of Rs.${money(Number(coupon.minSubtotal))}.`,
      422
    );
  }
  const discount = computeCouponDiscount(subtotal, couponRowToPlain(coupon), subtotal);
  return {
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType as "PERCENT" | "FIXED",
      value: String(Number(coupon.value)),
      maxDiscount: coupon.maxDiscount !== null ? String(Number(coupon.maxDiscount)) : null,
    },
    discount,
  };
}

/** Plain-number view of a coupon for the money helpers. */
export function couponRowToPlain(coupon: any) {
  return {
    code: coupon.code,
    discountType: coupon.discountType as "PERCENT" | "FIXED",
    value: Number(coupon.value),
    maxDiscount: coupon.maxDiscount !== null ? Number(coupon.maxDiscount) : null,
    minSubtotal: coupon.minSubtotal !== null ? Number(coupon.minSubtotal) : null,
  };
}

/** Get the active shipping rate (first active by sortOrder). */
export async function getActiveShippingRate() {
  const rate = await db.shippingRate.findFirst({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!rate) return null;
  return {
    id: rate.id,
    name: rate.name,
    baseFee: Number(rate.baseFee),
    freeAbove: rate.freeAbove !== null ? Number(rate.freeAbove) : null,
  };
}

export function computeShipping(
  rate: { baseFee: number; freeAbove: number | null } | null,
  payableSubtotal: number
): number {
  if (!rate) return 0;
  if (rate.freeAbove && d(payableSubtotal).gte(d(rate.freeAbove))) return 0;
  return money(d(rate.baseFee));
}
