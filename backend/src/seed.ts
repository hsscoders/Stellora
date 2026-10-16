/**
 * Stellora development seed (MongoDB) — FICTIONAL DATA, clearly labelled.
 * Run: bun src/seed.ts
 */
import mongoose from "mongoose";
import { randomBytes, scrypt as _scrypt } from "crypto";
import { promisify } from "util";
import { User, Category, Product, ShippingRate, Coupon, HomepageBanner, SiteSetting } from "./models";
import { products, type SeedProduct } from "./data/products";

const scrypt = promisify(_scrypt) as (p: string, s: string, k: number) => Promise<Buffer>;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

const IMG = (name: string) => `/images/products/${name}.jpg`;
const BANNER = (name: string) => `/images/banners/${name}.jpg`;

async function main() {
  const uri = process.env.MONGODB_URI ?? process.env.MONGODB_LOCAL_FALLBACK ?? "mongodb://127.0.0.1:27017/stellora";
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log("Seeding Stellora development database (FICTIONAL DATA)...");
  console.log("All products, prices, stock and people below are sample data for development only.\n");

  // ---------- Users ----------
  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || "admin@stellora.local";
  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "StelloraAdmin#2026";
  const custEmail = process.env.DEMO_CUSTOMER_EMAIL || "customer@stellora.local";
  const custPassword = process.env.DEMO_CUSTOMER_PASSWORD || "Customer#2026";

  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await User.create({
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      name: "Store Administrator",
      role: "ADMIN",
    });
  }
  const existingCustomer = await User.findOne({ email: custEmail });
  let customer = existingCustomer;
  if (!customer) {
    customer = await User.create({
      email: custEmail,
      passwordHash: await hashPassword(custPassword),
      name: "Demo Customer",
      phone: "9800000000",
      role: "CUSTOMER",
    });
  }
  if ((customer.addresses ?? []).length === 0) {
    await User.updateOne(
      { _id: customer._id },
      {
        $push: {
          addresses: {
            fullName: "Demo Customer",
            phone: "9800000000",
            line1: "12 Sample Residency, Model Town",
            city: "Sample City",
            state: "Punjab",
            pincode: "140001",
            country: "India",
            isDefault: true,
          },
        },
      }
    );
  }
  console.log(`✓ Admin: ${adminEmail} / (password from env)`);
  console.log(`✓ Demo customer: ${custEmail} / (password from env)`);

  // ---------- Categories ----------
  const catData = [
    {
      slug: "jewellery",
      name: "Jewellery",
      description:
        "Sterling silver and artificial jewellery — necklaces, earrings, rings and bangles finished for everyday elegance.",
      imageUrl: BANNER("category-jewellery"),
      sortOrder: 1,
    },
    {
      slug: "hair-extensions",
      name: "Hair Extensions",
      description:
        "Clip-ins, weaves and bundles in natural shades, matched for a seamless blend.",
      imageUrl: BANNER("category-hair"),
      sortOrder: 2,
    },
    {
      slug: "vanity",
      name: "Vanity",
      description:
        "Curated beauty and self-care essentials — lipsticks, serums, mirrors and more.",
      imageUrl: BANNER("category-vanity"),
      sortOrder: 3,
    },
    {
      slug: "handbags",
      name: "Handbags",
      description:
        "Structured totes, slings and clutches in premium finishes for every occasion.",
      imageUrl: BANNER("category-handbags"),
      sortOrder: 4,
    },
  ];
  const catMap = new Map<string, string>();
  for (const c of catData) {
    const doc = await Category.findOneAndUpdate({ slug: c.slug }, { $set: c }, { new: true, upsert: true });
    catMap.set(c.slug, String(doc!._id));
  }
  console.log("✓ 4 categories");

  // ---------- Products (fictional) ----------
  const seedProducts = products as SeedProduct[];
  for (const p of seedProducts) {
    const doc = await Product.findOne({ slug: p.slug });
    if (doc) continue; // idempotent seed — never overwrite live data
    await Product.create({
      slug: p.slug,
      categoryId: catMap.get(p.cat),
      name: p.name,
      shortDescription: p.short,
      description: p.desc,
      materials: p.materials ?? null,
      careInstructions: p.care ?? null,
      status: "ACTIVE",
      isFeatured: !!p.featured,
      isNewArrival: !!p.fresh,
      isBestSeller: !!p.best,
      images: [{ url: IMG(p.slug), alt: p.name, sortOrder: 0 }],
      variants: p.variants.map((v) => ({
        name: v.name,
        sku: v.sku.toUpperCase(),
        price: v.price,
        compareAtPrice: v.compareAt ?? null,
        stock: v.stock,
        lowStockThreshold: 5,
        isActive: true,
      })),
    });
  }
  console.log(`✓ ${seedProducts.length} products with variants (existing products skipped)`);

  // ---------- Shipping ----------
  if ((await ShippingRate.countDocuments()) === 0) {
    await ShippingRate.create({
      name: "Standard Delivery",
      baseFee: 79,
      freeAbove: 1999,
      sortOrder: 0,
      isActive: true,
    });
  }
  console.log("✓ Shipping rate (sample configuration — replace with actual rates)");

  // ---------- Coupons ----------
  const coupons = [
    {
      code: "WELCOME10",
      description: "10% off for first orders (sample)",
      discountType: "PERCENT" as const,
      value: 10,
      minSubtotal: 999,
      maxDiscount: 300,
      perUserLimit: 1,
      usageLimit: 500,
    },
    {
      code: "FLAT200",
      description: "Flat Rs.200 off above Rs.2,499 (sample)",
      discountType: "FIXED" as const,
      value: 200,
      minSubtotal: 2499,
      perUserLimit: 2,
      usageLimit: 300,
    },
  ];
  for (const c of coupons) {
    await Coupon.updateOne({ code: c.code }, { $setOnInsert: { ...c, timesUsed: 0, redemptions: [] } }, { upsert: true });
  }
  console.log("✓ 2 sample coupons");

  // ---------- Banners ----------
  const banners = [
    {
      title: "The Aurelia Edit",
      subtitle: "Sterling silver, styled for every day — now in shimmering new finishes.",
      imageUrl: BANNER("hero-main"),
      ctaLabel: "Shop Jewellery",
      ctaHref: "/category/jewellery",
      sortOrder: 0,
    },
    {
      title: "Carry the Light",
      subtitle: "Structured totes and evening clutches in premium finishes.",
      imageUrl: BANNER("promo-handbags"),
      ctaLabel: "Explore Handbags",
      ctaHref: "/category/handbags",
      sortOrder: 1,
    },
  ];
  if ((await HomepageBanner.countDocuments()) === 0) {
    await HomepageBanner.insertMany(banners);
  }
  console.log("✓ Homepage banners");

  // ---------- Site settings ----------
  const settings: Record<string, string> = {
    announcement: "Complimentary shipping on orders above ₹1,999 (sample configuration)",
    contact_email: "",
    contact_phone: "",
    address_line1: "",
    address_city: "",
    store_hours: "",
    instagram: "",
    facebook: "",
    whatsapp: "",
    shipping_note:
      "Orders are dispatched after confirmation. Delivery timelines depend on your pincode and will be shown at checkout once configured by the store.",
    return_note:
      "Returns and exchanges are accepted under the store's policy. Please review the policy page; the final terms will be published by the store owner.",
  };
  for (const [key, value] of Object.entries(settings)) {
    await SiteSetting.updateOne({ key }, { $setOnInsert: { value } }, { upsert: true });
  }
  console.log("✓ Site settings (contact details intentionally blank — owner must configure)");

  console.log("\nDone. All seed data is FICTIONAL and for development only.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
