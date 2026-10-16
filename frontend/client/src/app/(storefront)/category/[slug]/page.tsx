import { notFound } from "next/navigation";
import { apiCategories, apiProducts } from "@/lib/server-api";
import { ProductListing, type ShopSearchParams } from "@/components/stellora/product-listing";
import { productQuerySchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const categories = await apiCategories();
    const category = categories.find((c) => c.slug === slug);
    return { title: category ? category.name : "Category" };
  } catch {
    return { title: "Category" };
  }
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

  const categories = await apiCategories();
  const category = categories.find((c) => c.slug === slug && c.isActive);
  if (!category) notFound();

  const query = productQuerySchema.parse({
    minPrice: sp.minPrice ?? undefined,
    maxPrice: sp.maxPrice ?? undefined,
    minRating: sp.minRating ?? undefined,
    inStock: sp.inStock ?? undefined,
    sort: sp.sort ?? undefined,
    page: sp.page ?? undefined,
  });

  const result = await apiProducts({
    category: category.slug,
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
      basePath={`/category/${category.slug}`}
      searchParams={sp}
      title={category.name}
      subtitle={category.description ?? undefined}
    />
  );
}
