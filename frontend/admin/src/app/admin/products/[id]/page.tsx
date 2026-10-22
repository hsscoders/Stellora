import { notFound } from "next/navigation";
import { apiAdminProduct, apiAdminCategories } from "@/lib/server-api";
import { ProductForm } from "@/components/stellora/admin-product-form";
import { PageHeader } from "@/components/stellora/advanced/page-header";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let product;
  try {
    product = await apiAdminProduct(id);
  } catch {
    product = null;
  }
  if (!product) notFound();
  const categories = await apiAdminCategories();

  const initial = {
    name: product.name,
    slug: product.slug,
    categoryId: product.categoryId,
    shortDescription: product.shortDescription,
    description: product.description ?? "",
    materials: product.materials ?? "",
    careInstructions: product.careInstructions ?? "",
    status: product.status,
    isFeatured: product.isFeatured,
    isNewArrival: product.isNewArrival,
    isBestSeller: product.isBestSeller,
    isTrending: (product as { isTrending?: boolean }).isTrending ?? false,
    videoUrl: (product as { videoUrl?: string | null }).videoUrl ?? "",
    images: product.images.map((i) => ({ url: i.url, alt: i.alt ?? undefined })),
    variants: product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      price: String(v.price),
      compareAtPrice: v.compareAtPrice ? String(v.compareAtPrice) : "",
      stock: String(v.stock),
      lowStockThreshold: String(v.lowStockThreshold),
      isActive: v.isActive,
    })),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Product"
        subtitle={`Editing “${product.name}” — changes go live as soon as you save.`}
      />
      <ProductForm productId={product.id} initial={initial} />
    </div>
  );
}
