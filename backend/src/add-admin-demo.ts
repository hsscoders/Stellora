/**
 * Add/refresh the demo admin login (database insert — bypasses register-time
 * password complexity rules on purpose, temporary demo credential).
 *
 * Run: cd backend && bun src/add-admin-demo.ts
 *
 * Defaults: demo@gmail.com / 123456  (override via DEMO_ADMIN_EMAIL /
 * DEMO_ADMIN_PASSWORD env vars)
 */
import mongoose from "mongoose";
import { User } from "./models";
import { hashPassword } from "./lib/password";

const EMAIL = (process.env.DEMO_ADMIN_EMAIL || "demo@gmail.com").toLowerCase();
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "123456";

async function main() {
  const uri =
    process.env.MONGODB_URI ??
    process.env.MONGODB_LOCAL_FALLBACK ??
    "mongodb://127.0.0.1:27017/stellora";
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log("Connected to MongoDB.");

  const passwordHash = await hashPassword(PASSWORD);
  const existing = await User.findOne({ email: EMAIL });

  if (existing) {
    await User.updateOne(
      { _id: existing._id },
      { $set: { role: "ADMIN", passwordHash, isActive: true } }
    );
    console.log(`Updated existing user → ADMIN: ${EMAIL}`);
  } else {
    await User.create({
      email: EMAIL,
      passwordHash,
      name: "Demo Admin",
      role: "ADMIN",
      isActive: true,
    });
    console.log(`Created admin user: ${EMAIL}`);
  }

  const check = await User.findOne({ email: EMAIL }).select("email role name isActive");
  console.log("Verified:", JSON.stringify(check?.toJSON(), null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FAILED:", err?.message ?? err);
  process.exit(1);
});
