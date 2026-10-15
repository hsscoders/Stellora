import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ProductForm } from "@/components/stellora/admin-product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { price: "asc" } },
    },
  });
  if (!product) notFound();

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
      <h1 className="font-serif text-3xl font-medium">Edit Product</h1>
      <ProductForm productId={product.id} initial={initial} />
    </div>
  );
}
