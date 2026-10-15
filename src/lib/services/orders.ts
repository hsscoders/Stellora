import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { d, money } from "@/lib/money";
import { generateOrderNumber } from "@/lib/utils";
import { getCartView } from "@/lib/services/cart";
import { getActiveShippingRate, computeShipping, validateCoupon } from "@/lib/services/pricing";
import type { Prisma } from "@prisma/client";

export interface CheckoutInput {
  userId: string;
  addressId: string;
  couponCode?: string;
  idempotencyKey: string;
}

export interface CheckoutResult {
  orderNumber: string;
  replayed: boolean;
}

const MAX_QTY_PER_LINE = 10;

/**
 * Create an order from the user's cart inside a single database transaction.
 * - Re-validates stock and recomputes all amounts server-side.
 * - Atomically decrements stock (race-safe conditional updates).
 * - Idempotent: repeated submissions with the same key return the same order.
 */
export async function createOrderFromCart(input: CheckoutInput): Promise<CheckoutResult> {
  const existing = await db.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { orderNumber: true },
  });
  if (existing) return { orderNumber: existing.orderNumber, replayed: true };

  const cart = await db.cart.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });
  if (!cart) throw new HttpError("EMPTY_CART", "Your cart is empty.", 422);

  const view = await getCartView(cart.id);
  if (view.items.length === 0) {
    throw new HttpError("EMPTY_CART", "Your cart is empty.", 422);
  }

  for (const line of view.items) {
    if (line.quantity > line.stock) {
      throw new HttpError(
        "OUT_OF_STOCK",
        `Only ${line.stock} left of ${line.productName} (${line.variantName}). Please update your cart.`,
        422
      );
    }
    if (line.quantity < 1 || line.quantity > MAX_QTY_PER_LINE) {
      throw new HttpError("BAD_QUANTITY", `Invalid quantity for ${line.productName}.`, 422);
    }
  }

  const address = await db.address.findFirst({
    where: { id: input.addressId, userId: input.userId },
  });
  if (!address) {
    throw new HttpError("ADDRESS_NOT_FOUND", "Selected delivery address was not found.", 422);
  }

  // Totals — computed entirely server-side
  const subtotal = view.subtotal;
  let discountTotal = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const result = await validateCoupon(input.couponCode, subtotal, input.userId);
    discountTotal = result.discount;
    couponId = result.coupon.id;
    couponCode = result.coupon.code;
  }
  const rate = await getActiveShippingRate();
  const shippingFee = computeShipping(
    rate ? { baseFee: rate.baseFee, freeAbove: rate.freeAbove } : null,
    d(subtotal).minus(discountTotal).toNumber()
  );
  const grandTotal = money(d(subtotal).minus(discountTotal).plus(shippingFee));

  const orderNumber = generateOrderNumber();

  try {
    await db.$transaction(
      async (tx) => {
        // Conditional stock decrement — race-safe
        for (const line of view.items) {
          const updated = await tx.productVariant.updateMany({
            where: { id: line.variantId, stock: { gte: line.quantity }, isActive: true },
            data: { stock: { decrement: line.quantity } },
          });
          if (updated.count !== 1) {
            throw new HttpError(
              "OUT_OF_STOCK",
              `${line.productName} (${line.variantName}) just went out of stock. Please review your cart.`,
              409
            );
          }
        }

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: input.userId,
            status: "PENDING",
            paymentStatus: "PENDING",
            paymentMethod: "PAY_ON_CONFIRMATION",
            subtotal,
            discountTotal,
            shippingFee,
            grandTotal,
            couponCode,
            idempotencyKey: input.idempotencyKey,
            shipName: address.fullName,
            shipPhone: address.phone,
            shipLine1: address.line1,
            shipLine2: address.line2,
            shipCity: address.city,
            shipState: address.state,
            shipPincode: address.pincode,
            shipCountry: address.country,
            items: {
              create: view.items.map((line) => ({
                productId: line.productId,
                variantId: line.variantId,
                productName: line.productName,
                variantName: line.variantName,
                sku: line.sku,
                imageUrl: line.imageUrl,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                lineTotal: line.lineTotal,
              })),
            },
            payments: {
              create: {
                method: "PAY_ON_CONFIRMATION",
                status: "PENDING",
                amount: grandTotal,
              },
            },
            events: {
              create: {
                status: "PENDING",
                note: "Order placed. Awaiting confirmation.",
              },
            },
          },
        });

        // Stock movement history
        for (const line of view.items) {
          await tx.stockMovement.create({
            data: {
              variantId: line.variantId,
              delta: -line.quantity,
              reason: "ORDER_COMMIT",
              reference: order.orderNumber,
            },
          });
        }

        if (couponId) {
          await tx.coupon.update({
            where: { id: couponId },
            data: { timesUsed: { increment: 1 } },
          });
          await tx.couponRedemption.create({
            data: {
              couponId,
              orderId: order.id,
              userId: input.userId,
              amount: discountTotal,
            },
          });
        }

        // Clear cart
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      },
      { timeout: 15000 }
    );
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Unique violation on idempotencyKey => concurrent duplicate; fetch winner
    const winner = await db.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { orderNumber: true },
    });
    if (winner) return { orderNumber: winner.orderNumber, replayed: true };
    throw err;
  }

  return { orderNumber, replayed: false };
}

/** Allowed order status transitions (state machine enforced server-side). */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export async function transitionOrderStatus(
  orderId: string,
  nextStatus: string,
  opts: { actorId: string; note?: string; carrier?: string; trackingNumber?: string }
) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError("NOT_FOUND", "Order not found.", 404);

  const allowed = STATUS_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new HttpError(
      "INVALID_TRANSITION",
      `Cannot move order from ${order.status} to ${nextStatus}.`,
      422
    );
  }

  const wasCancel = nextStatus === "CANCELLED";

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: nextStatus as never,
        cancelledReason: wasCancel ? (opts.note ?? "Cancelled by store") : null,
      },
    });
    await tx.orderStatusEvent.create({
      data: { orderId, status: nextStatus as never, note: opts.note },
    });

    if (nextStatus === "SHIPPED") {
      await tx.shipment.upsert({
        where: { orderId },
        update: {
          status: "SHIPPED",
          carrier: opts.carrier,
          trackingNumber: opts.trackingNumber,
          shippedAt: new Date(),
        },
        create: {
          orderId,
          status: "SHIPPED",
          carrier: opts.carrier,
          trackingNumber: opts.trackingNumber,
          shippedAt: new Date(),
        },
      });
    }
    if (nextStatus === "DELIVERED") {
      await tx.shipment.updateMany({
        where: { orderId },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
    }

    // Restock on cancellation
    if (wasCancel) {
      const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } } });
      for (const item of items) {
        if (!item.variantId) continue;
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            variantId: item.variantId,
            delta: item.quantity,
            reason: "ORDER_RELEASE",
            reference: order.orderNumber,
            createdById: opts.actorId,
          },
        });
      }
    }
  });

  return { orderNumber: order.orderNumber, status: nextStatus };
}
