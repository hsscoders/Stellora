import { Router } from "express";
import mongoose from "mongoose";
import { Product, Category, Review } from "../models";
import { ok, handle } from "../lib/http";
import { productQuerySchema } from "../validation";
import type { Types } from "mongoose";

const PAGE_SIZE = 12;

function serializeProduct(p: any) {
  const images = [...(p.images ?? [])].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const variants = (p.variants ?? [])
    .filter((v: any) => v.isActive)
    .sort((a: any, b: any) => a.price - b.price)
    .map((v: any) => ({
      id: String(v._id),
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
  return {
    id: String(p._id),
    slug: p.slug,
    categoryId: p.categoryId ? String((p.categoryId as any)?._id ?? p.categoryId) : null,
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
    category: p.categoryId && typeof p.categoryId === "object" && "_id" in (p.categoryId as object)
      ? {
          id: String((p.categoryId as any)._id),
          slug: p.categoryId.slug,
          name: p.categoryId.name,
          description: p.categoryId.description ?? null,
          imageUrl: p.categoryId.imageUrl ?? null,
          sortOrder: p.categoryId.sortOrder,
          isActive: p.categoryId.isActive,
          createdAt: p.categoryId.createdAt,
          updatedAt: p.categoryId.updatedAt,
        }
      : null,
    images: images.map((i: any) => ({ id: String(i._id), url: i.url, alt: i.alt ?? null, sortOrder: i.sortOrder ?? 0 })),
    variants,
  };
}

export const storefrontRouter = Router();

storefrontRouter.get(
  "/health",
  handle(async (_req, res) => {
    try {
      await mongoose.connection.db?.admin().command({ ping: 1 });
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
    const categories = await Category.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean<any[]>();
    // Count ACTIVE products per category
    const counts = await Product.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { status: "ACTIVE" } },
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return ok(res, categories.map((c) => ({
        id: String(c._id),
        slug: c.slug,
        name: c.name,
        description: c.description ?? null,
        imageUrl: c.imageUrl ?? null,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        _count: { products: countMap.get(String(c._id)) ?? 0 },
      }))
    );
  })
);


storefrontRouter.get(
  "/banners",
  handle(async (_req, res) => {
    const { HomepageBanner } = await import("../models");
    const banners = await HomepageBanner.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .limit(3)
      .lean<any[]>();
    return ok(
      res,
      banners.map((b) => ({
        id: String(b._id),
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
    const product = await Product.findOne({ slug: req.params.slug, status: "ACTIVE" })
      .populate("categoryId")
      .lean<any>();
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
    const product = await Product.findOne({ slug: req.params.slug, status: "ACTIVE" })
      .select("variants._id variants.stock variants.isActive")
      .lean<any>();
    if (!product) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found." } });
    }
    return ok(
      res,
      (product.variants ?? []).map((v: any) => ({
        id: String(v._id),
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
    const { SiteSetting } = await import("../models");
    const rows = await SiteSetting.find().sort({ key: 1 }).lean<{ key: string; value: string; updatedAt: Date }[]>();
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
      const rx = new RegExp(escapeRegex(query.q), "i");
      where.$or = [{ name: rx }, { shortDescription: rx }, { description: rx }];
    }
    if (query.category) {
      const cat = await Category.findOne({ slug: query.category, isActive: true }).select("_id").lean<{ _id: any }>();
      where.categoryId = cat ? cat._id : new mongoose.Types.ObjectId("000000000000000000000000");
    }

    const variantMatch: Record<string, unknown> = { isActive: true };
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const price: Record<string, number> = {};
      if (query.minPrice !== undefined) price.$gte = query.minPrice;
      if (query.maxPrice !== undefined) price.$lte = query.maxPrice;
      variantMatch.price = price;
    }
    if (query.inStock) variantMatch.stock = { $gt: 0 };
    where.variants = { $elemMatch: variantMatch };

    const populate = { path: "categoryId", select: "-__v" };

    // Rating-aware flows (minRating filter / rating sort) need review averages,
    // and price sort already uses the in-memory path — unify all three here.
    const needsRatings = query.sort === "rating-desc" || query.minRating !== undefined;
    if (needsRatings || query.sort === "price-asc" || query.sort === "price-desc") {
      const products = await Product.find(where).populate(populate).lean<any[]>();
      let ratingMap = new Map<string, { avg: number; count: number }>();
      if (needsRatings) {
        const ids = products.map((p: any) => p._id);
        const ratingAgg = await Review.aggregate<{ _id: Types.ObjectId; avg: number; count: number }>([
          { $match: { productId: { $in: ids }, status: "APPROVED" } },
          { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
        ]);
        ratingMap = new Map(
          ratingAgg.map((r) => [String(r._id), { avg: Math.round(r.avg * 10) / 10, count: r.count }])
        );
      }
      let list = products;
      if (query.minRating !== undefined) {
        list = list.filter(
          (p: any) => (ratingMap.get(String(p._id))?.avg ?? 0) >= (query.minRating as number)
        );
      }
      if (query.sort === "rating-desc") {
        list = [...list].sort((a: any, b: any) => {
          const ra = ratingMap.get(String(a._id));
          const rb = ratingMap.get(String(b._id));
          const va = ra ? ra.avg : -1;
          const vb = rb ? rb.avg : -1;
          if (vb !== va) return vb - va;
          return (rb?.count ?? 0) - (ra?.count ?? 0); // tie-break by review count
        });
      } else {
        list = [...list].sort((a: any, b: any) => {
          const pa = a.variants?.filter((v: any) => v.isActive)[0]?.price ?? Infinity;
          const pb = b.variants?.filter((v: any) => v.isActive)[0]?.price ?? Infinity;
          return query.sort === "price-asc" ? pa - pb : pb - pa;
        });
      }
      const total = list.length;
      const start = (query.page - 1) * PAGE_SIZE;
      const pageItems = list.slice(start, start + PAGE_SIZE).map((p: any) => {
        const api = serializeProduct(p);
        const r = ratingMap.get(String(p._id));
        return r ? { ...api, rating: r.avg, reviewCount: r.count } : api;
      });
      return ok(res, {
        products: pageItems,
        total,
        page: query.page,
        pages: Math.ceil(total / PAGE_SIZE) || 1,
      });
    }

    const orderBy: Record<string, 1 | -1> =
      query.sort === "name-asc"
        ? { name: 1 }
        : query.sort === "name-desc"
          ? { name: -1 }
          : { createdAt: -1 };

    const [products, total] = await Promise.all([
      Product.find(where).sort(orderBy as never).skip((query.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).populate(populate).lean<any[]>(),
      Product.countDocuments(where),
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
    const products = await Product.find({
      status: "ACTIVE",
      videoUrl: { $nin: [null, ""] },
    })
      .sort({ createdAt: -1 })
      .limit(12)
      .populate("categoryId", "name slug")
      .lean<any[]>();
    return ok(
      res,
      products.map((p) => {
        const images = [...(p.images ?? [])].sort(
          (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        );
        const active = (p.variants ?? []).filter((v: any) => v.isActive).sort((a: any, b: any) => a.price - b.price);
        return {
          id: String(p._id),
          slug: p.slug,
          name: p.name,
          videoUrl: p.videoUrl,
          posterUrl: images[0]?.url ?? null,
          categoryName:
            p.categoryId && typeof p.categoryId === "object" ? p.categoryId.name : null,
          price: active[0]?.price ?? null,
          compareAtPrice: active[0]?.compareAtPrice ?? null,
        };
      })
    );
  })
);

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { serializeProduct };
