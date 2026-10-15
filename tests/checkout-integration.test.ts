/**
 * Integration tests against the real MariaDB database.
 * Validates the critical checkout guarantees: idempotency and oversell protection.
 * Run: DATABASE_URL=mysql://stellora:stellora_dev_pw@127.0.0.1:33061/stellora bun run test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

let testUserId: string;
let testVariantId: string;
const sufs = Date.now().toString(36);

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: `itest-${sufs}@stellora.test`,
      passwordHash: "scrypt$00$00",
      name: "Integration Test User",
      role: "CUSTOMER",
    },
  });
  testUserId = user.id;

  const category = await db.category.create({
    data: { slug: `itest-cat-${sufs}`, name: "Integration Test Category", sortOrder: 99 },
  });
  const product = await db.product.create({
    data: {
      slug: `itest-product-${sufs}`,
      categoryId: category.id,
      name: "Integration Test Product",
      shortDescription: "A product created by automated integration tests.",
      status: "ACTIVE",
      variants: {
        create: { sku: `ITEST-${sufs}`, name: "One Size", price: 499, stock: 2 },
      },
    },
    include: { variants: true },
  });
  testVariantId = product.variants[0].id;

  await db.address.create({
    data: {
      userId: testUserId,
      fullName: "Integration Test",
      phone: "9800000000",
      line1: "1 Test Lane",
      city: "Testville",
      state: "Test State",
      pincode: "140001",
      isDefault: true,
    },
  });
});

afterAll(async () => {
  // Clean up all test data
  const orders = await db.order.findMany({ where: { userId: testUserId } });
  for (const o of orders) {
    await db.order.delete({ where: { id: o.id } }).catch(() => {});
  }
  await db.productVariant.deleteMany({ where: { sku: { startsWith: "ITEST-" } } }).catch(() => {});
  await db.product.deleteMany({ where: { slug: { startsWith: "itest-product-" } } }).catch(() => {});
  await db.category.deleteMany({ where: { slug: { startsWith: "itest-cat-" } } }).catch(() => {});
  await db.cart.deleteMany({ where: { userId: testUserId } }).catch(() => {});
  await db.address.deleteMany({ where: { userId: testUserId } }).catch(() => {});
  await db.user.delete({ where: { id: testUserId } }).catch(() => {});
  await db.$disconnect();
});

describe("inventory integrity", () => {
  it("conditional stock decrement is race-safe (no oversell)", async () => {
    const before = await db.productVariant.findUnique({ where: { id: testVariantId } });
    expect(before?.stock).toBe(2);

    // Simulate 5 concurrent buyers each wanting 1 unit; only 2 can succeed
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        db.productVariant.updateMany({
          where: { id: testVariantId, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        })
      )
    );
    const successes = results.filter((r) => r.count === 1).length;
    expect(successes).toBe(2);

    const after = await db.productVariant.findUnique({ where: { id: testVariantId } });
    expect(after?.stock).toBe(0);

    // Restore
    await db.productVariant.update({ where: { id: testVariantId }, data: { stock: 2 } });
  });
});

describe("order idempotency", () => {
  it("enforces unique idempotencyKey on orders", async () => {
    const key = `itest-key-${sufs}`;
    const order1 = await db.order.create({
      data: {
        orderNumber: `STL-TEST-${sufs.toUpperCase()}`,
        userId: testUserId,
        idempotencyKey: key,
        subtotal: 499,
        grandTotal: 499,
        shipName: "T", shipPhone: "9800000000", shipLine1: "1 Test Lane",
        shipCity: "Testville", shipState: "TS", shipPincode: "140001",
      },
    });
    // A second order with the same key must be rejected by the unique constraint
    await expect(
      db.order.create({
        data: {
          orderNumber: `STL-TEST-${sufs.toUpperCase()}-2`,
          userId: testUserId,
          idempotencyKey: key,
          subtotal: 499,
          grandTotal: 499,
          shipName: "T", shipPhone: "9800000000", shipLine1: "1 Test Lane",
          shipCity: "Testville", shipState: "TS", shipPincode: "140001",
        },
      })
    ).rejects.toThrow();
    await db.order.delete({ where: { id: order1.id } });
  });
});

describe("order status state machine (data-level)", () => {
  it("stores only valid enum statuses", async () => {
    const order = await db.order.create({
      data: {
        orderNumber: `STL-TST2-${sufs.toUpperCase()}`,
        userId: testUserId,
        idempotencyKey: `itest-key2-${sufs}`,
        subtotal: 100,
        grandTotal: 100,
        status: "PENDING",
        shipName: "T", shipPhone: "9800000000", shipLine1: "1 Test Lane",
        shipCity: "Testville", shipState: "TS", shipPincode: "140001",
      },
    });
    expect(order.status).toBe("PENDING");
    const updated = await db.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    });
    expect(updated.status).toBe("CONFIRMED");
    // Invalid status is rejected at the DB/driver level
    await expect(
      db.order.update({ where: { id: order.id }, data: { status: "NOT_A_STATUS" as never } })
    ).rejects.toThrow();
    await db.order.delete({ where: { id: order.id } });
  });
});
