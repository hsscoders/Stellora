import { Decimal } from "decimal.js";

Decimal.set({ precision: 14, rounding: Decimal.ROUND_HALF_UP });

export function d(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

/** Round to 2 decimal places and return as number (for JSON responses). */
export function money(value: Decimal | Decimal.Value): number {
  const n = value instanceof Decimal ? value : d(value);
  return Number(n.toFixed(2));
}

export function computeCouponDiscount(
  subtotal: number,
  coupon: {
    discountType: "PERCENT" | "FIXED";
    value: Decimal | number;
    maxDiscount?: Decimal | number | null;
  },
  fallbackSubtotal: number
): number {
  let discount: Decimal;
  if (coupon.discountType === "PERCENT") {
    discount = d(subtotal).mul(d(coupon.value)).div(100);
  } else {
    discount = d(coupon.value);
  }
  if (coupon.maxDiscount !== null && coupon.maxDiscount !== undefined) {
    discount = Decimal.min(discount, d(coupon.maxDiscount));
  }
  discount = Decimal.min(discount, d(fallbackSubtotal)); // never exceed subtotal
  return money(Decimal.max(discount, 0));
}
