import Link from "next/link";
import { Instagram, Facebook, Twitter, Youtube } from "lucide-react";
import { NewsletterForm } from "@/components/stellora/newsletter-form";

const CATEGORIES = [
  { slug: "jewellery", name: "Jewellery" },
  { slug: "hair-extensions", name: "Hair Extensions" },
  { slug: "vanity", name: "Vanity" },
  { slug: "handbags", name: "Handbags" },
];

export function Footer({ settings }: { settings: Record<string, string> }) {
  const contact = settings.contact_email || settings.contact_phone;
  const socials = [
    { key: "social_instagram", label: "Instagram", icon: Instagram },
    { key: "social_facebook", label: "Facebook", icon: Facebook },
    { key: "social_twitter", label: "Twitter / X", icon: Twitter },
    { key: "social_youtube", label: "YouTube", icon: Youtube },
  ].filter((s) => settings[s.key]);
  return (
    <footer className="mt-auto border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <p className="font-serif text-2xl font-semibold tracking-[0.18em]">STELLORA</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Sterling and artificial jewellery, hair extensions, vanity essentials and handbags —
              curated with care, presented with elegance.
            </p>
            {socials.length > 0 && (
              <div className="mt-5 flex items-center gap-2">
                {socials.map((s) => (
                  <a
                    key={s.key}
                    href={settings[s.key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Stellora on ${s.label}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    <s.icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
            <div className="mt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.14em]">Newsletter</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                New pieces, early access, members-only offers.
              </p>
              <div className="mt-3">
                <NewsletterForm />
              </div>
            </div>
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
          {/* Accepted payments — instant trust signal above the fold line */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              100% Secure Payments · Accepted Here
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {["UPI", "VISA", "MASTERCARD", "RUPAY", "NET BANKING", "COD"].map((m) => (
                <span key={m} className="pay-chip">
                  {m}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            {contact
              ? `Customer care: ${[settings.contact_email, settings.contact_phone].filter(Boolean).join(" · ")}`
              : "Customer care details will be published here once confirmed by the store."}
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Stellora. All rights reserved.
          </p>
          <p className="mt-2 text-center">
            <Link
              href="/admin/login?next=/admin-console"
              className="text-[11px] text-muted-foreground/60 transition hover:text-primary"
            >
              Master Control
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
