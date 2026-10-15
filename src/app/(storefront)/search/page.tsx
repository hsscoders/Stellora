import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ProductListing, type ShopSearchParams } from "@/components/stellora/product-listing";
import { productQuerySchema } from "@/lib/validation/schemas";
import { EmptyState } from "@/components/stellora/empty-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

const PAGE_SIZE = 12;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<ShopSearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  if (!q) {
    return (
      <EmptyState
        icon="search"
        title="Search Stellora"
        description="Type in the search box above to find jewellery, hair extensions, vanity picks and handbags."
        actionLabel="Browse everything"
        actionHref="/shop"
      />
    );
  }

  const query = productQuerySchema.parse({
    minPrice: sp.minPrice ?? undefined,
    maxPrice: sp.maxPrice ?? undefined,
    sort: sp.sort ?? undefined,
    page: sp.page ?? undefined,
  });

  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    OR: [
      { name: { contains: q } },
      { shortDescription: { contains: q } },
      { description: { contains: q } },
      { category: { name: { contains: q } } },
    ],
  };
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.variants = {
      some: {
        isActive: true,
        ...(query.minPrice !== undefined ? { price: { gte: query.minPrice } } : {}),
        ...(query.maxPrice !== undefined ? { price: { lte: query.maxPrice } } : {}),
      },
    };
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: query.sort === "name-asc" ? { name: "asc" } : { createdAt: "desc" },
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

  return (
    <ProductListing
      products={products}
      total={total}
      page={query.page}
      pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      basePath={`/search?q=${encodeURIComponent(q)}`}
      searchParams={sp}
      title={`Results for “${q}”`}
    />
  );
}
