import Link from "next/link";
import { notFound } from "next/navigation";
import { apiProduct, apiProducts } from "@/lib/server-api";
import { ProductCard } from "@/components/stellora/product-card";
import { WishlistButton } from "@/components/stellora/wishlist-button";
import { ProductGallery } from "@/components/stellora/product-detail-client";
import { ProductPurchase } from "@/components/stellora/product-purchase";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ShieldCheck, Truck, RotateCcw } from "lucide-react";

export const dynamic = "force-dynamic";

async function getProduct(slug: string) {
  try {
    return await apiProduct(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  return {
    title: product ? product.name : "Product",
    description: product?.shortDescription,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const relatedRes = await apiProducts({ category: product.category?.slug ?? "", page: 1 }).catch(() => ({ products: [] as never[] }));
  const related = relatedRes.products.filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-foreground">Home</Link></li>
          <li aria-hidden>/</li>
          <li><Link href={`/category/${product.category?.slug ?? "shop"}`} className="hover:text-foreground">{product.category?.name ?? "Shop"}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-foreground/80">{product.name}</li>
        </ol>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <ProductGallery images={product.images} productName={product.name} />

        <div className="flex flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
            {product.category?.name ?? "Stellora"}
          </p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="font-serif text-3xl font-medium leading-tight sm:text-4xl">
              {product.name}
            </h1>
            <WishlistButton productId={product.id} className="shrink-0" />
          </div>

          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {product.shortDescription}
          </p>

          <ProductPurchase variants={product.variants} />

          <div className="mt-8 space-y-3 rounded-lg border border-border/60 bg-card p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-primary" /> Quality checked before dispatch
            </p>
            <p className="flex items-center gap-2.5">
              <Truck className="h-4 w-4 text-primary" /> Careful, protective packaging
            </p>
            <p className="flex items-center gap-2.5">
              <RotateCcw className="h-4 w-4 text-primary" /> Simple returns under our{" "}
              <Link href="/policies/returns" className="underline hover:text-foreground">
                return policy
              </Link>
            </p>
          </div>

          <Accordion type="multiple" className="mt-8">
            <AccordionItem value="description">
              <AccordionTrigger className="text-sm font-semibold uppercase tracking-[0.14em]">
                Description
              </AccordionTrigger>
              <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                {product.description ?? product.shortDescription}
              </AccordionContent>
            </AccordionItem>
            {product.materials && (
              <AccordionItem value="materials">
                <AccordionTrigger className="text-sm font-semibold uppercase tracking-[0.14em]">
                  Materials
                </AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                  {product.materials}
                </AccordionContent>
              </AccordionItem>
            )}
            {product.careInstructions && (
              <AccordionItem value="care">
                <AccordionTrigger className="text-sm font-semibold uppercase tracking-[0.14em]">
                  Care Instructions
                </AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                  {product.careInstructions}
                </AccordionContent>
              </AccordionItem>
            )}
            <AccordionItem value="shipping">
              <AccordionTrigger className="text-sm font-semibold uppercase tracking-[0.14em]">
                Shipping &amp; Returns
              </AccordionTrigger>
              <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                Orders are packed carefully and dispatched after confirmation. For timelines,
                shipping charges and returns, see our{" "}
                <Link href="/policies/shipping" className="underline hover:text-foreground">
                  shipping policy
                </Link>{" "}
                and{" "}
                <Link href="/policies/returns" className="underline hover:text-foreground">
                  return policy
                </Link>
                .
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="text-center font-serif text-3xl font-medium">You May Also Like</h2>
          <div className="mx-auto mt-4 h-px w-24 gold-line" />
          <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
