import Link from "next/link";

const CATEGORIES = [
  { slug: "jewellery", name: "Jewellery" },
  { slug: "hair-extensions", name: "Hair Extensions" },
  { slug: "vanity", name: "Vanity" },
  { slug: "handbags", name: "Handbags" },
];

export function Footer({ settings }: { settings: Record<string, string> }) {
  const contact = settings.contact_email || settings.contact_phone;
  return (
    <footer className="mt-auto border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <p className="font-serif text-2xl font-semibold tracking-[0.18em]">STELLORA</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Sterling and artificial jewellery, hair extensions, vanity essentials and handbags —
              curated with care, presented with elegance.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.16em]">Shop</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/shop" className="text-muted-foreground transition hover:text-foreground">Shop All</Link></li>
              {CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <Link href={`/category/${c.slug}`} className="text-muted-foreground transition hover:text-foreground">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.16em]">Help</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/track-order" className="text-muted-foreground transition hover:text-foreground">Track Order</Link></li>
              <li><Link href="/policies/shipping" className="text-muted-foreground transition hover:text-foreground">Shipping Policy</Link></li>
              <li><Link href="/policies/returns" className="text-muted-foreground transition hover:text-foreground">Returns &amp; Refunds</Link></li>
              <li><Link href="/faq" className="text-muted-foreground transition hover:text-foreground">FAQ</Link></li>
              <li><Link href="/support" className="text-muted-foreground transition hover:text-foreground">Customer Support</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.16em]">Stellora</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/about" className="text-muted-foreground transition hover:text-foreground">About Us</Link></li>
              <li><Link href="/contact" className="text-muted-foreground transition hover:text-foreground">Contact Us</Link></li>
              <li><Link href="/policies/privacy" className="text-muted-foreground transition hover:text-foreground">Privacy Policy</Link></li>
              <li><Link href="/policies/terms" className="text-muted-foreground transition hover:text-foreground">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-center text-xs text-muted-foreground">
            {contact
              ? `Customer care: ${[settings.contact_email, settings.contact_phone].filter(Boolean).join(" · ")}`
              : "Customer care details will be published here once confirmed by the store."}
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Stellora. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
