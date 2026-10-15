import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/stellora/section-heading";

export const metadata = { title: "About Us" };

export default function AboutPage() {
  return (
    <div>
      <section className="relative h-72 overflow-hidden sm:h-96">
        <Image
          src="/images/banners/category-jewellery.jpg"
          alt="Stellora collections"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-10 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-primary">
            Our Story
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium sm:text-5xl">
            Beautiful things, chosen with care
          </h1>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Stellora is a boutique retail destination built around four things we love: sterling and
          artificial jewellery, hair extensions, vanity essentials, and handbags. What began as a
          beloved neighbourhood store has grown into an online destination — with the same curation,
          the same warm service, and the same joy in matching a piece to a person.
        </p>
        <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
          We buy slowly and choose carefully. Every necklace, bundle, lipstick and bag is picked by
          hand, inspected for quality, and presented the way we would want to receive it. If it
          would not make it onto our own shelves, it does not make it onto yours.
        </p>

        <div className="mt-14">
          <SectionHeading eyebrow="What we stand for" title="The Stellora Way" />
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              {
                title: "Curated, not crowded",
                text: "A tight, considered edit rather than an endless catalogue. Fewer, better pieces.",
              },
              {
                title: "Honest by default",
                text: "Clear prices, real stock, and statuses you can trust — no theatrics, no pressure.",
              },
              {
                title: "Service like family",
                text: "Questions answered by people who know the products, not scripts.",
              },
            ].map((v) => (
              <div key={v.title} className="text-center">
                <h3 className="font-serif text-lg font-medium">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 rounded-xl border border-border/70 bg-secondary/40 p-8 text-center">
          <h3 className="font-serif text-2xl font-medium">Visit the boutique</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Prefer to shop in person? Our store carries the full collection — try pieces on, feel
            the finishes, and take home something that feels like you.
          </p>
          <Button asChild className="mt-6 rounded-full bg-primary px-8 hover:bg-primary/90">
            <Link href="/contact">Get in touch</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
