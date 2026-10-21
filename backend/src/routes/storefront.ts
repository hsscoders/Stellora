import { Router } from "express";
import { db } from "../lib/db";
import { ok, handle } from "../lib/http";
import { productQuerySchema } from "../validation";

const PAGE_SIZE = 12;

/**
 * Serialize a Prisma product row (with included category + variants +
 * images) into the exact API shape the storefront has always received.
 * Money values arrive as Prisma Decimal — ok() normalizes them to numbers
 * at the response boundary; here we only Number() for arithmetic.
 */
export function serializeProduct(p: any) {
  const images = [...(p.images ?? [])].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const variants = (p.variants ?? [])
    .filter((v: any) => v.isActive)
    .sort((a: any, b: any) => Number(a.price) - Number(b.price))
    .map((v: any) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode ?? null,
      name: v.name,
      price: v.price,
      compareAtPrice: v.compareAtPrice ?? null,
      stock: v.stock,
      lowStockThreshold: v.lowStockThreshold,
      isActive: v.isActive,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));
  const cat = p.category ?? null;
  return {
    id: p.id,
    slug: p.slug,
    categoryId: p.categoryId ?? null,
    name: p.name,
    shortDescription: p.shortDescription,
    description: p.description ?? null,
    materials: p.materials ?? null,
    careInstructions: p.careInstructions ?? null,
    status: p.status,
    isFeatured: !!p.isFeatured,
    isNewArrival: !!p.isNewArrival,
    isBestSeller: !!p.isBestSeller,
    videoUrl: p.videoUrl ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    category: cat
      ? {
          id: cat.id,
          slug: cat.slug,
          name: cat.name,
          description: cat.description ?? null,
          imageUrl: cat.imageUrl ?? null,
          sortOrder: cat.sortOrder,
          isActive: cat.isActive,
          createdAt: cat.createdAt,
          updatedAt: cat.updatedAt,
        }
      : null,
    images: images.map((i: any) => ({ id: i.id, url: i.url, alt: i.alt ?? null, sortOrder: i.sortOrder ?? 0 })),
    variants,
  };
}

/** Prisma include every product-listing query needs. */
export const productInclude = {
  category: true,
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: { where: { isActive: true }, orderBy: { price: "asc" as const } },
};

export const storefrontRouter = Router();

storefrontRouter.get(
  "/health",
  handle(async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return ok(res, {
        status: "healthy",
        database: "connected",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[health] database check failed", err);
      return res
        .status(503)
        .json({ ok: false, error: { code: "DB_UNAVAILABLE", message: "Database unreachable" } });
    }
  })
);

storefrontRouter.get(
  "/categories",
  handle(async (_req, res) => {
    const categories = await db.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    // Count ACTIVE products per category
    const counts = await db.product.groupBy({
      by: ["categoryId"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return ok(res, categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description ?? null,
        imageUrl: c.imageUrl ?? null,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        _count: { products: countMap.get(c.id) ?? 0 },
      }))
    );
  })
);


storefrontRouter.get(
  "/banners",
  handle(async (_req, res) => {
    const banners = await db.homepageBanner.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      take: 3,
    });
    return ok(
      res,
      banners.map((b) => ({
        id: b.id,
        title: b.title,
        subtitle: b.subtitle ?? null,
        imageUrl: b.imageUrl,
        ctaLabel: b.ctaLabel ?? null,
        ctaHref: b.ctaHref ?? null,
        sortOrder: b.sortOrder,
        isActive: b.isActive,
      }))
    );
  })
);


storefrontRouter.get(
  "/products/:slug",
  handle(async (req, res) => {
    const product = await db.product.findFirst({
      where: { slug: String(req.params.slug), status: "ACTIVE" },
      include: productInclude,
    });
    if (!product) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found." } });
    }
    return ok(res, serializeProduct(product));
  })
);

/* Lightweight live-stock check for the product page — the storefront polls
   this every few seconds while the tab is visible so "only 2 left"/"out of
   stock" badges never show stale numbers when the shop sells at the counter. */
storefrontRouter.get(
  "/products/:slug/stock",
  handle(async (req, res) => {
    const product = await db.product.findFirst({
      where: { slug: String(req.params.slug), status: "ACTIVE" },
      select: { variants: { select: { id: true, stock: true, isActive: true } } },
    });
    if (!product) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found." } });
    }
    return ok(
      res,
      (product.variants ?? []).map((v) => ({
        id: v.id,
        stock: Number(v.stock) || 0,
        isActive: !!v.isActive,
      }))
    );
  })
);

// SECURITY: payment.* keys (gateway secrets) are managed ONLY through the
// masked /admin/payments/* endpoints and must NEVER be exposed publicly.
// seo.config likewise has its own dedicated endpoint (/api/seo).
const isInternalSettingKey = (key: string) =>
  key.startsWith("payment.") || key === "seo.config" || key.startsWith("delivery.api");

storefrontRouter.get(
  "/settings",
  handle(async (_req, res) => {
    const rows = await db.siteSetting.findMany({
      orderBy: { key: "asc" },
      select: { key: true, value: true, updatedAt: true },
    });
    return ok(res, rows.filter((r) => !isInternalSettingKey(r.key)).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt })));
  })
);

// Public SEO configuration — powers <head> meta tags, JSON-LD structured
// data, robots.txt and the sitemap. Every field is publishable by design
// (verification tokens are literally <meta name="google-site-verification">
// content, so secrecy is not a property this endpoint needs).
storefrontRouter.get(
  "/seo",
  handle(async (_req, res) => {
    const { getSeoConfig } = await import("../services/seo-config");
    return ok(res, await getSeoConfig());
  })
);

storefrontRouter.get(
  "/products",
  handle(async (req, res) => {
    const query = productQuerySchema.parse({
      q: req.query.q ?? undefined,
      category: req.query.category ?? undefined,
      minPrice: req.query.minPrice ?? undefined,
      maxPrice: req.query.maxPrice ?? undefined,
      minRating: req.query.minRating ?? undefined,
      inStock: req.query.inStock ?? undefined,
      sort: req.query.sort ?? undefined,
      page: req.query.page ?? undefined,
    });

    const where: Record<string, unknown> = { status: "ACTIVE" };
    const flags: Record<string, boolean> = {};
    if (req.query.featured === "1") flags.isFeatured = true;
    if (req.query.new === "1") flags.isNewArrival = true;
    if (req.query.best === "1") flags.isBestSeller = true;
    if (req.query.trending === "1") flags.isTrending = true;
    Object.assign(where, flags);
    if (query.q) {
      where.OR = [
        { name: { contains: query.q } },
        { shortDescription: { contains: query.q } },
        { description: { contains: query.q } },
      ];
    }
    if (query.category) {
      const cat = await db.category.findFirst({
        where: { slug: query.category, isActive: true },
        select: { id: true },
      });
      where.categoryId = cat ? cat.id : "000000000000000000000000";
    }

    // Variant-level filters (price range / in-stock) map to a relation filter —
    // same semantics as the old $elemMatch: at least one variant must match.
    const variantMatch: Record<string, unknown> = { isActive: true };
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const price: Record<string, number> = {};
      if (query.minPrice !== undefined) price.gte = query.minPrice;
      if (query.maxPrice !== undefined) price.lte = query.maxPrice;
      variantMatch.price = price;
    }
    if (query.inStock) variantMatch.stock = { gt: 0 };
    where.variants = { some: variantMatch };

    // Rating-aware flows (minRating filter / rating sort) need review averages,
    // and price sort already uses the in-memory path — unify all three here.
    const needsRatings = query.sort === "rating-desc" || query.minRating !== undefined;
    if (needsRatings || query.sort === "price-asc" || query.sort === "price-desc") {
      const products = await db.product.findMany({ where: where as never, include: productInclude });
      let ratingMap = new Map<string, { avg: number; count: number }>();
      if (needsRatings) {
        const ids = products.map((p) => p.id);
        const ratingAgg = await db.review.groupBy({
          by: ["productId"],
          where: { productId: { in: ids }, status: "APPROVED" },
          _avg: { rating: true },
          _count: { _all: true },
        });
        ratingMap = new Map(
          ratingAgg.map((r) => [
            r.productId,
            { avg: Math.round(Number(r._avg.rating ?? 0) * 10) / 10, count: r._count._all },
          ])
        );
      }
      let list = products;
      if (query.minRating !== undefined) {
        list = list.filter(
          (p) => (ratingMap.get(p.id)?.avg ?? 0) >= (query.minRating as number)
        );
      }
      if (query.sort === "rating-desc") {
        list = [...list].sort((a, b) => {
          const ra = ratingMap.get(a.id);
          const rb = ratingMap.get(b.id);
          const va = ra ? ra.avg : -1;
          const vb = rb ? rb.avg : -1;
          if (vb !== va) return vb - va;
          return (rb?.count ?? 0) - (ra?.count ?? 0); // tie-break by review count
        });
      } else {
        list = [...list].sort((a, b) => {
          // Sort key = cheapest ACTIVE variant, mirroring serializeProduct's
          // display order (variants[0] after its price sort). Using the first
          // STORED variant made the sort disagree with the displayed price.
          const pa = Math.min(...(a.variants?.filter((v) => v.isActive).map((v) => Number(v.price)) ?? [Infinity]));
          const pb = Math.min(...(b.variants?.filter((v) => v.isActive).map((v) => Number(v.price)) ?? [Infinity]));
          return query.sort === "price-asc" ? pa - pb : pb - pa;
        });
      }
      const total = list.length;
      const start = (query.page - 1) * PAGE_SIZE;
      const pageItems = list.slice(start, start + PAGE_SIZE).map((p) => {
        const api = serializeProduct(p);
        const r = ratingMap.get(p.id);
        return r ? { ...api, rating: r.avg, reviewCount: r.count } : api;
      });
      return ok(res, {
        products: pageItems,
        total,
        page: query.page,
        pages: Math.ceil(total / PAGE_SIZE) || 1,
      });
    }

    const orderBy: Record<string, "asc" | "desc"> =
      query.sort === "name-asc"
        ? { name: "asc" }
        : query.sort === "name-desc"
          ? { name: "desc" }
          : { createdAt: "desc" };

    const [products, total] = await Promise.all([
      db.product.findMany({
        where: where as never,
        orderBy: orderBy as never,
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: productInclude,
      }),
      db.product.count({ where: where as never }),
    ]);

    return ok(res, {
      products: products.map(serializeProduct),
      total,
      page: query.page,
      pages: Math.ceil(total / PAGE_SIZE) || 1,
    });
  })
);

storefrontRouter.get(
  "/videos",
  handle(async (_req, res) => {
    // Products that carry a video preview (mp4 / webm / YouTube link) — powers
    // the homepage "Watch it in action" swipeable showcase.
    const products = await db.product.findMany({
      where: { status: "ACTIVE", AND: [{ videoUrl: { not: null } }, { videoUrl: { not: "" } }] },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: "asc" } },
        variants: { where: { isActive: true }, orderBy: { price: "asc" } },
      },
    });
    return ok(
      res,
      products.map((p) => {
        const active = p.variants ?? [];
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          videoUrl: p.videoUrl,
          posterUrl: p.images[0]?.url ?? null,
          categoryName: p.category?.name ?? null,
          price: active[0]?.price ?? null,
          compareAtPrice: active[0]?.compareAtPrice ?? null,
        };
      })
    );
  })
);

