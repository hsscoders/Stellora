import { describe, it, expect } from "vitest";
import { computeCouponDiscount, money, d } from "@/lib/money";

describe("money helpers", () => {
  it("rounds to 2 decimals", () => {
    expect(money(d("10.005"))).toBe(10.01);
    expect(money(d("99.999"))).toBe(100);
    expect(money(d(5))).toBe(5);
  });

  it("adds precisely with Decimal", () => {
    expect(money(d("0.1").plus("0.2"))).toBe(0.3);
  });
});

describe("coupon discount", () => {
  it("applies percentage discount", () => {
    const discount = computeCouponDiscount(
      1000,
      { discountType: "PERCENT", value: 10, maxDiscount: null },
      1000
    );
    expect(discount).toBe(100);
  });

  it("caps percentage discount at maxDiscount", () => {
    const discount = computeCouponDiscount(
      1000,
      { discountType: "PERCENT", value: 50, maxDiscount: 300 },
      1000
    );
    expect(discount).toBe(300);
  });

  it("applies fixed discount", () => {
    const discount = computeCouponDiscount(
      1500,
      { discountType: "FIXED", value: 200, maxDiscount: null },
      1500
    );
    expect(discount).toBe(200);
  });

  it("never discounts more than the subtotal", () => {
    const discount = computeCouponDiscount(
      100,
      { discountType: "FIXED", value: 500, maxDiscount: null },
      100
    );
    expect(discount).toBe(100);
  });

  it("handles decimal results", () => {
    const discount = computeCouponDiscount(
      999,
      { discountType: "PERCENT", value: 10, maxDiscount: null },
      999
    );
    expect(discount).toBe(99.9);
  });
});
