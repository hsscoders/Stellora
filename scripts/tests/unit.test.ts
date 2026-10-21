/**
 * Stellora unit tests — pure logic, no network, no DB.
 * Runner: node:test via tsx (zero new dependencies).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { money, computeCouponDiscount } from "../../backend/src/lib/money.ts";
import { slugify, generateOrderNumber } from "../../backend/src/lib/utils.ts";
import { normalizePhone } from "../../backend/src/validation/index.ts";
import { hashPassword, verifyPassword, randomToken, sha256 } from "../../backend/src/lib/password.ts";
import { computeEarn, maxRedeemable, MIN_REDEEM, MAX_REDEEM_PCT } from "../../backend/src/services/loyalty.ts";
import { computeShipping } from "../../backend/src/services/pricing.ts";
import { demoProcessCard, demoProcessUpi } from "../../backend/src/services/payments.ts";
import { maskKey } from "../../backend/src/services/gateway-config.ts";
import { STATUS_TRANSITIONS } from "../../backend/src/services/orders.ts";

describe("money", () => {
  test("rounds to 2 decimals", () => {
    assert.equal(money(10.999), 11);
    assert.equal(money(10.994), 10.99);
    assert.equal(money("1499"), 1499);
  });
  test("handles float artifacts", () => {
    assert.equal(money(0.1 + 0.2), 0.3);
  });
});

describe("computeCouponDiscount", () => {
  test("percent discount", () => {
    assert.equal(computeCouponDiscount(1000, { discountType: "PERCENT", value: 10 }, 1000), 100);
  });
  test("fixed discount", () => {
    assert.equal(computeCouponDiscount(1000, { discountType: "FIXED", value: 250 }, 1000), 250);
  });
  test("maxDiscount cap applies", () => {
    assert.equal(
      computeCouponDiscount(1000, { discountType: "PERCENT", value: 50, maxDiscount: 200 }, 1000),
      200
    );
  });
  test("discount never exceeds subtotal", () => {
    assert.equal(computeCouponDiscount(100, { discountType: "FIXED", value: 500 }, 100), 100);
  });
  test("discount never negative", () => {
    assert.equal(computeCouponDiscount(0, { discountType: "PERCENT", value: 10 }, 0), 0);
  });
});

describe("normalizePhone", () => {
  test("bare 10-digit", () => assert.equal(normalizePhone("9876543210"), "9876543210"));
  test("leading 0", () => assert.equal(normalizePhone("098765 43210"), "9876543210"));
  test("+91 prefix", () => assert.equal(normalizePhone("+91 98765 43210"), "9876543210"));
  test("91 prefix without +", () => assert.equal(normalizePhone("919876543210"), "9876543210"));
  test("rejects non-Indian leading digit", () => assert.equal(normalizePhone("1234567890"), null));
  test("rejects short numbers", () => assert.equal(normalizePhone("987654321"), null));
  test("rejects garbage", () => assert.equal(normalizePhone("hello"), null));
});

describe("password hashing (scrypt)", () => {
  test("hash + verify roundtrip", async () => {
    const hash = await hashPassword("S3curePassw0rd");
    assert.match(hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    assert.equal(await verifyPassword("S3curePassw0rd", hash), true);
    assert.equal(await verifyPassword("wrong", hash), false);
  });
  test("verify rejects malformed stored hashes without throwing", async () => {
    assert.equal(await verifyPassword("x", "not-a-hash"), false);
    assert.equal(await verifyPassword("x", "md5$deadbeef$deadbeef"), false);
  });
  test("randomToken length and sha256 stability", () => {
    const t1 = randomToken(32);
    assert.equal(t1.length, 43); // 32 bytes base64url
    assert.equal(sha256("abc"), sha256("abc"));
    assert.notEqual(sha256("abc"), sha256("abd"));
  });
});

describe("loyalty rules", () => {
  test("earn: 1 point per full Rs.100", () => {
    assert.equal(computeEarn(999), 9);
    assert.equal(computeEarn(1000), 10);
    assert.equal(computeEarn(99), 0);
  });
  test("maxRedeemable caps at 30% of payable subtotal", () => {
    assert.equal(maxRedeemable(1000), 300);
    assert.equal(maxRedeemable(10), 3);
    assert.equal(maxRedeemable(0), 0);
  });
  test("MIN_REDEEM is 100 and MAX_REDEEM_PCT is 0.3", () => {
    assert.equal(MIN_REDEEM, 100);
    assert.equal(MAX_REDEEM_PCT, 0.3);
  });
});

describe("shipping", () => {
  test("no active rate -> free shipping", () => {
    assert.equal(computeShipping(null, 500), 0);
  });
  test("base fee charged below threshold", () => {
    assert.equal(computeShipping({ baseFee: 79, freeAbove: 1999 }, 500), 79);
  });
  test("free above threshold", () => {
    assert.equal(computeShipping({ baseFee: 79, freeAbove: 1999 }, 2000), 0);
    assert.equal(computeShipping({ baseFee: 79, freeAbove: 1999 }, 1999), 0);
  });
});

describe("demo payment gateway simulation", () => {
  test("valid card approved", () => {
    const r = demoProcessCard("4111 1111 1111 1111");
    assert.equal(r.approved, true);
    assert.match(r.gatewayPaymentId!, /^demo_pay_/);
  });
  test("card ending 0002 declined", () => {
    assert.equal(demoProcessCard("4000 0000 0000 0002").approved, false);
  });
  test("short card rejected", () => {
    assert.equal(demoProcessCard("411").approved, false);
  });
  test("valid UPI approved, invalid rejected", () => {
    assert.equal(demoProcessUpi("customer@okicici").approved, true);
    assert.equal(demoProcessUpi("not-a-upi").approved, false);
  });
});

describe("gateway key masking", () => {
  test("secrets are masked, never returned raw", () => {
    const masked = maskKey("rzp_live_AbCdEfGh12345678");
    assert.ok(!masked.includes("AbCdEfGh12345678"), "full secret leaked!");
    assert.ok(masked.includes("••••"));
  });
});

describe("order state machine", () => {
  test("terminal states have no exits", () => {
    assert.deepEqual(STATUS_TRANSITIONS["DELIVERED"], []);
    assert.deepEqual(STATUS_TRANSITIONS["CANCELLED"], []);
  });
  test("PENDING can only confirm or cancel", () => {
    assert.deepEqual(STATUS_TRANSITIONS["PENDING"], ["CONFIRMED", "CANCELLED"]);
  });
  test("no transition skips the pipeline", () => {
    assert.ok(!STATUS_TRANSITIONS["PENDING"].includes("SHIPPED"));
    assert.ok(!STATUS_TRANSITIONS["CONFIRMED"].includes("DELIVERED"));
  });
});

describe("utils", () => {
  test("slugify strips unsafe chars", () => {
    assert.equal(slugify("Aurelia Silver Pendant!"), "aurelia-silver-pendant");
    assert.equal(slugify("  multi   spaces "), "multi-spaces");
  });
  test("order number format", () => {
    const n = generateOrderNumber();
    assert.match(n, /^STL-\d{4}-[0-9A-F]{6}$/);
  });
});
