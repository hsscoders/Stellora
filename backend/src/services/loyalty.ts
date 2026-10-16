import mongoose from "mongoose";
import { LoyaltyLedger, Order, User } from "../models";
import { d, money } from "../lib/money";

/**
 * Stellora Rewards — loyalty points with a ledger-backed, idempotent design.
 *
 * Rules (all enforced server-side; the client only ever sends a boolean):
 *  - Earn: 1 point per full ₹100 of the order grand total, credited once when
 *    the order is CONFIRMED (gateway payment or admin confirmation). An order
 *    can never earn twice (unique ledger check).
 *  - Redeem: 1 point = ₹1. Only in multiples of the balance actually held,
 *    capped at MAX_REDEEM_PCT of the coupon-discounted subtotal and never
 *    below MIN_REDEEM points. The balance is decremented inside the checkout
 *    transaction with a conditional update, so concurrent checkouts cannot
 *    overspend.
 *  - Cancel: redeemed points are refunded and earned points are reversed
 *    (each exactly once, ledger-checked). A negative balance is clamped to 0
 *    — points already spent elsewhere are written off, never charged back.
 */

export const POINTS_PER_100 = 1;
export const POINT_VALUE = 1; // ₹ per point at redemption
export const MIN_REDEEM = 100;
export const MAX_REDEEM_PCT = 0.3;

export function computeEarn(grandTotal: number): number {
  return Math.floor(d(grandTotal).dividedBy(100).toNumber()) * POINTS_PER_100;
}

/** Max points redeemable for a given coupon-discounted subtotal. */
export function maxRedeemable(couponDiscountedSubtotal: number): number {
  return Math.floor(money(d(couponDiscountedSubtotal).times(MAX_REDEEM_PCT)));
}

/**
 * Credit earn points for a confirmed order. Idempotent: if an EARN ledger
 * entry already exists for this order, nothing happens. Safe to call from
 * both the payment-confirm path and the admin status-transition path.
 */
export async function accrueEarn(
  orderId: string,
  actorNote?: string
): Promise<{ earned: number; alreadyCredited: boolean }> {
  const order = await Order.findById(orderId)
    .select("_id userId status grandTotal pointsEarned")
    .lean<{ _id: any; userId: any; status: string; grandTotal: number; pointsEarned: number }>();
  if (!order) return { earned: 0, alreadyCredited: false };

  const already = await LoyaltyLedger.exists({
    orderId: order._id,
    reason: "EARN",
  });
  if (already) return { earned: order.pointsEarned ?? 0, alreadyCredited: true };

  const earned = computeEarn(order.grandTotal);
  if (earned <= 0) return { earned: 0, alreadyCredited: false };

  await LoyaltyLedger.create({
    userId: order.userId,
    orderId: order._id,
    delta: earned,
    reason: "EARN",
    note: actorNote ?? `Points earned on ${order.status.toLowerCase()} order`,
  });
  await User.updateOne({ _id: order.userId }, { $inc: { loyaltyPoints: earned } });
  await Order.updateOne({ _id: order._id }, { $set: { pointsEarned: earned } });

  return { earned, alreadyCredited: false };
}

/** Keep the fast counter honest — never allow it to dip below zero. */
async function clampBalance(userId: string): Promise<void> {
  await User.updateOne(
    { _id: userId, loyaltyPoints: { $lt: 0 } },
    { $set: { loyaltyPoints: 0 } }
  );
}

/**
 * Cancel-time settlement: refund redeemed points and reverse earned points,
 * each guarded by a ledger check so retries (or double cancels) are no-ops.
 */
export async function settleOnCancel(orderId: string): Promise<void> {
  const order = await Order.findById(orderId)
    .select("_id userId pointsRedeemed pointsEarned")
    .lean<{ _id: any; userId: any; pointsRedeemed: number; pointsEarned: number }>();
  if (!order) return;
  const userId = String(order.userId);

  if ((order.pointsRedeemed ?? 0) > 0) {
    const refunded = await LoyaltyLedger.exists({
      orderId: order._id,
      reason: "REFUND_REDEEM",
    });
    if (!refunded) {
      await LoyaltyLedger.create({
        userId: order.userId,
        orderId: order._id,
        delta: order.pointsRedeemed,
        reason: "REFUND_REDEEM",
        note: "Points refunded — order cancelled",
      });
      await User.updateOne(
        { _id: order.userId },
        { $inc: { loyaltyPoints: order.pointsRedeemed } }
      );
    }
  }

  if ((order.pointsEarned ?? 0) > 0) {
    const reversed = await LoyaltyLedger.exists({
      orderId: order._id,
      reason: "REFUND_EARN",
    });
    if (!reversed) {
      await LoyaltyLedger.create({
        userId: order.userId,
        orderId: order._id,
        delta: -order.pointsEarned,
        reason: "REFUND_EARN",
        note: "Earned points reversed — order cancelled",
      });
      await User.updateOne(
        { _id: order.userId },
        { $inc: { loyaltyPoints: -order.pointsEarned } }
      );
      await clampBalance(userId);
    }
  }
}

export type LoyaltySnapshot = {
  points: number;
  pointValue: number;
  minRedeem: number;
  maxRedeemPct: number;
  earnRate: string;
  history: {
    id: string;
    delta: number;
    reason: string;
    note: string | null;
    orderNumber: string | null;
    at: string;
  }[];
};

export async function getLoyaltySnapshot(userId: string): Promise<LoyaltySnapshot> {
  const [user, entries] = await Promise.all([
    User.findById(userId).select("loyaltyPoints").lean<{ loyaltyPoints?: number } | null>(),
    LoyaltyLedger.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("orderId", "orderNumber")
      .lean<any[]>(),
  ]);

  return {
    points: Math.max(0, user?.loyaltyPoints ?? 0),
    pointValue: POINT_VALUE,
    minRedeem: MIN_REDEEM,
    maxRedeemPct: MAX_REDEEM_PCT,
    earnRate: "1 point per ₹100 spent",
    history: entries.map((e) => ({
      id: String(e._id),
      delta: e.delta,
      reason: e.reason,
      note: e.note ?? null,
      orderNumber: e.orderId?.orderNumber ?? null,
      at: e.createdAt,
    })),
  };
}
