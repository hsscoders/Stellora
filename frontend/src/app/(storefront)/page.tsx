import Image from "next/image";
import Link from "next/link";
import { apiBanners, apiCategories, apiProducts } from "@/lib/server-api";
import { ProductCard } from "@/components/stellora/product-card";
import { SectionHeading } from "@/components/stellora/section-heading";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Truck, Headset, BadgeCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [banners, categories, featuredRes, newArrivalsRes, bestSellersRes] = await Promise.all([
    apiBanners(),
    apiCategories(),
    apiProducts({ featured: "1", page: 1 }),
    apiProducts({ sort: "newest", page: 1 }),
    apiProducts({ best: "1", page: 1 }),
  ]);
  const featured = featuredRes.products;
  const newArrivals = newArrivalsRes.products;
  const bestSellers = bestSellersRes.products;

  const hero = banners[0];
  const promo = banners[1];

  return (
    <div>
      {/* Hero */}
      <section className="relative">
        <div className="relative h-[440px] w-full overflow-hidden sm:h-[520px] lg:h-[600px]">
          {hero && (
            <Image
              src={hero.imageUrl}
              alt={hero.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/55 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
              <div className="max-w-xl">
                {hero && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-primary">
                      New Season
                    </p>
                    <h1 className="mt-4 font-serif text-5xl font-medium leading-[1.08] text-foreground sm:text-6xl">
                      {hero.title}
                    </h1>
                    <p className="mt-4 max-w-md text-[15px] leading-relaxed text-foreground/75">
                      {hero.subtitle}
                    </p>
                    {hero.ctaHref && (
                      <Button
                        asChild
                        size="lg"
                        className="mt-8 rounded-full bg-primary px-8 text-sm tracking-wide hover:bg-primary/90"
                      >
                        <Link href={hero.ctaHref}>{hero.ctaLabel ?? "Shop Now"}</Link>
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <SectionHeading eyebrow="Collections" title="Shop by Category" />
        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              className="zoom-hover group relative overflow-hidden rounded-lg border border-border/60"
            >
              <div className="relative aspect-[4/5]">
                <Image
                  src={c.imageUrl ?? "/images/placeholder.svg"}
                  alt={c.name}
                  fill
                  sizes="(max-width: 1024px) 50vw, 25vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                  <h3 className="font-serif text-lg font-medium text-white sm:text-xl">{c.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/80">
                    {c.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <SectionHeading eyebrow="Curated" title="Featured Selections" />
          <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {featured.slice(0, 4).map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 2} />
            ))}
          </div>
        </section>
      )}

      {/* Promo banner */}
      {promo && (
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <div className="relative overflow-hidden rounded-xl border border-border/60">
            <div className="relative h-64 w-full sm:h-80">
              <Image src={promo.imageUrl} alt={promo.title} fill sizes="100vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
            </div>
            <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-12">
              <div className="max-w-sm">
                <h3 className="font-serif text-3xl font-medium sm:text-4xl">{promo.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/75">{promo.subtitle}</p>
                {promo.ctaHref && (
                  <Button asChild variant="outline" className="mt-5 rounded-full bg-background/80 px-6">
                    <Link href={promo.ctaHref}>{promo.ctaLabel ?? "Discover"}</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* New arrivals */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="flex items-end justify-between">
          <SectionHeading eyebrow="Just In" title="New Arrivals" align="left" className="[&>div]:mx-0" />
          <Button asChild variant="link" className="hidden text-primary sm:inline-flex">
            <Link href="/shop">View all →</Link>
          </Button>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {newArrivals.slice(0, 8).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Best sellers */}
      {bestSellers.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <div className="flex items-end justify-between">
            <SectionHeading eyebrow="Loved Most" title="Best Sellers" align="left" className="[&>div]:mx-0" />
            <Button asChild variant="link" className="hidden text-primary sm:inline-flex">
              <Link href="/shop">View all →</Link>
            </Button>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {bestSellers.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Brand story */}
      <section className="border-y border-border/60 bg-secondary/40">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
            <Image
              src="/images/banners/category-jewellery.jpg"
              alt="The Stellora atelier"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div>
            <SectionHeading eyebrow="Our Story" title="Quiet Luxury, Every Day" align="left" className="[&>div]:mx-0" />
            <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground">
              Stellora began with a simple belief — that beautiful things should feel personal.
              From sterling and artificial jewellery to hair extensions, vanity essentials and
              handbags, every piece in our boutique is chosen the way we choose for friends:
              slowly, carefully, and with an eye for pieces that feel like you.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              What you see online is an extension of our shelves. The same warm service, the same
              curation, the same little luxuries — now a tap away, wherever you are.
            </p>
            <Button asChild variant="outline" className="mt-8 rounded-full px-6">
              <Link href="/about">Read our story</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
          {[
            { icon: BadgeCheck, title: "Curated Quality", text: "Every piece inspected before it ships." },
            { icon: ShieldCheck, title: "Secure Checkout", text: "Your data is protected end to end." },
            { icon: Truck, title: "Reliable Delivery", text: "Careful packaging on every order." },
            { icon: Headset, title: "Real Support", text: "A real person, ready to help." },
          ].map((f) => (
            <div key={f.title} className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <f.icon className="h-5 w-5 text-accent-foreground" />
              </div>
              <h4 className="mt-3 text-sm font-semibold">{f.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
