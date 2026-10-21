/**
 * Standalone repro: address DELETE IDOR investigation.
 * Boots nothing — expects the test backend on :4100 (run via run-repro.sh).
 */
import { createHmac } from "node:crypto";

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
  return { status: res.status, json, res };
}

const ts = Date.now();
let seq = 0;
const phone = () => `6${String(ts).slice(-7)}${String(++seq % 100).padStart(2, "0")}`;

async function main() {
const A = new Map() as Jar;
const B = new Map() as Jar;

// register + login A
{
  const email = `repro.a.${ts}@t.test`;
  const r = await api(A, "POST", "/api/auth/register", { name: "Repro A", phone: phone(), email, password: "TestPass123" });
  console.log("A register:", r.status);
  const l = await api(A, "POST", "/api/auth/login", { identifier: email, password: "TestPass123" });
  console.log("A login:", l.status);
}
// register + login B
{
  const email = `repro.b.${ts}@t.test`;
  const r = await api(B, "POST", "/api/auth/register", { name: "Repro B", phone: phone(), email, password: "TestPass123" });
  console.log("B register:", r.status);
  const l = await api(B, "POST", "/api/auth/login", { identifier: email, password: "TestPass123" });
  console.log("B login:", l.status);
}

// sanity: distinct identities
const meA = await api(A, "GET", "/api/auth/me");
const meB = await api(B, "GET", "/api/auth/me");
console.log("A id:", meA.json.data.user.id, "| B id:", meB.json.data.user.id);

// A creates an address
const addr = await api(A, "POST", "/api/account/addresses", {
  fullName: "A User", phone: "9876500000", line1: "1 A Street", city: "Rudarpur", state: "Uttarakhand", pincode: "263153", isDefault: true,
});
console.log("A address create:", addr.status, JSON.stringify(addr.json));
const addressId = addr.json.data?.id;
console.log("A address created:", addressId, "| A list:", (await api(A, "GET", "/api/account/addresses")).json.data.map((a: any) => a.id));

// REPLICATE SUITE FLOW: A adds to cart + checks out; B probes A's order
const products = await api(A, "GET", "/api/products?page=1");
const prod = products.json.data.products[0];
await api(A, "POST", "/api/cart", { variantId: prod.variants[0].id, quantity: 1 });
const co = await api(A, "POST", "/api/checkout", { addressId, idempotencyKey: `repro${ts}` });
console.log("A checkout:", co.status, co.json.data?.orderNumber);
const asB = await api(B, "GET", `/api/orders/${co.json.data.orderNumber}`);
console.log("B GET A's order:", asB.status, "(expected 404)");

// B deletes A's address — THE PROBE
const del = await api(B, "DELETE", `/api/account/addresses/${addressId}`);
console.log("\n>>> B DELETE A's address ->", del.status, JSON.stringify(del.json));
console.log(">>> B's cookies:", [...B.keys()]);
console.log(">>> A list after:", (await api(A, "GET", "/api/account/addresses")).json.data.map((a: any) => a.id));
console.log(">>> B list after:", (await api(B, "GET", "/api/account/addresses")).json.data.map((a: any) => a.id));
}
main().catch((e) => { console.error(e); process.exit(1); });
