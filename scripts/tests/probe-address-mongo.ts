/**
 * Raw-Mongo investigation of the address DELETE anomaly.
 * Creates state via API, then watches the actual user documents in MongoDB.
 */
import mongoose from "mongoose";

const BASE = "http://127.0.0.1:4100";
const ORIGIN = BASE;

type Jar = Map<string, string>;
function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function absorb(jar: Jar, res: Response) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}
async function api(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Origin: ORIGIN,
      Cookie: cookieHeader(jar),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  absorb(jar, res);
  let json: any = null;
  try { json = await res.json(); } catch { /* raw */ }
  return { status: res.status, json };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri!, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db!;

  const ts = Date.now();
  let seq = 0;
  const phone = () => `6${String(ts).slice(-7)}${String(++seq % 100).padStart(2, "0")}`;

  async function snapshot(id: string, label: string) {
    const doc = await db.collection("users").findOne({ _id: new mongoose.Types.ObjectId(id) });
    console.log(`[${label}] user ${id} addresses=`, JSON.stringify((doc?.addresses ?? []).map((a: any) => String(a._id))));
  }

  const A = new Map() as Jar;
  const B = new Map() as Jar;
  {
    const email = `probe.a.${ts}@t.test`;
    await api(A, "POST", "/api/auth/register", { name: "Probe A", phone: phone(), email, password: "TestPass123" });
    await api(A, "POST", "/api/auth/login", { identifier: email, password: "TestPass123" });
  }
  {
    const email = `probe.b.${ts}@t.test`;
    await api(B, "POST", "/api/auth/register", { name: "Probe B", phone: phone(), email, password: "TestPass123" });
    await api(B, "POST", "/api/auth/login", { identifier: email, password: "TestPass123" });
  }
  const idA = (await api(A, "GET", "/api/auth/me")).json.data.user.id;
  const idB = (await api(B, "GET", "/api/auth/me")).json.data.user.id;
  console.log("idA:", idA, "idB:", idB);

  const addr = await api(A, "POST", "/api/account/addresses", {
    fullName: "Probe A", phone: "9876500000", line1: "1 A Street", city: "Rudarpur", state: "Uttarakhand", pincode: "263153", isDefault: true,
  });
  const addressId = addr.json.data.id;

  await snapshot(idA, "before-create");
  await snapshot(idB, "before-create");

  // A: cart + checkout (the magic ingredient)
  const products = await api(A, "GET", "/api/products?page=1");
  const prod = products.json.data.products[0];
  await api(A, "POST", "/api/cart", { variantId: prod.variants[0].id, quantity: 1 });
  const co = await api(A, "POST", "/api/checkout", { addressId, idempotencyKey: `probe${ts}` });
  console.log("A checkout:", co.status, co.json.data?.orderNumber);

  await snapshot(idA, "after-checkout");
  await snapshot(idB, "after-checkout");

  // count addresses matching addressId across ALL users
  const found = await db.collection("users").countDocuments({ "addresses._id": new mongoose.Types.ObjectId(addressId) });
  console.log(`users containing address ${addressId}:`, found);

  // THE PROBE
  const del = await api(B, "DELETE", `/api/account/addresses/${addressId}`);
  console.log("\n>>> B DELETE ->", del.status, JSON.stringify(del.json));

  await snapshot(idA, "after-delete");
  await snapshot(idB, "after-delete");

  // what does the RAW updateOne do right now, from the script itself?
  const raw = await db.collection("users").updateOne(
    { _id: new mongoose.Types.ObjectId(idB) },
    { $pull: { addresses: { _id: new mongoose.Types.ObjectId(addressId) } } }
  );
  console.log("raw updateOne(B):", JSON.stringify(raw));
  await snapshot(idB, "after-raw");

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
