import { ProductForm } from "@/components/stellora/admin-product-form";

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-medium">New Product</h1>
      <ProductForm />
    </div>
  );
}
