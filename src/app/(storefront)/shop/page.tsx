import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ProductListing, type ShopSearchParams } from "@/components/stellora/product-listing";
import { productQuerySchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop All" };

const PAGE_SIZE = 12;

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<ShopSearchParams>;
}) {
  const sp = await searchParams;
  const query = productQuerySchema.parse({
    q: sp.q ?? undefined,
    minPrice: sp.minPrice ?? undefined,
    maxPrice: sp.maxPrice ?? undefined,
    inStock: sp.inStock ?? undefined,
    sort: sp.sort ?? undefined,
    page: sp.page ?? undefined,
  });

  const where: Prisma.ProductWhereInput = { status: "ACTIVE" };
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
  const pages = async () => Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      pages={await pages()}
      basePath="/shop"
      searchParams={sp}
      title="Shop All"
      subtitle="Every Stellora piece — jewellery, hair extensions, vanity and handbags — in one considered edit."
    />
  );
}
