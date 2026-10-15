import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { d, money, computeCouponDiscount } from "@/lib/money";
import type { Decimal } from "decimal.js";

export interface CouponCheck {
  valid: boolean;
  message: string;
  discount: number;
  code?: string;
}

/** Validate a coupon against a subtotal for an optional user. Server-authoritative. */
export async function validateCoupon(
  rawCode: string,
  subtotal: number,
  userId?: string | null
): Promise<{ coupon: { id: string; code: string; discountType: "PERCENT" | "FIXED"; value: string; maxDiscount: string | null }; discount: number }> {
  const code = rawCode.trim().toUpperCase();
  const coupon = await db.coupon.findUnique({ where: { code } });
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
    const used = await db.couponRedemption.count({
      where: { couponId: coupon.id, userId },
    });
    if (used >= coupon.perUserLimit) {
      throw new HttpError("INVALID_COUPON", "You have already used this coupon.", 422);
    }
  }
  if (coupon.minSubtotal && d(subtotal).lt(d(coupon.minSubtotal))) {
    throw new HttpError(
      "COUPON_MIN_SUBTOTAL",
      `This coupon requires a minimum order of ₹${money(coupon.minSubtotal)}.`,
      422
    );
  }
  const discount = computeCouponDiscount(subtotal, coupon, subtotal);
  return {
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      value: String(coupon.value),
      maxDiscount: coupon.maxDiscount ? String(coupon.maxDiscount) : null,
    },
    discount,
  };
}

/** Get the active shipping rate (first active by sortOrder). */
export async function getActiveShippingRate() {
  const rate = await db.shippingRate.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return rate;
}

export function computeShipping(
  rate: { baseFee: Decimal | number; freeAbove: Decimal | number | null } | null,
  payableSubtotal: number
): number {
  if (!rate) return 0;
  if (rate.freeAbove && d(payableSubtotal).gte(d(rate.freeAbove))) return 0;
  return money(d(rate.baseFee));
}
