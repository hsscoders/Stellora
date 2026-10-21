import { MongoClient } from "mongodb";

async function main(): Promise<void> {
  const c = new MongoClient("mongodb+srv://hsscoders_db_user:MMiXXUz6tdVsWaEv@cluster0.tse9ruk.mongodb.net/stellora?retryWrites=true&w=majority&appName=Cluster0");
  await c.connect();
  const db = c.db("stellora");
  const variants = await db.collection("products").aggregate([{ $unwind: "$variants" }, { $project: { vid: "$variants._id" } }]).toArray();
  const ids = new Set(variants.map((v) => String(v.vid)));
  const moves = await db.collection("stockmovements").find({}).toArray();
  const orphans = moves.filter((m) => !ids.has(String(m.variantId)));
  console.log("Mongo source: total movements =", moves.length, "| orphaned variantId refs =", orphans.length);
  console.log("sample orphan refs:", orphans.slice(0, 3).map((o) => String(o.variantId)));
  await c.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
