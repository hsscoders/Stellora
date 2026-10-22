import { ProductForm } from "@/components/stellora/admin-product-form";
import { PageHeader } from "@/components/stellora/advanced/page-header";

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="New Product"
        subtitle="Add a product with variants, pricing, stock and imagery. Save as draft or publish immediately."
      />
      <ProductForm />
    </div>
  );
}
