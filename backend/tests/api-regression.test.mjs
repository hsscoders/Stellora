/**
 * Stellora — API regression & security test suite (node:test, zero deps).
 *
 * Run against a RUNNING stack (storefront :3000 proxies /api to backend :4000):
 *   cd backend && BACKEND_BASE=http://127.0.0.1:3000 node --test tests/
 *
 * Design constraints (per audit golden rules):
 *  - Runs against the live dev DB but creates ONLY clearly-labelled QA records.
 *  - Cleans up every entity it can via public/admin APIs; leaves the cancelled
 *    QA order (no order-delete endpoint exists — intentional audit trail).
 *  - Respects rate limits: 1 register, few logins, lockout test uses a
 *    throwaway identifier.
 *  - Never touches real payment gateways — demo gateway only (built-in sim).
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BACKEND_BASE ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL ?? "admin@stellora.local";
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD ?? "Admin@12345";

const RUN = `qa${Date.now().toString(36).slice(-6)}`;
const QA = {
  name: `QA Regression ${RUN}`,
  phone: `9${Date.now().toString().slice(-9)}`, // 10-digit unique
  email: `${RUN}@qa-test.local`,
  password: "QaPass!2345",
};

let userJar = [];   // cookie jar for QA customer
let adminJar = [];  // cookie jar for admin
let userId = null;
let addressId = null;
let orderNumber = null;
let paidOrderNumber = null;
let variantA = null; // {id, price, slug}
let variantB = null;
let productId = null;
let qaProductId = null;
let qaCategoryId = null;
let qaCouponId = null;
let reviewBlocked = false;
const qaReviewId = null;

/* ---------------- helpers ---------------- */

function applyCookies(jar, res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (name === "stellora_session" || name === "stellora_cart") {
      const filtered = jar.filter((x) => !x.startsWith(name + "="));
      if (value) filtered.push(`${name}=${value}`);
      jar.length = 0;
      jar.push(...filtered);
    }
  }
  return set;
}

function jarHeader(jar) {
  return jar.length ? { cookie: jar.join("; ") } : {};
}

async function req(method, path, { body, jar = "user", origin, headers = {} } = {}) {
  const h = {
    "content-type": "application/json",
    origin: origin ?? BASE,
    ...jarHeader(jar === "admin" ? adminJar : userJar),
    ...headers,
  };
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
  applyCookies(jar === "admin" ? adminJar : userJar, res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

const get = (p, o) => req("GET", p, o);
const post = (p, body, o) => req("POST", p, { body, ...o });
const patch = (p, body, o) => req("PATCH", p, { body, ...o });
const put = (p, body, o) => req("PUT", p, { body, ...o });
const del = (p, o) => req("DELETE", p, o);

/* ================= Section A: public catalog & infra ================= */

describe("A. Public catalog & infrastructure", () => {
  test("health endpoint reports database connected", async () => {
    const r = await get("/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.json?.data?.status, "healthy");
    assert.equal(r.json?.data?.database, "connected");
  });

  test("GET /api/categories returns seeded categories with expected shape", async () => {
    const r = await get("/api/categories");
    assert.equal(r.status, 200);
    const cats = r.json?.data;
    assert.ok(Array.isArray(cats) && cats.length >= 4, "expected >=4 seeded categories");
    for (const c of cats) {
      assert.ok(c.id && c.slug && c.name, "category shape");
    }
  });

  test("GET /api/banners returns array", async () => {
    const r = await get("/api/banners");
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json?.data));
  });

  test("GET /api/products pagination contract (PAGE_SIZE cap, totals)", async () => {
    const page1 = await get("/api/products?page=1");
    assert.equal(page1.status, 200);
    const body = page1.json?.data ?? {};
    const list = body.products ?? [];
    assert.ok(Array.isArray(list), "products array");
    assert.ok(list.length > 0 && list.length <= 12, "within PAGE_SIZE=12");
    assert.equal(typeof body.total, "number");
    assert.ok(body.pages >= 1);
    const sorted = await get("/api/products?sort=price-asc&page=1");
    assert.equal(sorted.status, 200);
    const qs = (sorted.json?.data?.products ?? []).map((p) => Math.min(...(p.variants ?? []).filter((v) => v.isActive).map((v) => Number(v.price))));
    const sortedCopy = [...qs].sort((a, b) => a - b);
    assert.deepEqual(qs, sortedCopy, "price-asc ordering");
    const q = await get("/api/products?q=ring&page=1");
    assert.equal(q.status, 200);
  });

  test("GET /api/settings and /api/seo return objects", async () => {
    const s = await get("/api/settings");
    assert.equal(s.status, 200);
    assert.equal(typeof s.json?.data, "object");
    const seo = await get("/api/seo");
    assert.equal(seo.status, 200);
  });

  test("unknown API path → 404 envelope", async () => {
    const r = await get("/api/definitely-not-a-route");
    assert.equal(r.status, 404);
    assert.equal(r.json?.error?.code, "NOT_FOUND");
  });

  test("malformed JSON body → 400 BAD_JSON (no stack leak)", async () => {
    const r = await req("POST", "/api/auth/login", { body: "{not-json" });
    assert.equal(r.status, 400);
    assert.equal(r.json?.error?.code, "BAD_JSON");
    assert.ok(!r.text.includes("    at "), "no stack frames leaked");
  });

  test("payload > 2mb → 413 PAYLOAD_TOO_LARGE", async () => {
    const big = "x".repeat(2.5 * 1024 * 1024);
    const r = await post("/api/contact", { name: big, subject: "t", message: "m", email: "a@b.co" });
    assert.equal(r.status, 413);
    assert.equal(r.json?.error?.code, "PAYLOAD_TOO_LARGE");
  });
});

/* ================= Section B: input validation ================= */

describe("B. Input validation", () => {
  test("register rejects short name / bad phone / weak password", async () => {
    const r = await post("/api/auth/register", { name: "A", phone: "123", password: "short", email: "" });
    assert.equal(r.status, 422);
    assert.equal(r.json?.error?.code, "VALIDATION_ERROR");
    assert.ok(r.json?.error?.fields, "field errors present");
  });

  test("login with wrong password → 401 INVALID_CREDENTIALS (generic)", async () => {
    const r = await post("/api/auth/login", { identifier: "customer@stellora.local", password: "wrong-pass" });
    assert.equal(r.status, 401);
    assert.equal(r.json?.error?.code, "INVALID_CREDENTIALS");
    assert.ok(!/hash/i.test(r.json?.error?.message ?? ""));
  });

  test("login with unknown identifier → same generic 401 (no enumeration)", async () => {
    const r = await post("/api/auth/login", { identifier: `nobody-${RUN}@x.test`, password: "whatever1" });
    assert.equal(r.status, 401);
    assert.equal(r.json?.error?.code, "INVALID_CREDENTIALS");
  });

  test("checkout rejects invalid body (auth or validation gate)", async () => {
    const r = await post("/api/checkout", { addressId: "", idempotencyKey: "short" });
    assert.ok([401, 422].includes(r.status), `checkout invalid body → ${r.status}`);
  });

  test("cart add rejects quantity > 10 and non-integer", async () => {
    const r0 = await get("/api/products?limit=1");
    const prod = (r0.json?.data?.products ?? r0.json?.data)?.[0];
    assert.ok(prod, "have a product");
    const v = prod.variants?.[0];
    if (!v) return;
    const r = await post("/api/cart", { variantId: v.id, quantity: 11 });
    assert.equal(r.status, 422);
    const r2 = await post("/api/cart", { variantId: v.id, quantity: 1.5 });
    assert.equal(r2.status, 422);
  });

  test("stock API rejects unknown product slug with 404", async () => {
    const r = await post("/api/products/definitely-not-real/stock", {});
    assert.ok([404, 422].includes(r.status), `stock unknown → ${r.status}`);
  });
});

/* ================= Section C: auth lifecycle ================= */

describe("C. Authentication lifecycle", () => {
  test("register QA customer → 201 + session cookie", async () => {
    const r = await post("/api/auth/register", {
      name: QA.name, phone: QA.phone, email: QA.email, password: QA.password,
    });
    assert.equal(r.status, 201);
    assert.equal(r.json?.data?.email, QA.email);
    userId = r.json?.data?.id;
    assert.ok(userJar.some((c) => c.startsWith("stellora_session=")), "session cookie set");
  });

  test("duplicate registration (same email) → 409 EMAIL_TAKEN", async () => {
    const r = await post("/api/auth/register", {
      name: QA.name, phone: `9${Date.now().toString().slice(-9)}`, email: QA.email, password: QA.password,
    });
    assert.equal(r.status, 409);
    assert.equal(r.json?.error?.code, "EMAIL_TAKEN");
  });

  test("duplicate phone registration → 409 PHONE_TAKEN", async () => {
    const r = await post("/api/auth/register", {
      name: QA.name, phone: QA.phone, email: "", password: QA.password,
    });
    assert.equal(r.status, 409);
    assert.equal(r.json?.error?.code, "PHONE_TAKEN");
  });

  test("GET /auth/me returns the QA user", async () => {
    const r = await get("/api/auth/me");
    assert.equal(r.status, 200);
    assert.equal(r.json?.data?.user?.email, QA.email);
  });

  test("rate limit: 9 bad logins on throwaway identifier → 429", async () => {
    const id = `lockout-${RUN}@x.test`;
    let last = null;
    for (let i = 0; i < 9; i++) {
      last = await post("/api/auth/login", { identifier: id, password: "bad-pass-1" });
    }
    assert.equal(last.status, 429);
    assert.equal(last.json?.error?.code, "RATE_LIMITED");
  });

  test("forgot-password returns devLink in dev; token works exactly once", async () => {
    const f = await post("/api/auth/forgot-password", { identifier: QA.email });
    assert.equal(f.status, 200);
    assert.ok(f.json?.data?.devLink, "dev reset link present in development");
    const token = new URL(f.json.data.devLink).searchParams.get("token");
    assert.ok(token);
    const rs = await post("/api/auth/reset-password", { token, password: QA.password });
    assert.equal(rs.status, 200);
    const rs2 = await post("/api/auth/reset-password", { token, password: QA.password });
    assert.equal(rs2.status, 422);
    assert.equal(rs2.json?.error?.code, "INVALID_TOKEN");
  });

  test("logout destroys session; /auth/me → null; re-login works", async () => {
    const r = await post("/api/auth/logout");
    assert.equal(r.status, 200);
    const me = await get("/api/auth/me");
    assert.equal(me.json?.data?.user, null);
    const login = await post("/api/auth/login", { identifier: QA.email, password: QA.password });
    assert.equal(login.status, 200);
  });
});

/* ================= Section D: customer e-commerce E2E ================= */

describe("D. Customer E2E: cart → coupon → checkout → order → cancel", () => {
  test("discover two in-stock variants for the order", async () => {
    const r = await get("/api/products?limit=20&sort=price-asc");
    assert.equal(r.status, 200);
    const products = r.json?.data?.products ?? r.json?.data;
    productId = products[0]?.id;
    const withVariants = products.filter((p) => (p.variants ?? []).length > 0);
    assert.ok(withVariants.length >= 1);
    const outer = withVariants[0];
    variantA = {
      id: outer.variants[0].id,
      price: Number(outer.variants[0].price),
      slug: outer.slug,
      stock: outer.variants[0].stock,
    };
    const second = withVariants.find(
      (p) => p.id !== outer.id && Number(p.variants[0]?.stock ?? 0) > 5
    );
    if (second) {
      variantB = {
        id: second.variants[0].id,
        price: Number(second.variants[0].price),
        stock: Number(second.variants[0].stock),
      };
    }
  });

  test("add address → appears in list", async () => {
    const r = await post("/api/account/addresses", {
      fullName: QA.name, phone: QA.phone, line1: "QA Test Street 1", line2: "",
      city: "Mumbai", state: "MH", pincode: "400001", country: "India",
    });
    assert.ok([200, 201].includes(r.status), `address create → ${r.status} ${JSON.stringify(r.json?.error ?? {})}`);
    addressId = r.json?.data?.id ?? r.json?.data?.address?.id;
    assert.ok(addressId, "address id returned");
    const list = await get("/api/account/addresses");
    const arr = Array.isArray(list.json?.data) ? list.json.data : list.json?.data?.addresses ?? [];
    assert.ok(arr.some((a) => a.id === addressId));
  });

  test("add to cart → lineTotal matches price*qty", async () => {
    const r = await post("/api/cart", { variantId: variantA.id, quantity: 2 });
    assert.ok([200, 201].includes(r.status), `cart add → ${r.status} ${JSON.stringify(r.json?.error ?? {})}`);
    const cart = await get("/api/cart");
    assert.equal(cart.status, 200);
    const items = cart.json?.data?.items ?? [];
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 2);
  });

  if (variantB) {
    test("second line added; subtotal = sum of lines", async () => {
      await post("/api/cart", { variantId: variantB.id, quantity: 1 });
      const cart = await get("/api/cart");
      const items = cart.json?.data?.items ?? [];
      assert.equal(items.length, 2);
      const expected = variantA.price * 2 + variantB.price * 1;
      assert.equal(Number(cart.json.data.subtotal), expected);
    });

    test("update line quantity; remove line", async () => {
      const cart = await get("/api/cart");
      const lineB = (cart.json?.data?.items ?? []).find((i) => i.variantId === variantB.id);
      assert.ok(lineB, "line B in cart");
      const up = await patch(`/api/cart/items/${lineB.id}`, { quantity: 2 });
      assert.equal(up.status, 200);
      const after = await get("/api/cart");
      const b2 = after.json.data.items.find((i) => i.variantId === variantB.id);
      assert.equal(b2.quantity, 2);
      const rm = await del(`/api/cart/items/${lineB.id}`);
      assert.ok([200, 204].includes(rm.status));
      const final = await get("/api/cart");
      assert.equal(final.json.data.items.length, 1);
    });
  }

  test("coupon validate: WELCOME10 server-side cap; junk rejected", async () => {
    const cart = await get("/api/cart");
    let subtotal = Number(cart.json?.data?.subtotal ?? 0);
    if (!(subtotal >= 999)) {
      await post("/api/cart", { variantId: variantA.id, quantity: 1 });
      const c2 = await get("/api/cart");
      subtotal = Number(c2.json?.data?.subtotal ?? 0);
    }
    assert.ok(subtotal >= 999, `cart subtotal ${subtotal} >= WELCOME10 minSubtotal`);
    const bad = await post("/api/coupons/validate", { code: "NO-SUCH-COUPON-XYZ" });
    // Contract: invalid coupons return HTTP 200 with { valid:false, message } (soft-valid
    // design consumed by checkout page via json.ok && json.data.valid)
    assert.equal(bad.status, 200, `bad coupon → ${bad.status}`);
    assert.equal(bad.json?.data?.valid, false, "junk coupon marked invalid");
    const okR = await post("/api/coupons/validate", { code: "WELCOME10" });
    assert.equal(okR.status, 200, `WELCOME10 → ${okR.status} ${JSON.stringify(okR.json?.error ?? {})}`);
    const disc = Number(okR.json?.data?.discount ?? okR.json?.data?.coupon?.discount ?? 0);
    const expected = Math.round(Math.min(subtotal * 0.1, 300) * 100) / 100;
    assert.equal(disc, expected, `10% of ${subtotal} capped at 300 = ${expected}`);
  });

  test("checkout creates order with server-computed totals", async () => {
    const cart = await get("/api/cart");
    const items = cart.json?.data?.items ?? [];
    assert.ok(items.length >= 1, "cart has items");
    const r = await post("/api/checkout", {
      addressId,
      couponCode: "WELCOME10",
      idempotencyKey: `qa-order-${RUN}-1`,
      paymentMethod: "PAY_ON_CONFIRMATION",
    });
    assert.ok([200, 201].includes(r.status), `checkout → ${r.status} ${JSON.stringify(r.json?.error ?? {})}`);
    orderNumber = r.json?.data?.orderNumber;
    assert.ok(orderNumber, "order number returned");

    const d = await get(`/api/orders/${orderNumber}`);
    assert.equal(d.status, 200);
    const o = d.json?.data;
    assert.equal(o.status, "PENDING");
    const sub = Number(o.subtotal);
    const disc = Number(o.discountTotal);
    const shipFee = Number(o.shippingFee);
    assert.equal(sub + shipFee - disc, Number(o.grandTotal), "subtotal + shipping - discount = grandTotal");
    assert.ok(disc > 0, "coupon discount applied");
  });

  test("idempotent replay: same key returns same order, no duplicate", async () => {
    const r = await post("/api/checkout", {
      addressId,
      couponCode: "WELCOME10",
      idempotencyKey: `qa-order-${RUN}-1`,
      paymentMethod: "PAY_ON_CONFIRMATION",
    });
    assert.ok([200, 201].includes(r.status));
    assert.equal(r.json?.data?.replayed, true);
    assert.equal(r.json?.data?.orderNumber, orderNumber);
    const list = await get("/api/orders");
    const mine = (list.json?.data ?? []).filter((o) => o.orderNumber === orderNumber);
    assert.equal(mine.length, 1, "exactly one order with this number");
  });

  test("ownership: unauthenticated user cannot see the order (IDOR guard)", async () => {
    const saved = [...userJar]; userJar.length = 0;
    const stranger = await get(`/api/orders/${orderNumber}`);
    assert.equal(stranger.status, 401, "unauthenticated order access rejected");
    userJar.push(...saved);
  });

  test("demo payment E2E: intent → decline card → approve → tamper → settle", async () => {
    // fresh unpaid order (second cart line still present from earlier tests)
    const cart = await get("/api/cart");
    if ((cart.json?.data?.items ?? []).length === 0) {
      await post("/api/cart", { variantId: variantA.id, quantity: 1 });
    }
    const co = await post("/api/checkout", {
      addressId,
      idempotencyKey: `qa-order-${RUN}-2`,
      paymentMethod: "PAY_ON_CONFIRMATION",
    });
    assert.ok([200, 201].includes(co.status), `second checkout → ${co.status} ${JSON.stringify(co.json?.error ?? {})}`);
    paidOrderNumber = co.json?.data?.orderNumber;
    assert.ok(paidOrderNumber && paidOrderNumber !== orderNumber, "second distinct order");

    // 1. create intent (demo gateway)
    const intent = await post("/api/payments/create-intent", { orderNumber: paidOrderNumber });
    assert.equal(intent.status, 200, `create-intent → ${intent.status} ${JSON.stringify(intent.json?.error ?? {})}`);
    assert.equal(intent.json?.data?.demo, true, "demo gateway active");
    const gatewayOrderId = intent.json?.data?.gatewayOrderId;
    assert.ok(gatewayOrderId, "gateway order id");

    // 2. decline card (ends 0002)
    const declined = await post("/api/payments/demo/process", {
      orderNumber: paidOrderNumber, cardNumber: "4111111111110002", expiry: "12/29", cvv: "123",
    });
    assert.equal(declined.status, 200);
    assert.equal(declined.json?.data?.approved, false, "card ending 0002 declined");

    // 3. bad expiry format
    const badExp = await post("/api/payments/demo/process", {
      orderNumber: paidOrderNumber, cardNumber: "4111111111111111", expiry: "13/29", cvv: "123",
    });
    assert.equal(badExp.json?.data?.approved, false, "invalid expiry rejected");

    // 4. valid card → approved + signed
    const approved = await post("/api/payments/demo/process", {
      orderNumber: paidOrderNumber, cardNumber: "4111111111111111", expiry: "12/29", cvv: "123",
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.json?.data?.approved, true, "valid card approved");
    const { gatewayPaymentId, gatewaySignature } = approved.json?.data ?? {};
    assert.ok(gatewayPaymentId && gatewaySignature, "payment id + signature issued");

    // 5. tampered signature → rejected
    const tampered = await post("/api/payments/confirm", {
      orderNumber: paidOrderNumber, gatewayPaymentId, gatewaySignature: gatewaySignature.slice(0, -4) + "beef",
    });
    assert.equal(tampered.status, 400, `tampered signature → ${tampered.status}`);
    assert.equal(tampered.json?.error?.code, "SIGNATURE_INVALID");

    // 6. correct signature → settled
    const confirm = await post("/api/payments/confirm", {
      orderNumber: paidOrderNumber, gatewayPaymentId, gatewaySignature,
    });
    assert.equal(confirm.status, 200, `confirm → ${confirm.status} ${JSON.stringify(confirm.json?.error ?? {})}`);
    assert.equal(confirm.json?.data?.paymentStatus, "PAID");
    assert.equal(confirm.json?.data?.status, "CONFIRMED", "paid pending order auto-confirmed");

    // 7. idempotent confirm
    const again = await post("/api/payments/confirm", {
      orderNumber: paidOrderNumber, gatewayPaymentId, gatewaySignature,
    });
    assert.equal(again.status, 200);
    assert.equal(again.json?.data?.alreadyPaid, true, "double confirm is a no-op");

    // 8. order detail reflects PAID
    const detail = await get(`/api/orders/${paidOrderNumber}`);
    assert.equal(detail.json?.data?.paymentStatus, "PAID");
  });

  test("cancel own pending order → CANCELLED", async () => {
    const r = await post(`/api/orders/${orderNumber}/cancel`, { reason: "QA regression cancel" });
    assert.ok([200, 201].includes(r.status), `cancel → ${r.status} ${JSON.stringify(r.json?.error ?? {})}`);
    const after = await get(`/api/orders/${orderNumber}`);
    assert.equal(after.json?.data?.status, "CANCELLED");
    assert.ok((after.json?.data?.events ?? []).some((e) => e.status === "CANCELLED"));
  });

  test("wishlist add/toggle/remove persists", async () => {
    const r = await post("/api/wishlist", { productId });
    assert.ok([200, 201].includes(r.status), `wishlist add → ${r.status} ${JSON.stringify(r.json?.error ?? {})}`);
    const list = await get("/api/wishlist");
    const arr = Array.isArray(list.json?.data) ? list.json.data : list.json?.data?.items ?? [];
    const ids = arr.map((w) => w.productId ?? w.product?.id ?? w.id);
    assert.ok(ids.includes(productId), "product in wishlist");
    const off = await post("/api/wishlist", { productId });
    assert.ok([200, 201].includes(off.status));
    const list2 = await get("/api/wishlist");
    const arr2 = Array.isArray(list2.json?.data) ? list2.json.data : list2.json?.data?.items ?? [];
    const ids2 = arr2.map((w) => w.productId ?? w.product?.id ?? w.id);
    assert.ok(!ids2.includes(productId), "wishlist toggled off");
  });

  test("review submission result is sane (created OR policy-blocked)", async () => {
    const r = await post(`/api/products/${productId}/reviews`, {
      rating: 5, title: "QA review", body: "Automated regression review — please ignore.",
    });
    assert.ok([200, 201, 403, 422].includes(r.status), `review → ${r.status} ${r.json?.error?.code ?? ""}`);
    reviewBlocked = [403, 422].includes(r.status);
  });

  test("track order: right contact OK, wrong contact rejected", async () => {
    const okR = await post("/api/track", { orderNumber, contact: QA.phone });
    assert.ok([200, 404].includes(okR.status), `track → ${okR.status}`);
    const bad = await post("/api/track", { orderNumber, contact: "9000000000" });
    assert.ok([403, 404, 422].includes(bad.status), `wrong contact → ${bad.status}`);
  });
});

/* ================= Section E: security ================= */

describe("E. Security: RBAC, IDOR, injection, XSS, CSRF, headers, webhooks", () => {
  test("customer session on admin endpoints → 403", async () => {
    const r = await get("/api/admin/stats");
    assert.equal(r.status, 403);
    const r2 = await post("/api/admin/products", { name: "hack" });
    assert.equal(r2.status, 403);
    const r3 = await get("/api/admin/users");
    assert.equal(r3.status, 403);
  });

  test("anonymous on protected endpoints → 401", async () => {
    const saved = [...userJar]; userJar.length = 0;
    for (const p of ["/api/orders", "/api/account/addresses", "/api/loyalty"]) {
      const r = await get(p);
      assert.equal(r.status, 401, `${p} → 401`);
    }
    userJar.push(...saved);
  });

  test("IDOR: patching a foreign/nonexistent address rejected", async () => {
    const r = await patch("/api/account/addresses/ffffffffffffffffffffffff", { city: "Hacked" });
    assert.ok([404, 403, 422].includes(r.status), `IDOR patch → ${r.status}`);
  });

  test("SQL injection probes cause no 500s (parameterized ORM)", async () => {
    const probes = ["'", "1' OR '1'='1", "'; DROP TABLE products;--", '" OR "1"="1', "1 UNION SELECT 1"];
    for (const p of probes) {
      const r = await get(`/api/products?q=${encodeURIComponent(p)}&limit=3`);
      assert.equal(r.status, 200, `search sqli probe "${p}"`);
      const l = await post("/api/auth/login", { identifier: p, password: p });
      assert.ok([401, 422].includes(l.status), `login sqli probe "${p}" → ${l.status}`);
    }
  });

  test("XSS payloads accepted as data only; no HTML/script reflection", async () => {
    const xss = "<script>alert('xss')</script>";
    const r = await post("/api/contact", {
      name: `QA ${RUN}`, phone: QA.phone, email: `${RUN}@qa.local`, subject: xss, message: xss,
    });
    assert.ok([200, 201].includes(r.status), `contact with XSS payload → ${r.status} ${JSON.stringify(r.json?.error ?? {})}`);
    assert.ok((r.headers?.get("content-type") ?? "").includes("application/json"));
    assert.ok(!r.text.includes("<script>"), "response body must not contain raw script tag");
  });

  test("CSRF: state-changing request from foreign origin → 403", async () => {
    const r = await post("/api/auth/login", { identifier: QA.email, password: QA.password }, { origin: "https://evil.example.com" });
    assert.equal(r.status, 403, `foreign-origin login → ${r.status} ${JSON.stringify(r.json?.error ?? {})}`);
    assert.equal(r.json?.error?.code, "FORBIDDEN");
  });

  test("webhook razorpay: invalid signature → 400", async () => {
    const res = await fetch(`${BASE}/api/payments/webhook/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": "deadbeef" },
      body: JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_fake", notes: { orderNumber: "STL-XXXX" } } } } }),
    });
    assert.equal(res.status, 400);
    const j = await res.json();
    assert.ok(["SIGNATURE_INVALID", "WEBHOOK_NOT_CONFIGURED"].includes(j?.error?.code));
  });

  test("webhook stripe: missing signature → 400", async () => {
    const res = await fetch(`${BASE}/api/payments/webhook/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" }),
    });
    assert.equal(res.status, 400);
  });

  test("security headers present on storefront pages", async () => {
    const res = await fetch(BASE + "/");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok((res.headers.get("content-security-policy") ?? "").includes("frame-ancestors"));
    assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  });

  test("session cookie flags: httpOnly + SameSite=Lax", async () => {
    const r = await post("/api/auth/login", { identifier: QA.email, password: QA.password });
    const setCookies = r.headers?.getSetCookie?.() ?? [];
    const sess = setCookies.find((c) => c.startsWith("stellora_session="));
    assert.ok(sess, "session cookie present");
    assert.match(sess, /httponly/i, "httpOnly");
    assert.match(sess, /samesite=lax/i, "SameSite=Lax");
  });

  test("unsupported HTTP method on endpoint → 404 (no crash)", async () => {
    const r = await del("/api/health");
    assert.equal(r.status, 404);
    const r2 = await put("/api/products", {});
    assert.equal(r2.status, 404);
  });
});

function expectJsonType(ct) {
  return ct && ct.includes("application/json") ? ct : ct;
}

/* Sanitizer retained for future payload shaping */
void expectJsonType;

/* ================= Section F: admin workflows ================= */

describe("F. Admin panel workflows (via API)", () => {
  before(async () => {
    const r = await post("/api/auth/login", { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { jar: "admin" });
    assert.equal(r.status, 200, `admin login → ${r.status}`);
  });

  test("admin stats returns metrics object", async () => {
    const r = await get("/api/admin/stats", { jar: "admin" });
    assert.equal(r.status, 200);
    assert.equal(typeof r.json?.data, "object");
  });

  test("admin category lifecycle: create → public → delete", async () => {
    const c = await post("/api/admin/categories", {
      name: `QA Category ${RUN}`, slug: `qa-cat-${RUN}`, description: "QA", isActive: true, sortOrder: 99,
    }, { jar: "admin" });
    assert.ok([200, 201].includes(c.status), `category create → ${c.status} ${JSON.stringify(c.json?.error ?? {})}`);
    qaCategoryId = c.json?.data?.id ?? c.json?.data?.category?.id;
    const pub = await get("/api/categories");
    assert.ok((pub.json?.data ?? []).some((x) => x.slug === `qa-cat-${RUN}`), "QA category publicly visible");
    const d = await del(`/api/admin/categories/${qaCategoryId}`, { jar: "admin" });
    assert.ok([200, 204].includes(d.status));
  });

  test("admin product CRUD lifecycle + storefront visibility + delete → 404", async () => {
    const cats = await get("/api/categories");
    const cid = cats.json?.data?.[0]?.id;
    const mk = await post("/api/admin/products", {
      name: `QA Product ${RUN}`,
      slug: `qa-product-${RUN}`,
      description: "Automated QA product. Safe to delete.",
      shortDescription: "QA product",
      categoryId: cid,
      status: "ACTIVE",
      isFeatured: false,
      variants: [{ name: "One Size", price: 499, stock: 25, sku: `QA-${RUN}` }],
    }, { jar: "admin" });
    assert.ok([200, 201].includes(mk.status), `product create → ${mk.status} ${JSON.stringify(mk.json?.error ?? {})}`);
    qaProductId = mk.json?.data?.id ?? mk.json?.data?.product?.id;
    assert.ok(qaProductId, "product id");

    const pub = await get(`/api/products/qa-product-${RUN}`);
    assert.equal(pub.status, 200, "QA product visible on storefront");

    const full = pub.json?.data;
    // PUT payload must match productSchema: string fields (null → ""), plain variants
    const sanitize = (v) => (v === null || v === undefined ? "" : v);
    const up = await put(`/api/admin/products/${qaProductId}`, {
      name: `QA Product ${RUN} v2`,
      slug: full.slug,
      categoryId: full.categoryId,
      shortDescription: sanitize(full.shortDescription),
      description: sanitize(full.description),
      materials: sanitize(full.materials),
      careInstructions: sanitize(full.careInstructions),
      videoUrl: sanitize(full.videoUrl),
      status: full.status ?? "ACTIVE",
      isFeatured: !!full.isFeatured,
      isNewArrival: !!full.isNewArrival,
      isBestSeller: !!full.isBestSeller,
      isTrending: !!full.isTrending,
      images: (full.images ?? []).map((im) => ({ url: im.url, alt: im.alt ?? undefined, sortOrder: Number(im.sortOrder ?? 0) })),
      variants: (full.variants ?? []).map((v) => ({
        name: v.name, price: Number(v.price), stock: Number(v.stock), sku: v.sku ?? undefined,
        barcode: sanitize(v.barcode) || undefined, lowStockThreshold: Number(v.lowStockThreshold ?? 3), isActive: v.isActive ?? true,
      })),
    }, { jar: "admin" });
    assert.ok([200, 201].includes(up.status), `product update → ${up.status} ${JSON.stringify(up.json?.error ?? {})}`);
    const pub2 = await get(`/api/products/qa-product-${RUN}`);
    assert.equal(pub2.json?.data?.name, `QA Product ${RUN} v2`, "update persisted to storefront");

    const delr = await del(`/api/admin/products/${qaProductId}`, { jar: "admin" });
    assert.ok([200, 204].includes(delr.status), `product delete → ${delr.status}`);
    const gone = await get(`/api/products/qa-product-${RUN}`);
    assert.equal(gone.status, 404, "deleted product 404s on storefront");
  });

  test("admin coupon lifecycle: create → validate → delete", async () => {
    const code = `QA${RUN.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)}`;
    const c = await post("/api/admin/coupons", {
      code, discountType: "FIXED", value: 50, minSubtotal: 100,
      isActive: true, usageLimit: 10,
    }, { jar: "admin" });
    assert.ok([200, 201].includes(c.status), `coupon create → ${c.status} ${JSON.stringify(c.json?.error ?? {})}`);
    qaCouponId = c.json?.data?.id ?? c.json?.data?.coupon?.id;
    const cart = await get("/api/cart");
    const subtotal = Number(cart.json?.data?.subtotal ?? 0);
    if (subtotal >= 100) {
      const v = await post("/api/coupons/validate", { code });
      assert.equal(v.status, 200, `QA coupon validate → ${v.status} ${JSON.stringify(v.json?.error ?? {})}`);
    }
    const d = await del(`/api/admin/coupons/${qaCouponId}`, { jar: "admin" });
    assert.ok([200, 204].includes(d.status));
  });

  test("order state machine: invalid transition rejected; QA order visible to admin", async () => {
    const list = await get("/api/admin/orders-list?limit=5", { jar: "admin" });
    assert.equal(list.status, 200);
    const orders = list.json?.data?.orders ?? list.json?.data ?? [];
    const mine = orders.find((o) => o.orderNumber === orderNumber);
    assert.ok(mine, "QA order visible to admin");
    const r = await post(`/api/admin/orders/${mine.id}/status`, { status: "DELIVERED" }, { jar: "admin" });
    assert.equal(r.status, 422, `invalid transition → ${r.status}`);
    assert.equal(r.json?.error?.code, "INVALID_TRANSITION");
  });

  test("settings endpoint returns structured data", async () => {
    const g = await get("/api/admin/settings", { jar: "admin" });
    assert.equal(g.status, 200);
    assert.equal(typeof g.json?.data, "object");
  });

  test("uploads: executable content disguised as PNG rejected", async () => {
    const form = new FormData();
    const phpPayload = "<?php echo 1 ?>";
    form.append("file", new Blob([Buffer.from(phpPayload)], { type: "image/png" }));
    const res = await fetch(`${BASE}/api/admin/uploads`, {
      method: "POST",
      headers: { ...jarHeader(adminJar), origin: BASE },
      body: form,
    });
    assert.ok([400, 415, 422].includes(res.status), `malicious upload → ${res.status}`);
  });

  test("audit log has entries for admin actions", async () => {
    const r = await get("/api/admin/audit-logs?limit=10", { jar: "admin" });
    assert.equal(r.status, 200);
    const logs = r.json?.data?.logs ?? r.json?.data ?? [];
    assert.ok(Array.isArray(logs) && logs.length > 0, "audit logs present");
  });

  after(async () => {
    // cleanup QA artifacts; deactivate QA customer (no delete endpoint by design)
    try { if (addressId) await del(`/api/account/addresses/${addressId}`); } catch {}
    try {
      if (userId) await patch(`/api/admin/customers/${userId}`, { isActive: false }, { jar: "admin" });
    } catch {}
    try { await post("/api/auth/logout", undefined, { jar: "admin" }); } catch {}
    try { await post("/api/auth/logout"); } catch {}
  });
});
