import { apiProducts } from "@/lib/server-api";
import { ProductListing, type ShopSearchParams } from "@/components/stellora/product-listing";
import { productQuerySchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({
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

  const result = await apiProducts({
    q: query.q,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
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
      basePath="/search"
      searchParams={sp}
      title={query.q ? `Results for “${query.q}”` : "Search"}
      subtitle={
        query.q
          ? `${result.total} piece(s) matched your search.`
          : "Type in the search bar above to find exactly what you are looking for."
      }
    />
  );
}
