/**
 * One-off: seed Stellora Rewards points for the demo customer so the
 * checkout redemption flow can be verified end-to-end.
 */
import mongoose from "mongoose";
import { readFileSync } from "node:fs";

const envFile = readFileSync(new URL("../.env", import.meta.url), "utf8");
const uri = envFile.match(/^MONGODB_URI="?(.+?)"?$/m)?.[1];
if (!uri) throw new Error("MONGODB_URI not found in backend/.env");

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });

const users = mongoose.connection.collection("users");
const ledger = mongoose.connection.collection("loyaltyledger");

const user = await users.findOne({ email: "customer@stellora.local" });
if (!user) {
  console.log("customer@stellora.local not found");
  process.exit(1);
}

const GRANT = 500;
await users.updateOne({ _id: user._id }, { $set: { loyaltyPoints: GRANT } });
await ledger.insertOne({
  userId: user._id,
  orderId: null,
  delta: GRANT,
  reason: "ADJUST",
  note: "Welcome bonus — demo seeding",
  createdAt: new Date(),
});

console.log(`Seeded ${GRANT} points for ${user.email}`);
await mongoose.disconnect();
