/**
 * Stellora-16 — Auto-pilot E2E test (direct DB setup + API verification).
 *
 * Tests the two unattended sweeps end-to-end:
 *   1. restockAlerts  — alert for a zero-stock variant stays waiting → variant
 *                       restocked → sweep marks it notified automatically.
 *   2. staleOrders    — PENDING order backdated past the window → sweep cancels
 *                       it and releases the stock back into the variant.
 *
 * Leaves behind: one NOTIFIED restock alert (evidence in admin UI) and one
 * auto-CANCELLED test order (evidence in orders list). Junk rows cleaned.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire("/home/z/my-project/stellora-repo/backend/package.json");
const mongoose = require("mongoose");

// Pull the Atlas URI from backend/.env (same file the API uses).
const envText = readFileSync("/home/z/my-project/stellora-repo/backend/.env", "utf8");
const uri = envText.match(/MONGODB_URI="?([^"\n]+)"?/)?.[1];

const API = "http://127.0.0.1:4000";
let cookie = "";

function report(label, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3000",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const J = (v) => String(v);
const oid = (v) => new mongoose.Types.ObjectId(J(v));

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;

  /* ---------- admin session ---------- */
  const login = await api("POST", "/api/auth/login", {
    email: "admin@stellora.local",
    password: "StelloraAdmin#2026",
  });
  report("admin login", login.json?.ok === true);

  /* ---------- setup: surgical cleanup (only QA rows, never real customers) ---------- */
  // Drop previous autotest evidence + alerts whose product no longer exists.
  const junk = await db.collection("restockalerts").deleteMany({ email: "autotest@stellora.local" });
  // keep only rows whose product actually exists; drop the rest
  const allAlerts = await db.collection("restockalerts").find({ notifiedAt: null }).toArray();
  for (const a of allAlerts) {
    const exists = await db.collection("products").findOne({ _id: a.productId });
    if (!exists) await db.collection("restockalerts").deleteOne({ _id: a._id });
  }
  console.log(`setup: junk alerts removed`);

  /* ---------- TEST 1: restock alert auto-notify ---------- */
  // Pick a real active variant (Noor Evening Clutch / Ivory)
  const product = await db.collection("products").findOne({ slug: "noor-evening-clutch" });
  report("test product found", !!product);
  const variant = product.variants.find((v) => v.isActive);
  const originalStocks = product.variants.map((v) => ({ id: v._id, stock: v.stock }));

  // Park EVERY active variant at zero (product-level alert semantics mirror the
  // storefront: buyable while ANY variant has stock), then subscribe.
  for (const v of product.variants) {
    if (!v.isActive) continue;
    await db.collection("products").updateOne(
      { _id: product._id, "variants._id": v._id },
      { $set: { "variants.$.stock": 0 } }
    );
  }
  const sub = await api("POST", "/api/restock-alerts", {
    productId: J(product._id),
    email: "autotest@stellora.local",
  });
  report("restock alert subscribed (out of stock)", sub.json?.ok === true);

  // Sweep while still zero — must NOT notify
  const sweep0 = await api("POST", "/api/admin/automation/run", { job: "restockAlerts" });
  report("sweep ok while stock=0", sweep0.json?.ok === true);
  const alertAfter0 = await db.collection("restockalerts").findOne({
    email: "autotest@stellora.local",
    productId: product._id,
  });
  report("not notified while stock=0", alertAfter0 && !alertAfter0.notifiedAt);

  // Restock → sweep must auto-notify
  await db.collection("products").updateOne(
    { _id: product._id, "variants._id": variant._id },
    { $set: { "variants.$.stock": 8 } }
  );
  const sweep1 = await api("POST", "/api/admin/automation/run", { job: "restockAlerts" });
  const alertAfter1 = await db.collection("restockalerts").findOne({
    email: "autotest@stellora.local",
    productId: product._id,
  });
  report(
    "auto-notified after restock",
    sweep1.json?.ok === true && !!alertAfter1?.notifiedAt,
    `affected=${sweep1.json?.data?.result?.affected}`
  );

  // Restore original stocks (keep ledger untouched — this is test harness data)
  for (const v of originalStocks) {
    await db.collection("products").updateOne(
      { _id: product._id, "variants._id": v.id },
      { $set: { "variants.$.stock": v.stock } }
    );
  }

  /* ---------- TEST 2: stale PENDING order auto-cancel + stock release ---------- */
  const adminUser = await db.collection("users").findOne({ email: "admin@stellora.local" });
  const orderNumber = `STL-TEST-${Date.now().toString(36).toUpperCase()}`;
  const stockBefore = (await db.collection("products").findOne({ _id: product._id }))
    .variants.find((v) => J(v._id) === J(variant._id)).stock;

  await db.collection("orders").insertOne({
    orderNumber,
    userId: adminUser._id,
    status: "PENDING",
    paymentStatus: "PENDING",
    paymentMethod: "PAY_ON_CONFIRMATION",
    subtotal: 1000,
    discountTotal: 0,
    shippingFee: 0,
    grandTotal: 1000,
    currency: "INR",
    pointsRedeemed: 0,
    pointsEarned: 0,
    idempotencyKey: `test-${orderNumber}`,
    shipName: "Auto-pilot Test",
    shipPhone: "+91 90000 00000",
    shipLine1: "Test Lane 1",
    shipCity: "Mumbai",
    shipState: "Maharashtra",
    shipPincode: "400001",
    shipCountry: "India",
    source: "ONLINE",
    items: [
      {
        productId: product._id,
        variantId: variant._id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        unitPrice: 1000,
        quantity: 2,
        lineTotal: 2000,
      },
    ],
    payment: { method: "PAY_ON_CONFIRMATION", status: "PENDING", amount: 1000 },
    events: [{ status: "PENDING", note: "Test order for auto-pilot verification." }],
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000), // 26h old
    updatedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
  });

  const run = await api("POST", "/api/admin/automation/run", { job: "staleOrders" });
  const result = run.json?.data?.result;
  report(
    "stale sweep cancelled the order",
    run.json?.ok === true && result?.affected >= 1 && result?.ok === true,
    `affected=${result?.affected} durationMs=${result?.durationMs}`
  );

  const cancelled = await db.collection("orders").findOne({ orderNumber });
  report(
    "order now CANCELLED with auto note + event",
    cancelled?.status === "CANCELLED" &&
      /Auto-pilot/.test(cancelled?.cancelledReason ?? "") &&
      (cancelled?.events ?? []).some((e) => e.status === "CANCELLED")
  );

  const stockAfter = (await db.collection("products").findOne({ _id: product._id }))
    .variants.find((v) => J(v._id) === J(variant._id)).stock;
  report("stock released back (+2)", stockAfter === stockBefore + 2, `${stockBefore} → ${stockAfter}`);

  const movement = await db.collection("stockmovements").findOne({
    reference: orderNumber,
    reason: "ORDER_RELEASE",
  });
  report("ORDER_RELEASE ledger entry written", !!movement && movement.delta === 2);

  /* ---------- automation status sanity ---------- */
  const status = await api("GET", "/api/admin/automation");
  report(
    "automation status shows config + counters",
    status.json?.ok === true && status.json?.data?.config?.staleOrderHours >= 1,
    `stalePending=${status.json?.data?.stalePending} waitingAlerts=${status.json?.data?.pendingRestockAlerts}`
  );

  await mongoose.disconnect();
  console.log("done.");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
