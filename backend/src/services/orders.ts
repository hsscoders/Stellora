import { db, newId } from "../lib/db";
import { HttpError } from "../lib/http-errors";
import { d, money } from "../lib/money";
import { generateOrderNumber } from "../lib/utils";
import { getCartView, type CartView } from "./cart";
import { getActiveShippingRate, computeShipping, validateCoupon } from "./pricing";
import { MIN_REDEEM, maxRedeemable, settleOnCancel, accrueEarn } from "./loyalty";
import {
  notifyNewOrder,
  notifyOrderStatus,
  notifyLowStock,
  notifyStockUpdate,
  type NewOrderPayload,
} from "./realtime";

export interface CheckoutInput {
  userId: string;
  addressId: string;
  couponCode?: string;
  idempotencyKey: string;
  paymentMethod?: "PAY_ON_CONFIRMATION" | "GATEWAY";
  redeemPoints?: boolean;
}

export interface CheckoutResult {
  orderNumber: string;
  replayed: boolean;
}

const MAX_QTY_PER_LINE = 10;

/**
 * Create an order from the user's cart inside a single MySQL transaction.
 * - Re-validates stock and recomputes all amounts server-side.
 * - Atomically decrements variant stock (race-safe conditional updates).
 * - Idempotent: repeated submissions with the same key return the same order.
 */
export async function createOrderFromCart(input: CheckoutInput): Promise<CheckoutResult> {
  const existing = await db.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { orderNumber: true },
  });
  if (existing) return { orderNumber: existing.orderNumber, replayed: true };

  const cart = await db.cart.findFirst({ where: { userId: input.userId }, select: { id: true } });
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

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { addresses: true },
  });
  const address = user?.addresses?.find((a) => a.id === input.addressId);
  if (!address) {
    throw new HttpError("ADDRESS_NOT_FOUND", "Selected delivery address was not found.", 422);
  }

  // Totals — computed entirely server-side
  const subtotal = view.subtotal;
  let discountTotal = 0;
  let couponDiscount = 0; // coupon's own share (redemption bookkeeping excludes loyalty points)
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const result = await validateCoupon(input.couponCode, subtotal, input.userId);
    couponDiscount = result.discount;
    discountTotal = result.discount;
    couponId = result.coupon.id;
    couponCode = result.coupon.code;
  }

  // Stellora Rewards redemption — decided entirely server-side from the live
  // balance, capped at 30% of the coupon-discounted subtotal, min 100 points.
  let pointsRedeemed = 0;
  if (input.redeemPoints) {
    const bal = await db.user.findUnique({
      where: { id: input.userId },
      select: { loyaltyPoints: true },
    });
    const balance = Math.max(0, bal?.loyaltyPoints ?? 0);
    const cap = maxRedeemable(d(subtotal).minus(discountTotal).toNumber());
    const redeem = Math.min(balance, cap);
    if (redeem >= MIN_REDEEM) pointsRedeemed = redeem; // silently skipped when too small
  }
  discountTotal = money(d(discountTotal).plus(pointsRedeemed));

  const rate = await getActiveShippingRate();
  const shippingFee = computeShipping(
    rate ? { baseFee: rate.baseFee, freeAbove: rate.freeAbove } : null,
    d(subtotal).minus(discountTotal).toNumber()
  );
  const grandTotal = money(d(subtotal).minus(discountTotal).plus(shippingFee));

  const orderNumber = generateOrderNumber();
  const orderId = newId();

  try {
    await db.$transaction(
      async (tx) => {
        // Conditional stock decrement — race-safe (UPDATE ... WHERE stock >= qty)
        for (const line of view.items) {
          const updated = await tx.productVariant.updateMany({
            where: {
              id: line.variantId,
              productId: line.productId,
              isActive: true,
              stock: { gte: line.quantity },
            },
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

        // Conditional points spend — race-safe against concurrent checkouts
        if (pointsRedeemed > 0) {
          const spent = await tx.user.updateMany({
            where: { id: input.userId, loyaltyPoints: { gte: pointsRedeemed } },
            data: { loyaltyPoints: { decrement: pointsRedeemed } },
          });
          if (spent.count !== 1) {
            throw new HttpError(
              "NOT_ENOUGH_POINTS",
              "Your rewards balance changed. Please review your points selection.",
              409
            );
          }
        }

        await tx.order.create({
          data: {
            id: orderId,
            orderNumber,
            userId: input.userId,
            status: "PENDING",
            paymentStatus: "PENDING",
            paymentMethod: input.paymentMethod ?? "PAY_ON_CONFIRMATION",
            subtotal,
            discountTotal,
            shippingFee,
            grandTotal,
            couponCode,
            pointsRedeemed,
            idempotencyKey: input.idempotencyKey,
            shipName: address.fullName,
            shipPhone: address.phone,
            shipLine1: address.line1,
            shipLine2: address.line2 ?? null,
            shipCity: address.city,
            shipState: address.state,
            shipPincode: address.pincode,
            shipCountry: address.country ?? "India",
            items: {
              create: view.items.map((line) => ({
                id: newId(),
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
            payment: {
              create: {
                id: newId(),
                method: input.paymentMethod ?? "PAY_ON_CONFIRMATION",
                status: "PENDING",
                amount: grandTotal,
              },
            },
            events: {
              create: [
                {
                  id: newId(),
                  status: "PENDING",
                  note: "Order placed. Awaiting confirmation.",
                },
              ],
            },
          },
        });

        // Stock movement history
        for (const line of view.items) {
          await tx.stockMovement.create({
            data: {
              id: newId(),
              variantId: line.variantId,
              delta: -line.quantity,
              reason: "ORDER_COMMIT",
              reference: orderNumber,
            },
          });
        }

        if (couponId) {
          await tx.coupon.update({
            where: { id: couponId },
            data: { timesUsed: { increment: 1 } },
          });
          // Redemption amount = the COUPON's share only (loyalty points are
          // recorded separately in the loyalty ledger)
          await tx.couponRedemption.create({
            data: {
              id: newId(),
              couponId,
              orderId,
              userId: input.userId,
              amount: couponDiscount,
            },
          });
        }

        // Loyalty ledger entry for the redeemed points (audit trail)
        if (pointsRedeemed > 0) {
          await tx.loyaltyLedger.create({
            data: {
              id: newId(),
              userId: input.userId,
              orderId,
              delta: -pointsRedeemed,
              reason: "REDEEM",
              note: `Redeemed at checkout on ${orderNumber}`,
            },
          });
        }

        // Clear cart
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      },
      { timeout: 15_000, isolationLevel: "RepeatableRead" }
    );
  } catch (err: unknown) {
    if (err instanceof HttpError) throw err;
    // Unique violation on idempotencyKey => concurrent duplicate; fetch winner
    const winner = await db.order
      .findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { orderNumber: true },
      })
      .catch(() => null);
    if (winner) return { orderNumber: winner.orderNumber, replayed: true };
    throw err;
  }

  // Realtime fan-out AFTER the transaction commits — never blocks checkout.
  // (Replays always returned early above, so reaching this line = fresh order.)
  void broadcastNewOrder(orderNumber, input.userId);

  return { orderNumber, replayed: false };
}

/**
 * Fire-and-forget realtime broadcast for a fresh order:
 *  - admins: instant "New order" toast + bell + live stats
 *  - everyone: fresh stock ticks for the purchased variants (open product
 *    pages update their "only X left" counter without a reload)
 *  - admins: low-stock / sold-out alert when a variant crosses its threshold
 */
async function broadcastNewOrder(orderNumber: string, userId: string): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        grandTotal: true,
        paymentMethod: true,
        shipCity: true,
        shipName: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        items: { select: { productName: true, variantName: true, quantity: true, variantId: true } },
      },
    });
    if (!order) return;

    const items = (order.items ?? []).map((i) => ({
      productName: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
    }));

    const payload: NewOrderPayload = {
      orderNumber,
      orderId: order.id,
      grandTotal: Number(order.grandTotal),
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      items,
      customerName: order.user?.name ?? order.shipName ?? null,
      customerEmail: order.user?.email ?? null,
      paymentMethod: order.paymentMethod,
      city: order.shipCity ?? null,
      at: (order.createdAt ?? new Date()).toISOString(),
    };
    notifyNewOrder(payload);

    // Stock ticks + low-stock detection in one variant query.
    const variantIds = (order.items ?? [])
      .map((i) => i.variantId)
      .filter((v): v is string => !!v);
    if (variantIds.length > 0) {
      const variants = await db.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          name: true,
          sku: true,
          stock: true,
          lowStockThreshold: true,
          isActive: true,
          product: { select: { id: true, name: true, slug: true } },
        },
      });
      const ticks: { productId: string; variantId: string; stock: number }[] = [];
      const low: {
        productName: string;
        variantName: string;
        sku: string;
        stock: number;
        threshold: number;
        slug: string;
      }[] = [];
      for (const v of variants) {
        ticks.push({ productId: v.product.id, variantId: v.id, stock: v.stock });
        if (v.stock <= v.lowStockThreshold) {
          low.push({
            productName: v.product.name,
            variantName: v.name,
            sku: v.sku,
            stock: v.stock,
            threshold: v.lowStockThreshold,
            slug: v.product.slug,
          });
        }
      }
      notifyStockUpdate(ticks);
      notifyLowStock(low);
    }
  } catch (err) {
    // Realtime is best-effort — a broadcast failure must never break checkout.
    console.error("[realtime] new-order broadcast failed:", err);
  }
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
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      userId: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });
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
  const now = new Date();

  await db.$transaction(
    async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: nextStatus as never,
          cancelledReason: wasCancel ? (opts.note ?? "Cancelled by store") : null,
          events: {
            create: [{ id: newId(), status: nextStatus as never, note: opts.note ?? null }],
          },
        },
      });

      if (nextStatus === "SHIPPED") {
        // Upsert the 1:1 shipment row (previously embedded `shipment` doc).
        await tx.orderShipment.upsert({
          where: { orderId },
          create: {
            id: newId(),
            orderId,
            status: "SHIPPED",
            carrier: opts.carrier ?? null,
            trackingNumber: opts.trackingNumber ?? null,
            shippedAt: now,
            deliveredAt: null,
          },
          update: {
            status: "SHIPPED",
            carrier: opts.carrier ?? null,
            trackingNumber: opts.trackingNumber ?? null,
            shippedAt: now,
            deliveredAt: null,
          },
        });
      }
      if (nextStatus === "DELIVERED") {
        await tx.orderShipment.upsert({
          where: { orderId },
          create: {
            id: newId(),
            orderId,
            status: "DELIVERED",
            shippedAt: null,
            deliveredAt: now,
          },
          update: { status: "DELIVERED", deliveredAt: now },
        });
      }

      // Restock on cancellation
      if (wasCancel) {
        for (const item of order.items) {
          if (!item.variantId) continue;
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              id: newId(),
              variantId: item.variantId,
              delta: item.quantity,
              reason: "ORDER_RELEASE",
              reference: order.orderNumber,
              createdById: opts.actorId,
            },
          });
        }
      }
    },
    { timeout: 15_000, isolationLevel: "RepeatableRead" }
  );

  // Loyalty settlement AFTER the transaction commits — ledger-guarded and
  // idempotent, so a crash here can be safely retried.
  if (wasCancel) {
    await settleOnCancel(orderId);
  }
  if (nextStatus === "CONFIRMED") {
    await accrueEarn(orderId, "Order confirmed by store");
  }

  // Realtime: customer's open order pages update instantly; admin order
  // tables/boards refresh without polling.
  try {
    notifyOrderStatus({
      orderNumber: order.orderNumber,
      userId: order.userId ?? "",
      status: nextStatus,
      note: opts.note ?? null,
    });
  } catch {
    // best-effort
  }

  return { orderNumber: order.orderNumber, status: nextStatus };
}

export type { CartView };
