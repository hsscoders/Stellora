/**
 * Diagnostic: list users + collection stats in the Stellora Atlas DB.
 * Read-only — does not modify anything.
 */
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });

const db = mongoose.connection.db;
const collections = await db.listCollections().toArray();
console.log("Collections:", collections.map((c) => c.name).join(", "));

const users = await db.collection("users").find({}).toArray();
console.log(`\nUsers (${users.length}):`);
for (const u of users) {
  console.log(`  - ${u.email ?? "(no email)"} | role=${u.role} | name=${u.name} | created=${u.createdAt?.toISOString?.() ?? u.createdAt}`);
}

const counts = {};
for (const name of ["products", "categories", "coupons", "shippingrates", "siteSettings", "homepagebanners", "orders"]) {
  try {
    counts[name] = await db.collection(name).countDocuments();
  } catch {
    counts[name] = "n/a";
  }
}
console.log("\nCounts:", JSON.stringify(counts, null, 2));

await mongoose.disconnect();
