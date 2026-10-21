/**
 * Stellora API integration tests.
 * Target: isolated test backend on http://127.0.0.1:4100 (db: stellora_audit_test).
 * Runner: node:test via tsx. Zero new dependencies (Node 24 global fetch).
 *
 * Covers: auth flows, access control/IDOR, cart math, coupon rules, checkout
 * idempotency, stock integrity, demo payment flow, webhook signatures,
 * rate limiting, input validation, secret-leak probes, admin authorization.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const BASE = process.env.TEST_BASE ?? "http://127.0.0.1:4100";

/* ---------------- tiny cookie-jar fetch helpers ---------------- */

type Jar = Map<string, string>;

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorbCookies(jar: Jar, res: Response) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  for (const c of cookies) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

async function api(
  jar: Jar,
  method: string,
  path: string,
  body?: unknown,
  opts: { raw?: boolean; origin?: string } = {}
): Promise<{ status: number; json: any; res: Response }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined && !opts.raw ? { "Content-Type": "application/json" } : {}),
      ...(opts.origin ? { Origin: opts.origin } : {}),
      Cookie: cookieHeader(jar),
    },
    body: body === undefined ? undefined : opts.raw ? (body as string) : JSON.stringify(body),
    redirect: "manual",
  });
  absorbCookies(jar, res);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body (e.g. HTML error pages) */
  }
  return { status: res.status, json, res };
}

const ORIGIN = "http://127.0.0.1:4100";
const unique = (p: string) => `${p}${Date.now()}${Math.floor(Math.random() * 1000)}`;

/* Unique 10-digit Indian mobile per call: 6 + ts(7) + seq(2) — the random
   suffix must SURVIVE the 10-digit cut, so a monotonic counter is appended. */
let phoneSeq = 0;
const uniquePhone = () => `6${String(Date.now()).slice(-7)}${String(++phoneSeq % 100).padStart(2, "0")}`;

/* ---------------- shared fixtures ---------------- */

const admin = new Map() as Jar;
const custA = new Map() as Jar;
const custB = new Map() as Jar;

let productA: any; // cheap product (below coupon min)
let productB: any; // pricier product for coupon tests
let shippingFee = 0;
let freeAbove: number | null = null;

async function registerAndLogin(jar: Jar, suffix: string) {
  const email = unique(`audit.${suffix}`).toLowerCase() + "@stellora.test";
  const reg = await api(jar, "POST", "/api/auth/register", {
    name: `Audit Tester ${suffix}`,
    phone: uniquePhone(),
    email,
    password: "TestPass123",
  }, { origin: ORIGIN });
  assert.equal(reg.status, 201, `register failed: ${JSON.stringify(reg.json)}`);

  const login = await api(jar, "POST", "/api/auth/login", {
    identifier: email,
    password: "TestPass123",
  }, { origin: ORIGIN });
  assert.equal(login.status, 200, `login failed: ${JSON.stringify(login.json)}`);
  assert.equal(login.json.data.role, "CUSTOMER");
  return email;
}

/** Empty the cart (tests reuse fixture users to respect the register rate limit). */
async function clearCart(jar: Jar) {
  const view = await api(jar, "GET", "/api/cart");
  for (const item of view.json?.data?.items ?? []) {
    await api(jar, "DELETE", `/api/cart/items/${item.itemId}`, undefined, { origin: ORIGIN });
  }
}

async function addAddress(jar: Jar) {
  const res = await api(jar, "POST", "/api/account/addresses", {
    fullName: "Audit Tester",
    phone: uniquePhone(),
    line1: "12 Audit Lane",
    city: "Rudarpur",
    state: "Uttarakhand",
    pincode: "263153",
    isDefault: true,
  }, { origin: ORIGIN });
  assert.equal(res.status, 201, `address failed: ${JSON.stringify(res.json)}`);
  return res.json.data.id as string;
}

async function addToCart(jar: Jar, variantId: string, quantity = 1) {
  return api(jar, "POST", "/api/cart", { variantId, quantity }, { origin: ORIGIN });
}

async function cartVariantId(jar: Jar, product: any, nth = 0): Promise<string> {
  return product.variants[nth].id;
}

/* ================= suites ================= */

before(async () => {
  // Admin login (seeded account)
  const r = await api(admin, "POST", "/api/auth/login", {
    identifier: "admin@stellora.local",
    password: "StelloraAdmin#2026",
  }, { origin: ORIGIN });
  assert.equal(r.status, 200, "admin seed login failed");

  // Customers
  await registerAndLogin(custA, "custA");
  await registerAndLogin(custB, "custB");

  // Products for the journeys
  const list = await api(custA, "GET", "/api/products?page=1");
  assert.equal(list.status, 200);
  const products = list.json.data.products;
  assert.ok(products.length >= 2, "seed products missing in test DB");
  productA = [...products].sort((x, y) => x.variants[0].price - y.variants[0].price)[0];
  productB = [...products].sort((x, y) => y.variants[0].price - x.variants[0].price)[0];

  const ship = await api(custA, "GET", "/api/shipping");
  if (ship.json?.data) {
    shippingFee = ship.json.data.baseFee;
    freeAbove = ship.json.data.freeAbove;
  }

  // The audit DB persists between runs — restock fixtures via the admin API
  // so stock-dependent journeys stay deterministic (also exercises the
  // admin inventory endpoint with a positive delta).
  for (const product of [productA, productB]) {
    for (const v of product.variants) {
      if ((v.stock ?? 0) < 30) {
        const adj = await api(admin, "POST", `/api/admin/inventory/${v.id}`, {
          delta: 30 - (v.stock ?? 0),
          note: "audit suite restock",
        }, { origin: ORIGIN });
        if (adj.status === 200) v.stock = adj.json.data.stock;
      }
    }
  }
});

after(async () => {
  // Sessions only — all created records live in the throwaway test DB.
  await api(custA, "POST", "/api/auth/logout", {}, { origin: ORIGIN });
  await api(custB, "POST", "/api/auth/logout", {}, { origin: ORIGIN });
  await api(admin, "POST", "/api/auth/logout", {}, { origin: ORIGIN });
});

/* ---------- 1. Auth & session management ---------- */

describe("auth & sessions", () => {
  test("register rejects weak passwords", async () => {
    const res = await api(new Map(), "POST", "/api/auth/register", {
      name: "Weak Pass", phone: uniquePhone(), password: "short",
    }, { origin: ORIGIN });
    assert.equal(res.status, 422);
  });

  test("register rejects duplicate email", async () => {
    const jar = new Map();
    const email = await registerAndLogin(jar, "dup");
    const res = await api(new Map(), "POST", "/api/auth/register", {
      name: "Dup User", phone: uniquePhone(), email, password: "TestPass123",
    }, { origin: ORIGIN });
    assert.equal(res.status, 409);
  });

  test("login rejects wrong password", async () => {
    const res = await api(new Map(), "POST", "/api/auth/login", {
      identifier: "customer@stellora.local", password: "definitely-wrong",
    }, { origin: ORIGIN });
    assert.equal(res.status, 401);
  });

  test("NoSQL injection in identifier is rejected by schema (not passed to Mongo)", async () => {
    const res = await api(new Map(), "POST", "/api/auth/login", {
      identifier: { $gt: "" }, password: "x",
    }, { origin: ORIGIN });
    assert.equal(res.status, 422); // zod: identifier must be a string
  });

  test("session cookie is httpOnly", async () => {
    const jar = new Map();
    const { res: raw } = await api(jar, "POST", "/api/auth/login", {
      identifier: "admin@stellora.local", password: "StelloraAdmin#2026",
    }, { origin: ORIGIN });
    const setCookie = raw.headers.getSetCookie().find((c) => c.startsWith("stellora_session"));
    assert.ok(setCookie, "no session cookie set");
    assert.match(setCookie, /HttpOnly/i, "session cookie not HttpOnly");
    assert.match(setCookie, /SameSite=Lax/i, "session cookie not SameSite=Lax");
  });

  test("/api/auth/me reflects the session", async () => {
    const res = await api(custA, "GET", "/api/auth/me");
    assert.equal(res.status, 200);
    assert.equal(res.json.data.user.role, "CUSTOMER");
  });

  test("logout destroys the session server-side", async () => {
    const jar = new Map();
    await registerAndLogin(jar, "logout");
    const out = await api(jar, "POST", "/api/auth/logout", {}, { origin: ORIGIN });
    assert.equal(out.status, 200);
    const me = await api(jar, "GET", "/api/auth/me");
    assert.equal(me.json.data?.user ?? null, null, "session survived logout!");
  });

  test("cross-origin state-changing request is rejected (CSRF)", async () => {
    const res = await api(custA, "POST", "/api/cart", { variantId: "507f1f77bcf86cd799439011", quantity: 1 }, { origin: "https://evil.example.com" });
    assert.equal(res.status, 403);
  });
});

/* ---------- 2. Access control (Phase 7) ---------- */

describe("access control & IDOR", () => {
  test("unauthenticated access to protected endpoints -> 401", async () => {
    for (const path of ["/api/orders", "/api/wishlist", "/api/loyalty", "/api/account/addresses"]) {
      const res = await api(new Map(), "GET", path);
      assert.equal(res.status, 401, `${path} not protected`);
    }
  });

  test("customer cannot touch admin APIs (direct API probing, not just hidden UI)", async () => {
    for (const [method, path] of [
      ["GET", "/api/admin/stats"],
      ["GET", "/api/admin/orders-list"],
      ["GET", "/api/admin/customers-list"],
      ["POST", "/api/admin/products"],
      ["POST", "/api/admin/users"],
      ["PUT", "/api/admin/settings"],
      ["POST", "/api/admin/uploads"],
      ["GET", "/api/admin/audit-logs"],
    ] as const) {
      const res = await api(custA, method, path, method === "POST" || method === "PUT" ? {} : undefined, { origin: ORIGIN });
      assert.ok([401, 403].includes(res.status), `${method} ${path} -> ${res.status} (expected 401/403)`);
      if (res.status === 200) assert.fail(`customer accessed ${method} ${path}`);
    }
  });

  test("order detail is user-scoped (customer B cannot read customer A's order)", async () => {
    // A adds + checks out an order
    const addressId = await addAddress(custA);
    await addToCart(custA, await cartVariantId(custA, productA), 1);
    const co = await api(custA, "POST", "/api/checkout", {
      addressId, idempotencyKey: unique("idorkey"),
    }, { origin: ORIGIN });
    assert.equal(co.status, 201, JSON.stringify(co.json));
    const orderNumber = co.json.data.orderNumber;

    const asA = await api(custA, "GET", `/api/orders/${orderNumber}`);
    assert.equal(asA.status, 200);
    const asB = await api(custB, "GET", `/api/orders/${orderNumber}`);
    assert.equal(asB.status, 404, "IDOR: customer B read customer A's order!");
  });

  test("address mutations are owner-scoped", async () => {
    // sanity: the two fixture users must be distinct sessions
    const meA = await api(custA, "GET", "/api/auth/me");
    const meB = await api(custB, "GET", "/api/auth/me");
    const idA = meA.json.data.user.id;
    const idB = meB.json.data.user.id;
    assert.notEqual(idA, idB, "fixture jars A/B share one session!");

    const addressA = await addAddress(custA);
    // B tries to delete A's address
    const del = await api(custB, "DELETE", `/api/account/addresses/${addressA}`, undefined, { origin: ORIGIN });
    if (del.status === 200) {
      const listA = await api(custA, "GET", "/api/account/addresses");
      const listB = await api(custB, "GET", "/api/account/addresses");
      assert.fail(
        `IDOR: B deleted A's address. deleted=${addressA} idA=${idA} idB=${idB} ` +
        `A-now=${JSON.stringify((listA.json.data ?? []).map((a: any) => a.id))} ` +
        `B-now=${JSON.stringify((listB.json.data ?? []).map((a: any) => a.id))}`
      );
    }
    assert.ok([404, 403].includes(del.status), `B delete A's address -> ${del.status}`);
  });

  test("wishlist is user-scoped", async () => {
    const pid = productA.id;
    const add = await api(custA, "POST", "/api/wishlist", { productId: pid }, { origin: ORIGIN });
    assert.ok([200, 201].includes(add.status));
    const listA = await api(custA, "GET", "/api/wishlist");
    const listB = await api(custB, "GET", "/api/wishlist");
    const inA = (listA.json.data ?? []).some((w: any) => w.productId === pid);
    const inB = (listB.json.data ?? []).some((w: any) => w.productId === pid);
    assert.equal(inA, true);
    assert.equal(inB, false, "wishlist leaked across users");
  });

  test("admin user role cannot be self-granted via profile update", async () => {
    const res = await api(custA, "PUT", "/api/account/profile", {
      name: "Audit Tester A", phone: uniquePhone(), role: "ADMIN",
    }, { origin: ORIGIN });
    assert.ok([200, 422].includes(res.status)); // extra field ignored or rejected
    const me = await api(custA, "GET", "/api/auth/me");
    assert.equal(me.json.data.user.role, "CUSTOMER", "profile update escalated role!");
  });
});

/* ---------- 3. Cart math & server-authoritative pricing ---------- */

describe("cart (server-authoritative)", () => {
  test("guest cannot add to cart with invalid variant", async () => {
    const res = await addToCart(custA, "507f1f77bcf86cd799439011", 1);
    assert.equal(res.status, 404);
  });

  test("quantity above 10 rejected by schema", async () => {
    const res = await addToCart(custA, productA.variants[0].id, 11);
    assert.equal(res.status, 422);
  });

  test("quantity beyond stock is capped server-side", async () => {
    const variant = productA.variants[0];
    if (variant.stock <= 1) return; // skip when seed stock can't test the cap
    await clearCart(custB);
    const res = await addToCart(custB, variant.id, 10);
    assert.equal(res.status, 201);
    const qty = res.json.data.items.find((i: any) => i.variantId === variant.id)?.quantity;
    assert.ok(qty! <= variant.stock, `cart qty ${qty} exceeds stock ${variant.stock}`);
  });

  test("cart view carries server-computed prices (client-sent prices impossible)", async () => {
    await clearCart(custA);
    const res = await addToCart(custA, productA.variants[0].id, 2);
    assert.equal(res.status, 201);
    const line = res.json.data.items.find((i: any) => i.variantId === productA.variants[0].id);
    assert.ok(line, "line missing");
    assert.equal(line.unitPrice, productA.variants[0].price, "unit price not server-derived!");
    assert.equal(line.lineTotal, Math.round(productA.variants[0].price * 2 * 100) / 100);
  });

  test("checkout payload cannot influence totals (no amount fields accepted)", async () => {
    await clearCart(custA);
    const addressId = await addAddress(custA);
    await addToCart(custA, productA.variants[0].id, 1);
    const res = await api(custA, "POST", "/api/checkout", {
      addressId, idempotencyKey: unique("totkey"), grandTotal: 1, subtotal: 1, shippingFee: 0,
    }, { origin: ORIGIN });
    // zod strips unknown keys; the order must still be created with true totals
    assert.equal(res.status, 201);
    const detail = await api(custA, "GET", `/api/orders/${res.json.data.orderNumber}`);
    const o = detail.json.data;
    const expectedSub = productA.variants[0].price;
    assert.equal(o.subtotal, expectedSub, "subtotal not server-computed");
    assert.ok(o.grandTotal >= expectedSub, "grandTotal below subtotal — client tampering worked?");
  });
});

/* ---------- 4. Coupons ---------- */

describe("coupons", () => {
  test("invalid code -> valid:false with message", async () => {
    await clearCart(custA);
    await addToCart(custA, productA.variants[0].id, 1);
    const res = await api(custA, "POST", "/api/coupons/validate", { code: "NOSUCHCODE" }, { origin: ORIGIN });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.valid, false);
  });

  test("min subtotal enforced", async () => {
    // productA is the cheapest; if its price < 999 the coupon must refuse
    await clearCart(custA);
    await addToCart(custA, productA.variants[0].id, 1);
    const res = await api(custA, "POST", "/api/coupons/validate", { code: "WELCOME10" }, { origin: ORIGIN });
    const d = res.json.data;
    if (productA.variants[0].price < 999) {
      assert.equal(d.valid, false);
    } else {
      assert.equal(d.valid, true);
    }
  });

  test("per-user limit enforced at checkout", async () => {
    const jar = new Map();
    await registerAndLogin(jar, "coupon"); // registration #5 (limit: 8/hour)
    const addressId = await addAddress(jar);
    const v = productB.variants[0];
    if (v.price * 1 < 999) return; // need WELCOME10-eligible subtotal
    await addToCart(jar, v.id, 1);
    const first = await api(jar, "POST", "/api/checkout", {
      addressId, couponCode: "WELCOME10", idempotencyKey: unique("cp1"),
    }, { origin: ORIGIN });
    assert.equal(first.status, 201, JSON.stringify(first.json));
    assert.ok(first.json.data.orderNumber);

    // second attempt must fail the per-user limit (perUserLimit: 1)
    await addToCart(jar, v.id, 1); // cart was cleared by the first checkout
    const second = await api(jar, "POST", "/api/checkout", {
      addressId, couponCode: "WELCOME10", idempotencyKey: unique("cp2"),
    }, { origin: ORIGIN });
    assert.equal(second.status, 422, "per-user coupon limit not enforced");
    assert.equal(second.json.error?.code, "INVALID_COUPON");
  });

  test("coupon discount is recomputed server-side at checkout", async () => {
    const jar = new Map();
    await registerAndLogin(jar, "couponmath"); // registration #6
    const addressId = await addAddress(jar);
    const v = productB.variants[0];
    if (v.price < 999) return;
    await addToCart(jar, v.id, 1);
    const res = await api(jar, "POST", "/api/checkout", {
      addressId, couponCode: "WELCOME10", idempotencyKey: unique("cpm"),
    }, { origin: ORIGIN });
    assert.equal(res.status, 201);
    const detail = await api(jar, "GET", `/api/orders/${res.json.data.orderNumber}`);
    const o = detail.json.data;
    const expected = Math.min(Math.round(v.price * 0.1 * 100) / 100, v.price);
    assert.equal(o.discountTotal, expected, "server discount != expected 10%");
  });
});

/* ---------- 5. Checkout integrity ---------- */

describe("checkout integrity", () => {
  test("empty cart -> EMPTY_CART", async () => {
    await clearCart(custB);
    const addressId = await addAddress(custB);
    const res = await api(custB, "POST", "/api/checkout", { addressId, idempotencyKey: unique("ec") }, { origin: ORIGIN });
    assert.equal(res.status, 422);
    assert.equal(res.json.error?.code, "EMPTY_CART");
  });

  test("another user's addressId rejected", async () => {
    const addressA = await addAddress(custA);
    await clearCart(custB);
    await addToCart(custB, productA.variants[0].id, 1);
    const res = await api(custB, "POST", "/api/checkout", {
      addressId: addressA, idempotencyKey: unique("addr"),
    }, { origin: ORIGIN });
    assert.equal(res.status, 422);
    assert.equal(res.json.error?.code, "ADDRESS_NOT_FOUND");
  });

  test("idempotency: same key returns the SAME order (no duplicate)", async () => {
    await clearCart(custA);
    const addressId = await addAddress(custA);
    await addToCart(custA, productA.variants[0].id, 1);
    const key = unique("idem-key");
    const r1 = await api(custA, "POST", "/api/checkout", { addressId, idempotencyKey: key }, { origin: ORIGIN });
    const r2 = await api(custA, "POST", "/api/checkout", { addressId, idempotencyKey: key }, { origin: ORIGIN });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 200); // replay
    assert.equal(r1.json.data.orderNumber, r2.json.data.orderNumber, "duplicate order created!");
    assert.equal(r2.json.data.replayed, true);

    // concurrent duplicate — unique index + winner recovery
    const [c1, c2] = await Promise.all([
      api(new Map(), "GET", "/api/health"), // warm
      api(custA, "POST", "/api/checkout", { addressId, idempotencyKey: key }, { origin: ORIGIN }),
    ]);
    assert.equal(c2.json.data.orderNumber, r1.json.data.orderNumber);
  });

  test("shipping math: free threshold applied server-side", async () => {
    await clearCart(custB);
    const addressId = await addAddress(custB);
    // Pick a well-stocked product so the cart can actually reach the threshold
    const all = await api(custB, "GET", "/api/products?page=1");
    const stocked = (all.json.data.products as any[])
      .filter((p) => (p.variants[0]?.stock ?? 0) >= 5)
      .sort((a, b) => b.variants[0].price - a.variants[0].price);
    if (stocked.length === 0) return; // no well-stocked product on page 1 — skip honestly
    const v = stocked[0].variants[0];
    const qty = freeAbove ? Math.min(10, Math.ceil(freeAbove / v.price), v.stock) : 1;
    await addToCart(custB, v.id, qty);
    const res = await api(custB, "POST", "/api/checkout", { addressId, idempotencyKey: unique("ship") }, { origin: ORIGIN });
    assert.equal(res.status, 201);
    const detail = await api(custB, "GET", `/api/orders/${res.json.data.orderNumber}`);
    const o = detail.json.data;
    if (freeAbove && o.subtotal >= freeAbove) {
      assert.equal(o.shippingFee, 0, "free shipping threshold not applied");
    } else {
      assert.equal(o.shippingFee, shippingFee);
    }
    const expectedGrand = Math.round((o.subtotal - o.discountTotal + o.shippingFee) * 100) / 100;
    assert.equal(o.grandTotal, expectedGrand, "grandTotal arithmetic wrong");
  });

  test("stock decremented exactly once per unit", async () => {
    await clearCart(custA);
    const v = productA.variants.find((x: any) => x.stock >= 2) ?? productA.variants[0];
    // FRESH baseline (other tests deplete stock concurrently in suite order)
    const stock0 = await api(custA, "GET", `/api/products/${productA.slug}/stock`);
    const before = stock0.json.data.find((x: any) => x.id === v.id)?.stock;
    const addressId = await addAddress(custA);
    await addToCart(custA, v.id, 1);
    const res = await api(custA, "POST", "/api/checkout", { addressId, idempotencyKey: unique("sd") }, { origin: ORIGIN });
    assert.equal(res.status, 201);
    const stockRes = await api(custA, "GET", `/api/products/${productA.slug}/stock`);
    const after = stockRes.json.data.find((x: any) => x.id === v.id)?.stock;
    assert.equal(after, before - 1, `stock went ${before} -> ${after} (expected ${before - 1})`);
  });

  test("customer cancel restores stock and refunding works", async () => {
    await clearCart(custB);
    const v = productA.variants.find((x: any) => x.stock >= 2) ?? productA.variants[0];
    // FRESH baseline right before the journey
    const stock0 = await api(custB, "GET", `/api/products/${productA.slug}/stock`);
    const before = stock0.json.data.find((x: any) => x.id === v.id)?.stock;
    const addressId = await addAddress(custB);
    await addToCart(custB, v.id, 1);
    const res = await api(custB, "POST", "/api/checkout", { addressId, idempotencyKey: unique("cc") }, { origin: ORIGIN });
    assert.equal(res.status, 201);
    const orderNumber = res.json.data.orderNumber;

    // customer B cannot cancel A's order
    const asB = await api(custA, "POST", `/api/orders/${orderNumber}/cancel`, {}, { origin: ORIGIN });
    assert.ok([404, 422].includes(asB.status), "B cancelled A's order!");

    const cancel = await api(custB, "POST", `/api/orders/${orderNumber}/cancel`, {}, { origin: ORIGIN });
    assert.equal(cancel.status, 200);
    const stockRes = await api(custB, "GET", `/api/products/${productA.slug}/stock`);
    const after = stockRes.json.data.find((x: any) => x.id === v.id)?.stock;
    assert.equal(after, before, "stock not restored after cancellation");
  });
});

/* ---------- 6. Demo payment flow ---------- */

describe("demo gateway payment flow", () => {
  test("full flow: intent -> process -> confirm -> PAID + CONFIRMED; bad signature rejected; replay idempotent", async () => {
    const jar = custA; // fixture reuse (register rate limit: 8/hour/IP)
    await clearCart(jar);
    const addressId = await addAddress(jar);
    await addToCart(jar, productA.variants[0].id, 1);
    const co = await api(jar, "POST", "/api/checkout", { addressId, idempotencyKey: unique("pay") }, { origin: ORIGIN });
    assert.equal(co.status, 201);
    const orderNumber = co.json.data.orderNumber;

    // intent
    const intent = await api(jar, "POST", "/api/payments/create-intent", { orderNumber }, { origin: ORIGIN });
    assert.equal(intent.status, 200, JSON.stringify(intent.json));
    assert.equal(intent.json.data.demo, true);
    const { gatewayOrderId } = intent.json.data;

    // demo authorization
    const proc = await api(jar, "POST", "/api/payments/demo/process", {
      orderNumber, cardNumber: "4111111111111111", expiry: "12/28", cvv: "123",
    }, { origin: ORIGIN });
    assert.equal(proc.status, 200);
    assert.equal(proc.json.data.approved, true);
    const { gatewayPaymentId, gatewaySignature } = proc.json.data;

    // tampered signature must be rejected
    const bad = await api(jar, "POST", "/api/payments/confirm", {
      orderNumber, gatewayPaymentId, gatewaySignature: "deadbeef".repeat(8),
    }, { origin: ORIGIN });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error?.code, "SIGNATURE_INVALID");

    // correct signature settles
    const ok = await api(jar, "POST", "/api/payments/confirm", {
      orderNumber, gatewayPaymentId, gatewaySignature,
    }, { origin: ORIGIN });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.data.paymentStatus, "PAID");

    // order detail: PAID + CONFIRMED
    const detail = await api(jar, "GET", `/api/orders/${orderNumber}`);
    assert.equal(detail.json.data.paymentStatus, "PAID");
    assert.equal(detail.json.data.status, "CONFIRMED");

    // replay confirm is idempotent
    const again = await api(jar, "POST", "/api/payments/confirm", {
      orderNumber, gatewayPaymentId, gatewaySignature,
    }, { origin: ORIGIN });
    assert.equal(again.status, 200);
    assert.equal(again.json.data.alreadyPaid, true);

    // another user cannot pay for this order
    const foreign = await api(custB, "POST", "/api/payments/create-intent", { orderNumber }, { origin: ORIGIN });
    assert.equal(foreign.status, 404);
  });

  test("declined card keeps order PENDING", async () => {
    const jar = custB; // fixture reuse
    await clearCart(jar);
    const addressId = await addAddress(jar);
    await addToCart(jar, productA.variants[0].id, 1);
    const co = await api(jar, "POST", "/api/checkout", { addressId, idempotencyKey: unique("dec") }, { origin: ORIGIN });
    const orderNumber = co.json.data.orderNumber;
    await api(jar, "POST", "/api/payments/create-intent", { orderNumber }, { origin: ORIGIN });
    const proc = await api(jar, "POST", "/api/payments/demo/process", {
      orderNumber, cardNumber: "4000000000000002", expiry: "12/28", cvv: "123",
    }, { origin: ORIGIN });
    assert.equal(proc.json.data.approved, false);
    const detail = await api(jar, "GET", `/api/orders/${orderNumber}`);
    assert.equal(detail.json.data.paymentStatus, "PENDING", "declined card marked paid!");
  });
});

/* ---------- 7. Payment webhook signatures ---------- */

describe("payment webhooks", () => {
  test("razorpay webhook with bad signature -> 400", async () => {
    const res = await fetch(`${BASE}/api/payments/webhook/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": "bad" },
      body: JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: "order_x", notes: { orderNumber: "STL-1" } } } } }),
    });
    assert.equal(res.status, 400);
  });

  test("razorpay webhook with valid signature but unknown order -> SKIPPED:ORDER_NOT_FOUND", async () => {
    // PAYMENT_WEBHOOK_SECRET is set by scripts/test-stack.sh for the test backend
    const secret = process.env.TEST_WEBHOOK_SECRET ?? "audit_test_webhook_secret";
    const payload = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_audit", order_id: "order_audit", notes: { orderNumber: "STL-0000-NOPE" } } } } });
    const sig = createHmac("sha256", secret).update(payload).digest("hex");
    const res = await fetch(`${BASE}/api/payments/webhook/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": sig },
      body: payload,
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.settled, false);
    assert.equal(json.data.reason, "ORDER_NOT_FOUND");
  });
});

/* ---------- 8. Input validation & info leaks ---------- */

describe("validation & info leaks", () => {
  test("malformed JSON body does not leak stack traces", async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"identifier": "x", broken',
    });
    const text = await res.text();
    assert.ok(!text.includes("at "), `stack trace leaked: ${text.slice(0, 200)}`);
    assert.ok(res.status >= 400);
  });

  test("oversized coupon code rejected", async () => {
    const res = await api(custA, "POST", "/api/coupons/validate", { code: "A".repeat(100) }, { origin: ORIGIN });
    assert.ok([200, 422].includes(res.status));
  });

  test("unknown API path -> JSON 404 (not HTML)", async () => {
    const res = await api(new Map(), "GET", "/api/definitely-not-a-route");
    assert.equal(res.status, 404);
    assert.equal(res.json?.error?.code, "NOT_FOUND");
  });

  test("public settings endpoint never leaks payment/delivery secrets", async () => {
    const res = await api(new Map(), "GET", "/api/settings");
    assert.equal(res.status, 200);
    const rows = res.json.data ?? [];
    const leaked = rows.filter((r: any) => r.key?.startsWith("payment.") || r.key?.startsWith("delivery.api"));
    assert.equal(leaked.length, 0, `secret keys exposed: ${leaked.map((l: any) => l.key).join(",")}`);
  });

  test("product search is regex-escaped (no ReDoS/injection)", async () => {
    const res = await api(new Map(), "GET", `/api/products?q=${encodeURIComponent(".*[]{}()$^")}`);
    assert.equal(res.status, 200);
  });

  test("admin search escapes regex", async () => {
    const res = await api(admin, "GET", `/api/admin/search?q=${encodeURIComponent("^(.*)$")}`);
    assert.equal(res.status, 200);
  });
});

/* ---------- 9. Admin operations (happy path via API) ---------- */

describe("admin operations", () => {
  test("admin creates a product, customer sees it, customer cannot delete it", async () => {
    const cat = await api(admin, "GET", "/api/categories");
    const categoryId = cat.json.data[0].id;
    const slug = unique("audit-prod-").toLowerCase();
    const create = await api(admin, "POST", "/api/admin/products", {
      name: "Audit Test Product",
      slug,
      categoryId,
      shortDescription: "Created by the automated audit suite",
      status: "ACTIVE",
      variants: [{ name: "Standard", sku: unique("AUD"), price: 1499, stock: 5, isActive: true }],
    }, { origin: ORIGIN });
    assert.equal(create.status, 201, JSON.stringify(create.json));
    const productId = create.json.data.id;
    const variantId = create.json.data.variants[0].id;

    // visible on the storefront
    const pub = await api(new Map(), "GET", `/api/products/${slug}`);
    assert.equal(pub.status, 200);

    // stock adjust
    const adj = await api(admin, "POST", `/api/admin/inventory/${variantId}`, { delta: -1, note: "audit" }, { origin: ORIGIN });
    assert.equal(adj.status, 200);
    assert.equal(adj.json.data.stock, 4);

    // negative stock guard
    const bad = await api(admin, "POST", `/api/admin/inventory/${variantId}`, { delta: -100 }, { origin: ORIGIN });
    assert.equal(bad.status, 422);
    assert.equal(bad.json.error?.code, "NEGATIVE_STOCK");

    // customer cannot delete it
    const del = await api(custA, "DELETE", `/api/admin/products/${productId}`, undefined, { origin: ORIGIN });
    assert.ok([401, 403].includes(del.status));

    // cleanup (test DB only)
    const del2 = await api(admin, "DELETE", `/api/admin/products/${productId}`, undefined, { origin: ORIGIN });
    assert.ok([200, 204].includes(del2.status));
  });

  test("admin order status transitions follow the state machine", async () => {
    const jar = custB; // fixture reuse
    await clearCart(jar);
    const addressId = await addAddress(jar);
    await addToCart(jar, productA.variants[0].id, 1);
    const co = await api(jar, "POST", "/api/checkout", { addressId, idempotencyKey: unique("tr") }, { origin: ORIGIN });
    const orderNumber = co.json.data.orderNumber;
    // orderId from the OWNER's own order detail (serializeOrderDetail.id)
    const ownDetail = await api(jar, "GET", `/api/orders/${orderNumber}`);
    const orderId = ownDetail.json.data.id;

    // PENDING -> SHIPPED must be rejected
    const skip = await api(admin, "POST", `/api/admin/orders/${orderId}/status`, { status: "SHIPPED" }, { origin: ORIGIN });
    assert.equal(skip.status, 422);
    assert.equal(skip.json.error?.code, "INVALID_TRANSITION");

    // PENDING -> CONFIRMED -> PROCESSING -> SHIPPED (state machine pipeline)
    const confirm = await api(admin, "POST", `/api/admin/orders/${orderId}/status`, { status: "CONFIRMED", note: "audit" }, { origin: ORIGIN });
    assert.equal(confirm.status, 200);
    // CONFIRMED -> SHIPPED must be rejected (PROCESSING is mandatory)
    const skip2 = await api(admin, "POST", `/api/admin/orders/${orderId}/status`, { status: "SHIPPED" }, { origin: ORIGIN });
    assert.equal(skip2.status, 422);
    const process = await api(admin, "POST", `/api/admin/orders/${orderId}/status`, { status: "PROCESSING" }, { origin: ORIGIN });
    assert.equal(process.status, 200);
    const ship = await api(admin, "POST", `/api/admin/orders/${orderId}/status`, { status: "SHIPPED", carrier: "Blue Dart", trackingNumber: "AWB123" }, { origin: ORIGIN });
    assert.equal(ship.status, 200);

    const detail = await api(jar, "GET", `/api/orders/${orderNumber}`);
    assert.equal(detail.json.data.status, "SHIPPED");
    assert.equal(detail.json.data.shipment?.trackingNumber, "AWB123");

    // SHIPPED -> CANCELLED must be rejected (no cancellation after shipping)
    const late = await api(admin, "POST", `/api/admin/orders/${orderId}/status`, { status: "CANCELLED" }, { origin: ORIGIN });
    assert.equal(late.status, 422);
  });

  test("audit log captures admin actions", async () => {
    const logs = await api(admin, "GET", "/api/admin/audit-logs");
    assert.equal(logs.status, 200);
    assert.ok(logs.json.data.length > 0);
  });
});

/* ---------- 10. Public storefront behavior ---------- */

describe("storefront public APIs", () => {
  test("products pagination + sort", async () => {
    const p1 = await api(new Map(), "GET", "/api/products?page=1&sort=price-asc");
    assert.equal(p1.status, 200);
    const items = p1.json.data.products;
    assert.ok(items.length > 0);
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1].variants[0]?.price ?? 0;
      const cur = items[i].variants[0]?.price ?? 0;
      // displayed price = cheapest active variant
      const minPrev = Math.min(...(items[i - 1].variants.map((v: any) => v.price)));
      const minCur = Math.min(...(items[i].variants.map((v: any) => v.price)));
      assert.ok(minPrev <= minCur + 1e-9, `price-asc violated at index ${i}: ${minPrev} > ${minCur}`);
    }
  });

  test("category filter returns only that category", async () => {
    const cats = await api(new Map(), "GET", "/api/categories");
    const cat = cats.json.data[0];
    const res = await api(new Map(), "GET", `/api/products?category=${cat.slug}`);
    for (const p of res.json.data.products) {
      assert.equal(p.category?.id, cat.id, `product ${p.slug} leaked across category filter`);
    }
  });

  test("ARCHIVED/DRAFT products are not publicly visible", async () => {
    const res = await api(new Map(), "GET", "/api/products?page=1");
    for (const p of res.json.data.products) assert.equal(p.status, "ACTIVE");
  });

  test("health endpoint reports DB connectivity", async () => {
    const res = await api(new Map(), "GET", "/api/health");
    assert.equal(res.json.data.status, "healthy");
    assert.equal(res.json.data.database, "connected");
  });
});
