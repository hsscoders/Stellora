import { db, newId } from "../lib/db";
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
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, status: true, grandTotal: true, pointsEarned: true },
  });
  if (!order) return { earned: 0, alreadyCredited: false };

  const already = await db.loyaltyLedger.findFirst({
    where: { orderId: order.id, reason: "EARN" },
    select: { id: true },
  });
  if (already) return { earned: order.pointsEarned ?? 0, alreadyCredited: true };

  const earned = computeEarn(Number(order.grandTotal));
  if (earned <= 0) return { earned: 0, alreadyCredited: false };

  await db.loyaltyLedger.create({
    data: {
      id: newId(),
      userId: order.userId,
      orderId: order.id,
      delta: earned,
      reason: "EARN",
      note: actorNote ?? `Points earned on ${order.status.toLowerCase()} order`,
    },
  });
  await db.user.update({
    where: { id: order.userId },
    data: { loyaltyPoints: { increment: earned } },
  });
  await db.order.update({
    where: { id: order.id },
    data: { pointsEarned: earned },
  });

  return { earned, alreadyCredited: false };
}

/** Keep the fast counter honest — never allow it to dip below zero. */
async function clampBalance(userId: string): Promise<void> {
  await db.user.updateMany({
    where: { id: userId, loyaltyPoints: { lt: 0 } },
    data: { loyaltyPoints: 0 },
  });
}

/**
 * Cancel-time settlement: refund redeemed points and reverse earned points,
 * each guarded by a ledger check so retries (or double cancels) are no-ops.
 */
export async function settleOnCancel(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, pointsRedeemed: true, pointsEarned: true },
  });
  if (!order) return;
  const userId = order.userId;

  if ((order.pointsRedeemed ?? 0) > 0) {
    const refunded = await db.loyaltyLedger.findFirst({
      where: { orderId: order.id, reason: "REFUND_REDEEM" },
      select: { id: true },
    });
    if (!refunded) {
      await db.loyaltyLedger.create({
        data: {
          id: newId(),
          userId,
          orderId: order.id,
          delta: order.pointsRedeemed,
          reason: "REFUND_REDEEM",
          note: "Points refunded — order cancelled",
        },
      });
      await db.user.update({
        where: { id: userId },
        data: { loyaltyPoints: { increment: order.pointsRedeemed } },
      });
    }
  }

  if ((order.pointsEarned ?? 0) > 0) {
    const reversed = await db.loyaltyLedger.findFirst({
      where: { orderId: order.id, reason: "REFUND_EARN" },
      select: { id: true },
    });
    if (!reversed) {
      await db.loyaltyLedger.create({
        data: {
          id: newId(),
          userId,
          orderId: order.id,
          delta: -order.pointsEarned,
          reason: "REFUND_EARN",
          note: "Earned points reversed — order cancelled",
        },
      });
      await db.user.update({
        where: { id: userId },
        data: { loyaltyPoints: { decrement: order.pointsEarned } },
      });
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
    db.user.findUnique({ where: { id: userId }, select: { loyaltyPoints: true } }),
    db.loyaltyLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  // Resolve order numbers for entries that reference an order (ledger rows
  // store a plain orderId column — no relation needed for this read path).
  const orderIds = [...new Set(entries.map((e) => e.orderId).filter((v): v is string => !!v))];
  const orders = orderIds.length
    ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true } })
    : [];
  const orderNumberById = new Map(orders.map((o) => [o.id, o.orderNumber]));

  return {
    points: Math.max(0, user?.loyaltyPoints ?? 0),
    pointValue: POINT_VALUE,
    minRedeem: MIN_REDEEM,
    maxRedeemPct: MAX_REDEEM_PCT,
    earnRate: "1 point per ₹100 spent",
    history: entries.map((e) => ({
      id: e.id,
      delta: e.delta,
      reason: e.reason,
      note: e.note ?? null,
      orderNumber: e.orderId ? orderNumberById.get(e.orderId) ?? null : null,
      at: e.createdAt.toISOString(),
    })),
  };
}
