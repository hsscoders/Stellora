import { apiProducts } from "@/lib/server-api";
import { ProductListing, type ShopSearchParams } from "@/components/stellora/product-listing";
import { productQuerySchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop All" };

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
    minRating: sp.minRating ?? undefined,
    inStock: sp.inStock ?? undefined,
    sort: sp.sort ?? undefined,
    page: sp.page ?? undefined,
  });

  const result = await apiProducts({
    q: query.q,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    minRating: query.minRating,
    inStock: query.inStock ? "1" : undefined,
    sort: query.sort,
    page: query.page,
  });

  return (
    <ProductListing
      products={result.products}
      total={result.total}
      page={result.page}
      pages={result.pages}
      basePath="/shop"
      searchParams={sp}
      title="Shop All"
      subtitle="Every Stellora piece — jewellery, hair extensions, vanity and handbags — in one considered edit."
    />
  );
}
