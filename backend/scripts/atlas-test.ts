/**
 * One-off MongoDB Atlas connectivity test.
 */
import mongoose from "mongoose";

const URI = process.env.MONGODB_URI ?? process.env.MONGODB_LOCAL_FALLBACK ?? "mongodb://127.0.0.1:27017/stellora";

async function main() {
  console.log("[atlas-test] connecting...");
  const t0 = Date.now();
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`[atlas-test] connected in ${Date.now() - t0}ms`);
  console.log("[atlas-test] host:", mongoose.connection.host);
  console.log("[atlas-test] db name:", mongoose.connection.name);

  // Round-trip write/read/delete to confirm write permissions
  const Probe = mongoose.model("connectivity_probe", new mongoose.Schema({ at: Date }, { collection: "connectivity_probe" }));
  const doc = await Probe.create({ at: new Date() });
  const found = await Probe.findById(doc._id).lean();
  console.log("[atlas-test] roundtrip:", found ? "OK" : "FAIL");
  await Probe.deleteOne({ _id: doc._id });
  console.log("[atlas-test] cleanup done");

  await mongoose.disconnect();
  console.log("[atlas-test] ALL GOOD");
}

main().catch((err) => {
  console.error("[atlas-test] FAILED:", err?.message ?? err);
  process.exit(1);
});
