import { Router } from "express";
import mongoose from "mongoose";
import { Product, Category } from "../models";
import { ok, handle } from "../lib/http";
import { productQuerySchema } from "../validation";
import { toAPI } from "../lib/serialize";
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

storefrontRouter.get(
  "/settings",
  handle(async (_req, res) => {
    const { SiteSetting } = await import("../models");
    const rows = await SiteSetting.find().sort({ key: 1 }).lean<{ key: string; value: string; updatedAt: Date }[]>();
    return ok(res, rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt })));
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
      inStock: req.query.inStock ?? undefined,
      sort: req.query.sort ?? undefined,
      page: req.query.page ?? undefined,
    });

    const where: Record<string, unknown> = { status: "ACTIVE" };
    const flags: Record<string, boolean> = {};
    if (req.query.featured === "1") flags.isFeatured = true;
    if (req.query.new === "1") flags.isNewArrival = true;
    if (req.query.best === "1") flags.isBestSeller = true;
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

    if (query.sort === "price-asc" || query.sort === "price-desc") {
      // Fetch then sort by first active variant price (mirrors original behaviour)
      const products = await Product.find(where).populate(populate).lean<any[]>();
      products.sort((a, b) => {
        const pa = a.variants?.filter((v: any) => v.isActive)[0]?.price ?? Infinity;
        const pb = b.variants?.filter((v: any) => v.isActive)[0]?.price ?? Infinity;
        return query.sort === "price-asc" ? pa - pb : pb - pa;
      });
      const total = products.length;
      const start = (query.page - 1) * PAGE_SIZE;
      const pageItems = products.slice(start, start + PAGE_SIZE);
      return ok(res, {
        products: pageItems.map(serializeProduct),
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

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { serializeProduct, toAPI };
