import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Banknote, RotateCcw, ShieldCheck, Star, Truck } from "lucide-react";
import { apiProduct, apiProducts, apiProductReviews, apiProductQuestions, apiMe } from "@/lib/server-api";
import { fetchSeoConfig } from "@/lib/seo";
import { ProductCard } from "@/components/stellora/product-card";
import { WishlistButton } from "@/components/stellora/wishlist-button";
import { ProductGallery } from "@/components/stellora/product-detail-client";
import { ProductPurchase } from "@/components/stellora/product-purchase";
import { RecordRecentlyViewed } from "@/components/stellora/recently-viewed";
import { ReviewsSection } from "@/components/stellora/reviews-section";
import { QaSection } from "@/components/stellora/qa-section";
import { DeliveryEstimator } from "@/components/stellora/delivery-estimator";
import { StickyBuyBar } from "@/components/stellora/sticky-buy-bar";
import { ShareButton } from "@/components/stellora/share-button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
  const [product, seo] = await Promise.all([getProduct(slug), fetchSeoConfig()]);
  if (!product) return { title: "Product" };
  const v = product.variants[0];
  return {
    title: product.name,
    description:
      product.shortDescription ??
      `Shop ${product.name} at ${seo.businessName || seo.siteName} — premium quality, carefully packed, delivered across India.`,
    keywords: [...seo.keywords, product.name.toLowerCase()].slice(0, 60),
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${product.name} · ${seo.siteName}`,
      description: product.shortDescription ?? undefined,
      images: product.images[0]?.url ? [{ url: product.images[0].url }] : undefined,
    },
    twitter: {
      card: "summary_large_image" as const,
      title: product.name,
      description: product.shortDescription ?? undefined,
      images: product.images[0]?.url ? [product.images[0].url] : undefined,
    },
    other: v
      ? ({ "product:price:amount": String(v.price), "product:price:currency": "INR" } as Record<string, string>)
      : undefined,
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

  const [reviewsData, questionsData, session] = await Promise.all([
    apiProductReviews(product.id).catch(() => null),
    apiProductQuestions(product.id).catch(() => ({ questions: [] })),
    apiMe().catch(() => ({ user: null })),
  ]);

  const v = product.variants.find((x) => x.stock > 0) ?? product.variants[0];
  const inStock = product.variants.some((x) => x.stock > 0);
  const ratingSummary = reviewsData?.summary;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const productJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: product.category?.name ?? "Shop",
            item: `${siteUrl}/category/${product.category?.slug ?? "shop"}`,
          },
          { "@type": "ListItem", position: 3, name: product.name, item: `${siteUrl}/product/${product.slug}` },
        ],
      },
      ...(v
        ? [
            {
              "@type": "Product",
              name: product.name,
              description: product.shortDescription ?? undefined,
              sku: v.sku ?? undefined,
              image: product.images.map((i) => i.url),
              category: product.category?.name,
              brand: { "@type": "Brand", name: "Stellora" },
              offers: {
                "@type": "Offer",
                url: `${siteUrl}/product/${product.slug}`,
                priceCurrency: "INR",
                price: String(v.price),
                availability:
                  product.variants.some((x) => x.stock > 0)
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock",
                itemCondition: "https://schema.org/NewCondition",
              },
            },
          ]
        : []),
    ],
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <RecordRecentlyViewed productId={product.id} />
      <script
        type="application/ld+json"
        async
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
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
        <ProductGallery images={product.images} productName={product.name} videoUrl={product.videoUrl} />

        <div className="flex flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
            {product.category?.name ?? "Stellora"}
          </p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="font-serif text-3xl font-medium leading-tight sm:text-4xl">
              {product.name}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              <ShareButton path={`/product/${product.slug}`} name={product.name} />
              <WishlistButton productId={product.id} className="shrink-0" />
            </div>
          </div>

          {ratingSummary && ratingSummary.count > 0 && (
            <a
              href="#reviews"
              className="mt-2.5 flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <span className="flex items-center gap-0.5" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3.5 w-3.5 ${
                      i < Math.round(ratingSummary.average)
                        ? "fill-primary text-primary"
                        : "text-border"
                    }`}
                  />
                ))}
              </span>
              <span className="font-semibold text-foreground tnum">
                {ratingSummary.average.toFixed(1)}
              </span>
              <span className="tnum">({ratingSummary.count} review{ratingSummary.count === 1 ? "" : "s"})</span>
            </a>
          )}

          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {product.shortDescription}
          </p>

          <div id="purchase-panel" className="mt-2 scroll-mt-28">
            <ProductPurchase
              variants={product.variants}
              productId={product.id}
              imageUrl={product.images[0]?.url ?? null}
              productName={product.name}
              slug={product.slug}
            />
          </div>

          <div className="mt-6">
            <DeliveryEstimator unitPrice={Number(v?.price ?? 0)} />
          </div>

          {/* Four-up trust strip — the assurances shoppers scan for */}
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-4">
            {[
              { icon: Truck, title: "Free Shipping", note: "On orders over ₹1,999" },
              { icon: ShieldCheck, title: "Secure Payment", note: "Encrypted checkout" },
              { icon: RotateCcw, title: "7-Day Returns", note: "No-question refunds" },
              { icon: BadgeCheck, title: "Quality Checked", note: "Inspected pre-dispatch" },
            ].map((t) => (
              <div
                key={t.title}
                className="group flex flex-col items-center gap-1.5 bg-card px-3 py-4 text-center transition-colors hover:bg-accent/50"
              >
                <t.icon className="h-5 w-5 text-primary transition-transform duration-300 group-hover:scale-110" />
                <p className="text-xs font-semibold">{t.title}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">{t.note}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Banknote className="h-3.5 w-3.5 text-primary" />
            Pay online via card / UPI, or cash on delivery
          </p>

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

      {reviewsData && (
        <div id="reviews" className="mt-16 scroll-mt-28">
          <ReviewsSection
            productId={product.id}
            summary={reviewsData.summary}
            reviews={reviewsData.reviews}
            isLoggedIn={!!session.user}
            myPendingReview={reviewsData.myPendingReview}
          />
        </div>
      )}

      <div id="qa" className="mt-16 scroll-mt-28">
        <QaSection
          productId={product.id}
          initialQuestions={questionsData.questions}
          isLoggedIn={!!session.user}
        />
      </div>

      {/* Mobile-only sticky purchase bar — always one tap from checkout */}
      {v && (
        <StickyBuyBar
          variantId={v.id}
          price={Number(v.price)}
          title={product.name}
          imageUrl={product.images[0]?.url ?? "/images/placeholder.svg"}
          inStock={inStock}
        />
      )}

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
