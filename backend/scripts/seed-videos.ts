/**
 * One-off: attach demo video preview URLs to a handful of products so the
 * homepage "Watch it in action" showcase and PDP video tabs have content.
 * Mix of hosted MP4s and a YouTube link (proves both player paths).
 */
import mongoose from "mongoose";
import { readFileSync } from "node:fs";

const envFile = readFileSync(new URL("../.env", import.meta.url), "utf8");
const uri = envFile.match(/^MONGODB_URI="?(.+?)"?$/m)?.[1];
if (!uri) throw new Error("MONGODB_URI not found in backend/.env");

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });

const products = mongoose.connection.collection("products");

const MP4 = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
];

const YT = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";

// Assign by slug — one item per category for a rich showcase
const assignments: [string, string][] = [
  ["sera-bun-extension", MP4[0]],
  ["noor-evening-clutch", MP4[1]],
  ["lumiere-vanity-mirror", YT],
  ["ivanna-gold-bangle-set", MP4[2]],
  ["rouge-velvet-lipstick", MP4[3]],
];

let updated = 0;
for (const [slug, url] of assignments) {
  const res = await products.updateOne({ slug }, { $set: { videoUrl: url } });
  updated += res.modifiedCount;
  if (!res.matchedCount) console.log(`(skip: ${slug} not found)`);
}
console.log(`videoUrl set on ${updated} products`);

// Any other products: clear videoUrl leftovers
await products.updateMany({ $or: [{ videoUrl: "" }, { videoUrl: null }] }, { $unset: { videoUrl: "" } });

await mongoose.disconnect();
console.log("done");
