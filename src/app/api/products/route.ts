import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { productQuerySchema } from "@/lib/validation/schemas";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 12;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const sp = req.nextUrl.searchParams;
    const query = productQuerySchema.parse({
      q: sp.get("q") ?? undefined,
      category: sp.get("category") ?? undefined,
      minPrice: sp.get("minPrice") ?? undefined,
      maxPrice: sp.get("maxPrice") ?? undefined,
      inStock: sp.get("inStock") ?? undefined,
      sort: sp.get("sort") ?? undefined,
      page: sp.get("page") ?? undefined,
    });

    const where: Prisma.ProductWhereInput = { status: "ACTIVE" };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q } },
        { shortDescription: { contains: query.q } },
        { description: { contains: query.q } },
      ];
    }
    if (query.category) {
      where.category = { slug: query.category, isActive: true };
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.variants = {
        some: {
          isActive: true,
          price: {
            ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
          },
        },
      };
    }
    if (query.inStock) {
      where.variants = { ...where.variants, some: { ...where.variants?.some, stock: { gt: 0 } } };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sort === "price-asc"
        ? { variants: { _count: "asc" } } // placeholder, real price sort below
        : query.sort === "price-desc"
          ? { createdAt: "desc" }
          : query.sort === "name-asc"
            ? { name: "asc" }
            : query.sort === "name-desc"
              ? { name: "desc" }
              : { createdAt: "desc" };

    // Price sorting done in a separate query path for correctness
    if (query.sort === "price-asc" || query.sort === "price-desc") {
      const products = await db.product.findMany({
        where,
        include: {
          category: true,
          images: { orderBy: { sortOrder: "asc" } },
          variants: { where: { isActive: true }, orderBy: { price: query.sort === "price-asc" ? "asc" : "desc" } },
        },
      });
      products.sort((a, b) => {
        const pa = a.variants[0] ? Number(a.variants[0].price) : Infinity;
        const pb = b.variants[0] ? Number(b.variants[0].price) : Infinity;
        return query.sort === "price-asc" ? pa - pb : pb - pa;
      });
      const total = products.length;
      const start = (query.page - 1) * PAGE_SIZE;
      const pageItems = products.slice(start, start + PAGE_SIZE);
      return ok({ products: pageItems, total, page: query.page, pages: Math.ceil(total / PAGE_SIZE) || 1 });
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          category: true,
          images: { orderBy: { sortOrder: "asc" } },
          variants: { where: { isActive: true }, orderBy: { price: "asc" } },
        },
      }),
      db.product.count({ where }),
    ]);

    return ok({ products, total, page: query.page, pages: Math.ceil(total / PAGE_SIZE) || 1 });
  });
}
