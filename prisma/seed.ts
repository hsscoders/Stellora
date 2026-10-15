/**
 * Stellora development seed — FICTIONAL DATA, clearly labelled.
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as _scrypt } from "crypto";
import { promisify } from "util";

const scrypt = promisify(_scrypt) as (p: string, s: string, k: number) => Promise<Buffer>;
const db = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

const IMG = (name: string) => `/images/products/${name}.jpg`;
const BANNER = (name: string) => `/images/banners/${name}.jpg`;

async function main() {
  console.log("Seeding Stellora development database (FICTIONAL DATA)...");
  console.log("All products, prices, stock and people below are sample data for development only.\n");

  // ---------- Users ----------
  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || "admin@stellora.local";
  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "StelloraAdmin#2026";
  const custEmail = process.env.DEMO_CUSTOMER_EMAIL || "customer@stellora.local";
  const custPassword = process.env.DEMO_CUSTOMER_PASSWORD || "Customer#2026";

  const admin = await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      name: "Store Administrator",
      role: "ADMIN",
    },
  });
  const customer = await db.user.upsert({
    where: { email: custEmail },
    update: {},
    create: {
      email: custEmail,
      passwordHash: await hashPassword(custPassword),
      name: "Demo Customer",
      phone: "9800000000",
      role: "CUSTOMER",
    },
  });
  await db.address.upsert({
    where: { id: "seed-address-1" },
    update: {},
    create: {
      id: "seed-address-1",
      userId: customer.id,
      fullName: "Demo Customer",
      phone: "9800000000",
      line1: "12 Sample Residency, Model Town",
      city: "Sample City",
      state: "Punjab",
      pincode: "140001",
      isDefault: true,
    },
  });
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
  const cats: Record<string, { id: string }> = {};
  for (const c of catData) {
    cats[c.slug] = await db.category.upsert({
      where: { slug: c.slug },
      update: { ...c },
      create: c,
    });
  }
  console.log("✓ 4 categories");

  // ---------- Products (fictional) ----------
  type P = {
    slug: string;
    cat: string;
    name: string;
    short: string;
    desc: string;
    materials?: string;
    care?: string;
    featured?: boolean;
    best?: boolean;
    fresh?: boolean;
    variants: { name: string; sku: string; price: number; compareAt?: number; stock: number }[];
  };

  const products: P[] = [
    // ---- Jewellery ----
    {
      slug: "aurelia-silver-pendant-necklace",
      cat: "jewellery",
      name: "Aurelia Silver Pendant Necklace",
      short: "A delicate 92.5 sterling silver pendant on a fine cable chain, made for daily layering.",
      desc: "The Aurelia pendant pairs a hand-polished teardrop charm with a whisper-light cable chain. Rhodium plating resists tarnish, and the spring-ring clasp sits flat against the collarbone. Wear it alone for quiet elegance or layered with longer chains.",
      materials: "92.5 sterling silver, rhodium plated. Nickel free.",
      care: "Wipe with a soft cloth after wear. Keep away from perfume and water. Store in the pouch provided.",
      featured: true,
      fresh: true,
      variants: [
        { name: '16" Chain', sku: "JWL-AUR-P16", price: 1499, compareAt: 1899, stock: 24 },
        { name: '18" Chain', sku: "JWL-AUR-P18", price: 1599, compareAt: 1999, stock: 18 },
      ],
    },
    {
      slug: "celeste-pearl-drop-earrings",
      cat: "jewellery",
      name: "Celeste Pearl Drop Earrings",
      short: "Freshwater-style pearl drops suspended from sterling silver hooks.",
      desc: "Celeste catches light with every turn — a single luminous pearl drop hung from a slender silver hook. Featherlight for all-day wear, from boardroom to banquet.",
      materials: "Shell pearl, 92.5 sterling silver hooks.",
      care: "Store flat in the box. Avoid contact with cosmetics.",
      featured: true,
      best: true,
      variants: [{ name: "One Size", sku: "JWL-CEL-E01", price: 899, compareAt: 1199, stock: 40 }],
    },
    {
      slug: "ivanna-gold-bangle-set",
      cat: "jewellery",
      name: "Ivanna Gold Bangle Set",
      short: "A set of four textured bangles in a warm champagne-gold finish.",
      desc: "Ivanna stacks four molten-gold tones with a satin-brushed texture that reads luxury at every angle. Hinged edges keep the set comfortably snug through long evenings.",
      materials: "Brass base, 18k champagne-gold plating.",
      care: "Remove before washing hands. Buff gently with the jewellery cloth.",
      fresh: true,
      variants: [
        { name: "2.4 Diameter", sku: "JWL-IVN-B24", price: 1299, stock: 30 },
        { name: "2.6 Diameter", sku: "JWL-IVN-B26", price: 1299, stock: 26 },
      ],
    },
    {
      slug: "solene-silver-ring",
      cat: "jewellery",
      name: "Solène Twisted Silver Ring",
      short: "A sculptural twisted band in polished sterling silver.",
      desc: "Solène's intertwined form catches light along every ridge. A quiet statement on its own, or the anchor of a stacked set.",
      materials: "92.5 sterling silver.",
      care: "Polish with a silver cloth; store airtight when not in use.",
      variants: [
        { name: "Size 6", sku: "JWL-SOL-R06", price: 999, stock: 15 },
        { name: "Size 7", sku: "JWL-SOL-R07", price: 999, stock: 20 },
        { name: "Size 8", sku: "JWL-SOL-R08", price: 999, stock: 12 },
      ],
    },
    {
      slug: "marisol-choker-set",
      cat: "jewellery",
      name: "Marisol Layered Choker Set",
      short: "Three graduated chains in one clasp — an instant layered look.",
      desc: "Marisol does the layering for you: three graduating chains united at a single clasp so the set never tangles. Champagne-gold finish warms every neckline.",
      materials: "Brass base, gold-tone plating.",
      care: "Keep dry; wipe after wear.",
      best: true,
      variants: [{ name: "One Size", sku: "JWL-MAR-C01", price: 1199, compareAt: 1599, stock: 22 }],
    },
    // ---- Hair Extensions ----
    {
      slug: "velvet-clip-in-extensions-18",
      cat: "hair-extensions",
      name: "Velvet Clip-In Extensions — 18 inch",
      short: "Seven-piece clip-in set with a soft, natural fall and secure grip.",
      desc: "Velvet's seven-piece set adds length and body in minutes. Double-wefted for fullness with a soft matte fiber that blends with natural texture. Silicone-backed clips grip firmly without pulling.",
      materials: "Heat-resistant synthetic fiber (up to 160°C).",
      care: "Detangle before and after wear. Wash every 8–10 wears with cool water. Air dry flat.",
      featured: true,
      best: true,
      variants: [
        { name: "Natural Black", sku: "HAI-VEL-18-BLK", price: 1899, compareAt: 2399, stock: 25 },
        { name: "Dark Brown", sku: "HAI-VEL-18-BRN", price: 1899, compareAt: 2399, stock: 21 },
      ],
    },
    {
      slug: "sera-bun-extension",
      cat: "hair-extensions",
      name: "Séra Messy Bun Extension",
      short: "An instantly polished updo with an elastic drawstring fit.",
      desc: "Séra wraps into a soft, tousled bun with a drawstring that adjusts to your base. The piece holds shape through long days and dances alike.",
      materials: "Heat-resistant synthetic fiber.",
      care: "Store on the stand provided; refresh with a light mist.",
      fresh: true,
      variants: [
        { name: "Natural Black", sku: "HAI-SER-BUN-BLK", price: 999, stock: 18 },
        { name: "Medium Brown", sku: "HAI-SER-BUN-BRN", price: 999, stock: 15 },
      ],
    },
    {
      slug: "luna-front-lace-bangs",
      cat: "hair-extensions",
      name: "Luna Front Lace Bangs",
      short: "A feathered fringe piece that clips in for an instant change.",
      desc: "Luna's lace base melts into the hairline for a fringe that looks grown, not clipped. Trim to taste and clip out at night.",
      materials: "Synthetic fiber with lace base.",
      care: "Trim carefully with sharp scissors. Keep away from high heat.",
      variants: [{ name: "Natural Black", sku: "HAI-LUN-BNG-BLK", price: 749, stock: 30 }],
    },
    // ---- Vanity ----
    {
      slug: "rouge-velvet-lipstick",
      cat: "vanity",
      name: "Rouge Velvet Lipstick",
      short: "A weightless matte with a blurred velvet finish and eight-hour wear.",
      desc: "Rouge glides on as a cream and sets to a soft matte that never cracks. Pigment-saturated in one stroke, with a comfortable blend of oils that keeps lips cushioned all day.",
      materials: "Paraben-free formula.",
      care: "Store away from direct sunlight.",
      featured: true,
      best: true,
      variants: [
        { name: "Rosewood 02", sku: "VAN-ROU-L02", price: 649, stock: 35 },
        { name: "Classic Red 05", sku: "VAN-ROU-L05", price: 649, stock: 28 },
        { name: "Nude Taupe 09", sku: "VAN-ROU-L09", price: 649, stock: 31 },
      ],
    },
    {
      slug: "glow-rite-serum",
      cat: "vanity",
      name: "Glow-Rite Vitamin C Serum",
      short: "A brightening daily serum with a lightweight, fast-absorbing finish.",
      desc: "Glow-Rite layers a stabilized vitamin C blend with hydrating glycerin for a lit-from-within look. One dropper each morning, before moisturizer.",
      materials: "30 ml. Dermatologically tested formula.",
      care: "Use within 6 months of opening. Store cool and dark.",
      fresh: true,
      variants: [{ name: "30 ml", sku: "VAN-GLW-S30", price: 899, compareAt: 1099, stock: 26 }],
    },
    {
      slug: "lumiere-vanity-mirror",
      cat: "vanity",
      name: "Lumière LED Vanity Mirror",
      short: "A dual-sided mirror with soft LED halo and touch dimming.",
      desc: "Lumière flatters every skin tone with a diffused LED halo. Flip to the 5× magnification for detail work, and dim with a fingertip for evening light.",
      materials: "Glass, brushed metal frame. USB rechargeable.",
      care: "Clean glass with a microfiber cloth.",
      variants: [{ name: "One Size", sku: "VAN-LUM-M01", price: 1699, compareAt: 2199, stock: 14 }],
    },
    {
      slug: "blush-atelier-brush-set",
      cat: "vanity",
      name: "Blush Atelier Brush Set",
      short: "Six vegan brushes with champagne-gold ferrules and a travel pouch.",
      desc: "Blush Atelier pairs silky vegan bristles with weighted gold-tone ferrules for balance and control. The pouch doubles as a stand.",
      materials: "Synthetic (vegan) bristles.",
      care: "Wash with gentle soap; dry flat.",
      best: true,
      variants: [{ name: "6-Piece Set", sku: "VAN-BLS-B06", price: 1149, stock: 20 }],
    },
    // ---- Handbags ----
    {
      slug: "asta-structured-tote",
      cat: "handbags",
      name: "Asta Structured Tote",
      short: "A clean-lined tote with a laptop sleeve and magnetic close.",
      desc: "Asta holds its sculpted shape from commute to meeting. Interior sleeves fit a 13-inch laptop; the magnetic top sits flush. A detachable strap converts it to shoulder carry.",
      materials: "Vegan leather, gold-tone hardware, fabric lining.",
      care: "Wipe with a dry cloth; stuff with paper when storing.",
      featured: true,
      best: true,
      variants: [
        { name: "Tan", sku: "BAG-AST-TOT-TAN", price: 2499, compareAt: 2999, stock: 12 },
        { name: "Ivory", sku: "BAG-AST-TOT-IVR", price: 2499, compareAt: 2999, stock: 9 },
      ],
    },
    {
      slug: "petra-sling-bag",
      cat: "handbags",
      name: "Petra Quilted Sling",
      short: "A quilted crossbody with a chain-and-leather strap.",
      desc: "Petra's diamond quilting and mixed chain strap dress up the smallest silhouette. Fits a phone, cardholder and keys — nothing more, perfectly.",
      materials: "Vegan leather, chain strap.",
      care: "Keep away from liquids and perfume.",
      fresh: true,
      variants: [
        { name: "Black", sku: "BAG-PET-SLG-BLK", price: 1599, stock: 16 },
        { name: "Champagne", sku: "BAG-PET-SLG-CHP", price: 1599, stock: 11 },
      ],
    },
    {
      slug: "noor-evening-clutch",
      cat: "handbags",
      name: "Noor Evening Clutch",
      short: "A satin clutch with a pearl clasp for celebrations.",
      desc: "Noor folds around evenings out — satin faced, pearl clasped, chain tucked inside. Slim enough to hold lightly, pretty enough to be the accessory.",
      materials: "Satin finish, pearl-effect clasp.",
      care: "Store flat in the dust bag.",
      variants: [{ name: "Ivory", sku: "BAG-NOO-CLT-IVR", price: 1299, stock: 14 }],
    },
    {
      slug: "wren-cardholder",
      cat: "handbags",
      name: "Wren Card Holder",
      short: "A slim six-slot card holder in pebbled vegan leather.",
      desc: "Wren slips into the smallest bag with six card slots and a center pocket for folded notes. Edges are hand-painted for a clean finish.",
      materials: "Pebbled vegan leather.",
      care: "Wipe clean with a soft, dry cloth.",
      variants: [
        { name: "Black", sku: "BAG-WRE-CRD-BLK", price: 699, stock: 40 },
        { name: "Tan", sku: "BAG-WRE-CRD-TAN", price: 699, stock: 35 },
      ],
    },
  ];

  for (const p of products) {
    const product = await db.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        shortDescription: p.short,
        description: p.desc,
        materials: p.materials,
        careInstructions: p.care,
        categoryId: cats[p.cat].id,
        status: "ACTIVE",
        isFeatured: !!p.featured,
        isBestSeller: !!p.best,
        isNewArrival: !!p.fresh,
      },
      create: {
        slug: p.slug,
        categoryId: cats[p.cat].id,
        name: p.name,
        shortDescription: p.short,
        description: p.desc,
        materials: p.materials,
        careInstructions: p.care,
        status: "ACTIVE",
        isFeatured: !!p.featured,
        isBestSeller: !!p.best,
        isNewArrival: !!p.fresh,
      },
    });
    // Images: primary + secondary (reuse same generated asset)
    const imgName = p.slug;
    await db.productImage.deleteMany({ where: { productId: product.id } });
    await db.productImage.createMany({
      data: [
        { productId: product.id, url: IMG(imgName), alt: p.name, sortOrder: 0 },
        { productId: product.id, url: IMG(imgName + "-b"), alt: p.name + " alternate view", sortOrder: 1 },
      ],
    });
    for (const v of p.variants) {
      const existing = await db.productVariant.findUnique({ where: { sku: v.sku } });
      if (existing) {
        await db.productVariant.update({
          where: { sku: v.sku },
          data: {
            name: v.name,
            price: v.price,
            compareAtPrice: v.compareAt ?? null,
            productId: product.id,
          },
        });
      } else {
        const variant = await db.productVariant.create({
          data: {
            productId: product.id,
            name: v.name,
            sku: v.sku,
            price: v.price,
            compareAtPrice: v.compareAt ?? null,
            stock: v.stock,
            lowStockThreshold: 5,
          },
        });
        await db.stockMovement.create({
          data: {
            variantId: variant.id,
            delta: v.stock,
            reason: "INITIAL",
            note: "Seed stock (fictional development data)",
            createdById: admin.id,
          },
        });
      }
    }
  }
  console.log(`✓ ${products.length} products with variants + stock movements`);

  // ---------- Shipping ----------
  if ((await db.shippingRate.count()) === 0) {
    await db.shippingRate.create({
      data: {
        name: "Standard Delivery",
        baseFee: 79,
        freeAbove: 1999,
        sortOrder: 0,
        isActive: true,
      },
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
      description: "Flat ₹200 off above ₹2,499 (sample)",
      discountType: "FIXED" as const,
      value: 200,
      minSubtotal: 2499,
      perUserLimit: 2,
      usageLimit: 300,
    },
  ];
  for (const c of coupons) {
    await db.coupon.upsert({ where: { code: c.code }, update: {}, create: c });
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
  if ((await db.homepageBanner.count()) === 0) {
    await db.homepageBanner.createMany({ data: banners });
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
    await db.siteSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log("✓ Site settings (contact details intentionally blank — owner must configure)");

  console.log("\nDone. All seed data is FICTIONAL and for development only.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
