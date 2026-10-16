/**
 * Stellora-16 post-test cleanup — removes auto-pilot QA artifacts so the live
 * store carries zero test clutter:
 *   - restock alerts for autotest@stellora.local
 *   - orders with orderNumber starting STL-TEST-
 *   - stock movements referencing those order numbers (ORDER_RELEASE evidence)
 *   - restores the Noor Evening Clutch variant stocks captured in originalStocks
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire("/home/z/my-project/stellora-repo/backend/package.json");
const mongoose = require("mongoose");

const envText = readFileSync("/home/z/my-project/stellora-repo/backend/.env", "utf8");
const uri = envText.match(/MONGODB_URI="?([^"\n]+)"?/)?.[1];

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;

// 1. QA restock alerts
const alerts = await db.collection("restockalerts").deleteMany({ email: "autotest@stellora.local" });
console.log(`restock alerts deleted: ${alerts.deletedCount}`);

// 2. QA test orders (both runs)
const testOrders = await db.collection("orders").find({ orderNumber: { $regex: /^STL-TEST-/ } }).toArray();
const refs = testOrders.map((o) => o.orderNumber);
console.log(`test orders found: ${refs.join(", ") || "(none)"}`);

// 3. Their ledger entries
if (refs.length > 0) {
  const moves = await db.collection("stockmovements").deleteMany({ reference: { $in: refs } });
  console.log(`stock movements deleted: ${moves.deletedCount}`);
  const orders = await db.collection("orders").deleteMany({ orderNumber: { $in: refs } });
  console.log(`test orders deleted: ${orders.deletedCount}`);
}

// 4. Restore the Noor Evening Clutch variant stocks to their true pre-test values.
//    Both runs inserted orders directly (no stock decrement) and the sweeps
//    released +2 per cancelled order — net +4 phantom units on the Ivory variant.
const product = await db.collection("products").findOne({ slug: "noor-evening-clutch" });
if (!product) {
  console.log("noor-evening-clutch not found — skip stock restore");
} else {
  // True original from the seeder: Ivory = 13. Recompute defensively: subtract
  // the phantom units only if current stock is above the original.
  const ORIGINAL = { Ivory: 13 };
  for (const v of product.variants) {
    const original = ORIGINAL[v.name];
    if (original == null) continue;
    if (v.stock > original) {
      await db.collection("products").updateOne(
        { _id: product._id, "variants._id": v._id },
        { $set: { "variants.$.stock": original } }
      );
      console.log(`variant ${v.name}: ${v.stock} -> ${original}`);
    } else {
      console.log(`variant ${v.name}: ${v.stock} (already at/below original)`);
    }
  }
}

await mongoose.disconnect();
console.log("cleanup done.");
