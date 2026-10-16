import mongoose from "mongoose";
import { Order, Product, StockMovement, RestockAlert, SiteSetting } from "../models";
import { audit } from "./audit";

/**
 * Stellora Auto-pilot — the store's unattended automation engine.
 *
 * Two recurring sweeps run inside the API process (single-node deployment,
 * PM2 keeps it alive):
 *
 *  1. staleOrders   — PENDING online orders that never got confirmed within the
 *                     configured window are auto-cancelled and their stock is
 *                     released back to inventory (with ledger + order event).
 *  2. restockAlerts — customers who asked to be told "back in stock" are marked
 *                     notified automatically as soon as the product/variant has
 *                     stock again (replaces the old manual "mark notified" flow).
 *
 * Configuration lives in SiteSetting so admins can tune it from
 * Settings → Automation without a redeploy:
 *   automation.staleOrderHours  (number of hours, 1 – 720, default 24)
 *
 * Every job is guarded against overlap, never throws, and records a compact
 * in-memory run history surfaced to admins at GET /api/admin/automation.
 */

export type JobId = "staleOrders" | "restockAlerts";

export interface JobRun {
  at: string;
  durationMs: number;
  affected: number;
  ok: boolean;
  error?: string;
}

const DEFAULT_STALE_HOURS = 24;
const MIN_STALE_HOURS = 1;
const MAX_STALE_HOURS = 720;

/** How often each sweep runs. */
const INTERVALS: Record<JobId, number> = {
  staleOrders: 10 * 60 * 1000, // every 10 minutes
  restockAlerts: 5 * 60 * 1000, // every 5 minutes
};

/** First sweep shortly after boot so the store self-heals from downtime. */
const FIRST_RUN_DELAY = 15_000;

const JOB_LABELS: Record<JobId, string> = {
  staleOrders: "Stale order auto-cancel",
  restockAlerts: "Back-in-stock auto-notify",
};

const state: Record<JobId, { running: boolean; lastRun: JobRun | null; totalProcessed: number }> = {
  staleOrders: { running: false, lastRun: null, totalProcessed: 0 },
  restockAlerts: { running: false, lastRun: null, totalProcessed: 0 },
};

const timers: Partial<Record<JobId, ReturnType<typeof setInterval>>> = {};

/* ---------------- Configuration ---------------- */

export async function getAutomationConfig(): Promise<{ staleOrderHours: number }> {
  try {
    const row = await SiteSetting.findOne({ key: "automation.staleOrderHours" })
      .lean<{ value: string } | null>();
    const parsed = Number(row?.value);
    if (Number.isFinite(parsed)) {
      return { staleOrderHours: Math.min(MAX_STALE_HOURS, Math.max(MIN_STALE_HOURS, parsed)) };
    }
  } catch {
    // fall through to default
  }
  return { staleOrderHours: DEFAULT_STALE_HOURS };
}

/* ---------------- Job: stale PENDING order auto-cancel ---------------- */

export interface StaleSweepResult {
  checked: number;
  cancelled: { orderNumber: string; units: number }[];
}

export async function runStaleOrdersSweep(): Promise<StaleSweepResult> {
  const { staleOrderHours } = await getAutomationConfig();
  const cutoff = new Date(Date.now() - staleOrderHours * 60 * 60 * 1000);

  const stale = await Order.find({ status: "PENDING", createdAt: { $lt: cutoff } })
    .select("_id orderNumber items createdAt")
    .lean<{ _id: any; orderNumber: string; items: { variantId?: string | null; quantity: number }[] }[]>();

  if (stale.length === 0) return { checked: 0, cancelled: [] };

  const cancelled: { orderNumber: string; units: number }[] = [];
  const note = `Auto-cancelled — payment not confirmed within ${staleOrderHours}h (Stellora Auto-pilot).`;

  for (const order of stale) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Re-check status inside the transaction — an admin may have confirmed
        // it while the sweep was running.
        const stillPending = await Order.updateOne(
          { _id: order._id, status: "PENDING" },
          {
            $set: {
              status: "CANCELLED",
              cancelledReason: note,
            },
            $push: { events: { status: "CANCELLED", note } },
          },
          { session }
        );
        if (stillPending.modifiedCount !== 1) return;

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
                note: "Released by Stellora Auto-pilot (stale order)",
              },
            ],
            { session }
          );
        }
      });

      // Committed — record it (outside the transaction, best-effort).
      const units = order.items.reduce((n, i) => n + i.quantity, 0);
      cancelled.push({ orderNumber: order.orderNumber, units });
      await audit({
        actor: null,
        action: "automation.order.auto-cancelled",
        entityType: "Order",
        entityId: String(order._id),
        metadata: { orderNumber: order.orderNumber, units, staleOrderHours },
      });
    } catch (err) {
      console.error(`[auto-pilot] failed to cancel stale order ${order.orderNumber}:`, err);
    } finally {
      await session.endSession();
    }
  }

  return { checked: stale.length, cancelled };
}

/* ---------------- Job: back-in-stock alert auto-notify ---------------- */

export interface RestockSweepResult {
  checked: number;
  notified: { email: string; product: string }[];
}

export async function runRestockAlertsSweep(): Promise<RestockSweepResult> {
  const pending = await RestockAlert.find({ notifiedAt: null })
    .limit(200)
    .lean<{ _id: any; productId: any; variantId: any; email: string }[]>();

  if (pending.length === 0) return { checked: 0, notified: [] };

  // Resolve current stock for every referenced product in one query.
  const productIds = [...new Set(pending.map((a) => String(a.productId)))];
  const products = await Product.find({ _id: { $in: productIds } })
    .select("name status variants")
    .lean<{ _id: any; name: string; status: string; variants: { _id: any; stock: number; isActive: boolean }[] }[]>();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const notified: { email: string; product: string }[] = [];

  for (const alert of pending) {
    const product = productMap.get(String(alert.productId));
    if (!product || product.status !== "ACTIVE") continue;

    const stock = alert.variantId
      ? (product.variants.find((v) => String(v._id) === String(alert.variantId))?.stock ?? 0)
      : (product.variants.filter((v) => v.isActive).reduce((max, v) => Math.max(max, v.stock), 0));

    if (stock <= 0) continue;

    await RestockAlert.updateOne(
      { _id: alert._id, notifiedAt: null },
      { notifiedAt: new Date() }
    );
    notified.push({ email: alert.email, product: product.name });
  }

  if (notified.length > 0) {
    await audit({
      actor: null,
      action: "automation.restock.auto-notified",
      entityType: "RestockAlert",
      metadata: {
        count: notified.length,
        samples: notified.slice(0, 5).map((n) => `${n.email} → ${n.product}`),
      },
    });
  }

  return { checked: pending.length, notified };
}

/* ---------------- Runner plumbing ---------------- */

async function runJob(id: JobId): Promise<JobRun> {
  if (state[id].running) {
    return state[id].lastRun ?? { at: new Date().toISOString(), durationMs: 0, affected: 0, ok: false, error: "already running" };
  }
  state[id].running = true;
  const started = Date.now();
  try {
    let affected = 0;
    if (id === "staleOrders") {
      const res = await runStaleOrdersSweep();
      affected = res.cancelled.length;
    } else {
      const res = await runRestockAlertsSweep();
      affected = res.notified.length;
    }
    const run: JobRun = { at: new Date().toISOString(), durationMs: Date.now() - started, affected, ok: true };
    state[id].lastRun = run;
    state[id].totalProcessed += affected;
    if (affected > 0) {
      console.log(`[auto-pilot] ${JOB_LABELS[id]}: processed ${affected} item(s) in ${run.durationMs}ms`);
    }
    return run;
  } catch (err) {
    const run: JobRun = {
      at: new Date().toISOString(),
      durationMs: Date.now() - started,
      affected: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    state[id].lastRun = run;
    console.error(`[auto-pilot] ${JOB_LABELS[id]} failed:`, err);
    return run;
  } finally {
    state[id].running = false;
  }
}

export async function triggerJob(id: JobId): Promise<JobRun> {
  return runJob(id);
}

export function isJobId(value: unknown): value is JobId {
  return value === "staleOrders" || value === "restockAlerts";
}

export function schedulerSnapshot() {
  return {
    jobs: (Object.keys(JOB_LABELS) as JobId[]).map((id) => ({
      id,
      label: JOB_LABELS[id],
      intervalMinutes: INTERVALS[id] / 60_000,
      running: state[id].running,
      totalProcessed: state[id].totalProcessed,
      lastRun: state[id].lastRun,
    })),
  };
}

export function startScheduler(): void {
  (Object.keys(INTERVALS) as JobId[]).forEach((id) => {
    if (timers[id]) return;
    timers[id] = setInterval(() => {
      void runJob(id);
    }, INTERVALS[id]);
    // Kick off the first sweep shortly after boot (unref'd so it never
    // keeps the process alive on its own).
    setTimeout(() => {
      void runJob(id);
    }, FIRST_RUN_DELAY).unref();
    timers[id].unref?.();
  });
  console.log("[auto-pilot] scheduler started — staleOrders every 10min, restockAlerts every 5min");
}
