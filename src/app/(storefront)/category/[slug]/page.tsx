import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ProductListing, type ShopSearchParams } from "@/components/stellora/product-listing";
import { productQuerySchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await db.category.findUnique({ where: { slug } });
  return { title: category ? category.name : "Category" };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ShopSearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = await db.category.findFirst({ where: { slug, isActive: true } });
  if (!category) notFound();

  const query = productQuerySchema.parse({
    minPrice: sp.minPrice ?? undefined,
    maxPrice: sp.maxPrice ?? undefined,
    inStock: sp.inStock ?? undefined,
    sort: sp.sort ?? undefined,
    page: sp.page ?? undefined,
  });

  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    categoryId: category.id,
  };
  if (query.minPrice !== undefined || query.maxPrice !== undefined || query.inStock) {
    where.variants = {
      some: {
        isActive: true,
        ...(query.minPrice !== undefined ? { price: { gte: query.minPrice } } : {}),
        ...(query.maxPrice !== undefined ? { price: { lte: query.maxPrice } } : {}),
        ...(query.inStock ? { stock: { gt: 0 } } : {}),
      },
    };
  }

  let products: Parameters<typeof ProductListing>[0]["products"] = [];
  let total = 0;

  if (query.sort === "price-asc" || query.sort === "price-desc") {
    const all = await db.product.findMany({
      where,
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: { where: { isActive: true }, orderBy: { price: query.sort === "price-asc" ? "asc" : "desc" } },
      },
    });
    all.sort((a, b) => {
      const pa = a.variants[0] ? Number(a.variants[0].price) : Infinity;
      const pb = b.variants[0] ? Number(b.variants[0].price) : Infinity;
      return query.sort === "price-asc" ? pa - pb : pb - pa;
    });
    total = all.length;
    products = all.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE);
  } else {
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sort === "name-asc"
        ? { name: "asc" }
        : query.sort === "name-desc"
          ? { name: "desc" }
          : { createdAt: "desc" };
    const [items, count] = await Promise.all([
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
    products = items;
    total = count;
  }

  return (
    <ProductListing
      products={products}
      total={total}
      page={query.page}
      pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      basePath={`/category/${category.slug}`}
      searchParams={sp}
      title={category.name}
      subtitle={category.description ?? undefined}
    />
  );
}
