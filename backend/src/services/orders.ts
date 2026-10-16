import mongoose from "mongoose";
import { Order, Product, StockMovement, Coupon, User, Cart, LoyaltyLedger } from "../models";
import { HttpError } from "../lib/http";
import { d, money } from "../lib/money";
import { generateOrderNumber } from "../lib/utils";
import { getCartView, type CartView } from "./cart";
import { getActiveShippingRate, computeShipping, validateCoupon } from "./pricing";
import { MIN_REDEEM, maxRedeemable, settleOnCancel, accrueEarn } from "./loyalty";

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
 * Create an order from the user's cart inside a single MongoDB transaction.
 * - Re-validates stock and recomputes all amounts server-side.
 * - Atomically decrements embedded variant stock (race-safe conditional updates).
 * - Idempotent: repeated submissions with the same key return the same order.
 */
export async function createOrderFromCart(input: CheckoutInput): Promise<CheckoutResult> {
  const existing = await Order.findOne({ idempotencyKey: input.idempotencyKey })
    .select("orderNumber")
    .lean<{ orderNumber: string }>();
  if (existing) return { orderNumber: existing.orderNumber, replayed: true };

  const cart = await Cart.findOne({ userId: input.userId }).select("_id").lean<{ _id: any }>();
  if (!cart) throw new HttpError("EMPTY_CART", "Your cart is empty.", 422);

  const view = await getCartView(String(cart._id));
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

  const user = await User.findById(input.userId).select("addresses").lean<{
    addresses: {
      _id: any;
      fullName: string;
      phone: string;
      line1: string;
      line2?: string | null;
      city: string;
      state: string;
      pincode: string;
      country: string;
    }[];
  }>();
  const address = user?.addresses?.find((a) => String(a._id) === input.addressId);
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

  // Stellora Rewards redemption — decided entirely server-side from the live
  // balance, capped at 30% of the coupon-discounted subtotal, min 100 points.
  let pointsRedeemed = 0;
  if (input.redeemPoints) {
    const bal = await User.findById(input.userId)
      .select("loyaltyPoints")
      .lean<{ loyaltyPoints?: number } | null>();
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

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(
      async () => {
        // Conditional stock decrement on embedded variants — race-safe
        for (const line of view.items) {
          const updated = await Product.updateOne(
            {
              _id: line.productId,
              status: "ACTIVE",
              variants: {
                $elemMatch: { _id: line.variantId, stock: { $gte: line.quantity }, isActive: true },
              },
            },
            { $inc: { "variants.$[v].stock": -line.quantity } },
            { arrayFilters: [{ "v._id": line.variantId }], session }
          );
          if (updated.modifiedCount !== 1) {
            throw new HttpError(
              "OUT_OF_STOCK",
              `${line.productName} (${line.variantName}) just went out of stock. Please review your cart.`,
              409
            );
          }
        }

        // Conditional points spend — race-safe against concurrent checkouts
        if (pointsRedeemed > 0) {
          const spent = await User.updateOne(
            { _id: input.userId, loyaltyPoints: { $gte: pointsRedeemed } },
            { $inc: { loyaltyPoints: -pointsRedeemed } },
            { session }
          );
          if (spent.modifiedCount !== 1) {
            throw new HttpError(
              "NOT_ENOUGH_POINTS",
              "Your rewards balance changed. Please review your points selection.",
              409
            );
          }
        }

        const [createdOrder] = await Order.create(
          [
            {
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
              items: view.items.map((line) => ({
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
              payment: {
                method: input.paymentMethod ?? "PAY_ON_CONFIRMATION",
                status: "PENDING",
                amount: grandTotal,
              },
              events: [
                {
                  status: "PENDING",
                  note: "Order placed. Awaiting confirmation.",
                },
              ],
            },
          ],
          { session }
        );

        // Stock movement history
        for (const line of view.items) {
          await StockMovement.create(
            [
              {
                variantId: line.variantId,
                delta: -line.quantity,
                reason: "ORDER_COMMIT",
                reference: orderNumber,
              },
            ],
            { session }
          );
        }

        if (couponId) {
          await Coupon.updateOne({ _id: couponId }, { $inc: { timesUsed: 1 } }, { session });
          await Coupon.updateOne(
            { _id: couponId },
            { $push: { redemptions: { orderId: createdOrder._id, userId: input.userId, amount: discountTotal } } },
            { session }
          );
        }

        // Loyalty ledger entry for the redeemed points (audit trail)
        if (pointsRedeemed > 0) {
          await LoyaltyLedger.create(
            [
              {
                userId: input.userId,
                orderId: createdOrder._id,
                delta: -pointsRedeemed,
                reason: "REDEEM",
                note: `Redeemed at checkout on ${orderNumber}`,
              },
            ],
            { session }
          );
        }

        // Clear cart
        await Cart.updateOne({ _id: cart._id }, { $set: { items: [] } }, { session });
      },
      { readPreference: "primary", writeConcern: { w: "majority" } }
    );
  } catch (err: unknown) {
    if (err instanceof HttpError) throw err;
    // Unique violation on idempotencyKey => concurrent duplicate; fetch winner
    const winner = await Order.findOne({ idempotencyKey: input.idempotencyKey })
      .select("orderNumber")
      .lean<{ orderNumber: string }>();
    if (winner) return { orderNumber: winner.orderNumber, replayed: true };
    throw err;
  } finally {
    await session.endSession();
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
  const order = await Order.findById(orderId).lean<{
    _id: any;
    orderNumber: string;
    status: string;
    items: { variantId?: string | null; quantity: number }[];
  }>();
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

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            status: nextStatus,
            cancelledReason: wasCancel ? (opts.note ?? "Cancelled by store") : null,
          },
          $push: {
            events: { status: nextStatus, note: opts.note ?? null },
          },
        },
        { session }
      );

      if (nextStatus === "SHIPPED") {
        await Order.updateOne(
          { _id: orderId },
          {
            $set: {
              "shipment.status": "SHIPPED",
              "shipment.carrier": opts.carrier ?? null,
              "shipment.trackingNumber": opts.trackingNumber ?? null,
              "shipment.shippedAt": now,
            },
          },
          { session }
        );
      }
      if (nextStatus === "DELIVERED") {
        await Order.updateOne(
          { _id: orderId },
          { $set: { "shipment.status": "DELIVERED", "shipment.deliveredAt": now } },
          { session }
        );
      }

      // Restock on cancellation
      if (wasCancel) {
        for (const item of order.items) {
          if (!item.variantId) continue;
          await Product.updateOne(
            { "variants._id": item.variantId },
            { $inc: { "variants.$[v].stock": item.quantity } },
            { arrayFilters: [{ "v._id": item.variantId }], session }
          );
          await StockMovement.create(
            [
              {
                variantId: item.variantId,
                delta: item.quantity,
                reason: "ORDER_RELEASE",
                reference: order.orderNumber,
                createdById: opts.actorId,
              },
            ],
            { session }
          );
        }
      }
    });

    // Loyalty settlement AFTER the transaction commits — ledger-guarded and
    // idempotent, so a crash here can be safely retried.
    if (wasCancel) {
      await settleOnCancel(orderId);
    }
    if (nextStatus === "CONFIRMED") {
      await accrueEarn(orderId, "Order confirmed by store");
    }
  } finally {
    await session.endSession();
  }

  return { orderNumber: order.orderNumber, status: nextStatus };
}

export type { CartView };
