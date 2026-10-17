"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Award,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Facebook,
  Flame,
  Gem,
  Gift,
  Heart,
  Instagram,
  LogIn,
  MessageCircle,
  Package,
  Phone,
  Scissors,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/stellora/theme-toggle";

/* ---------- Types ---------- */

export interface MegaCategory {
  slug: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  _count?: { products: number };
}

export interface SidebarSocials {
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
}

export interface NavSidebarProps {
  open: boolean;
  onClose: () => void;
  onOpenSearch: () => void;
  user: { name: string; role: string } | null;
  categories: MegaCategory[];
  socials: SidebarSocials;
}

/* ---------- Static config ---------- */

const CATEGORY_ICONS: Record<string, typeof Gem> = {
  jewellery: Gem,
  "hair-extensions": Scissors,
  vanity: Sparkles,
  handbags: ShoppingBag,
};

const COLLECTIONS = [
  { href: "/shop?new=1", label: "New Arrivals", icon: Flame },
  { href: "/shop?best=1", label: "Best Sellers", icon: Award },
  { href: "/shop?featured=1", label: "Featured Edits", icon: Star },
  { href: "/shop", label: "Shop Everything", icon: ShoppingBag },
];

const QUICK_LINKS = [
  { href: "/account/orders", label: "My Orders", icon: Package },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/track-order", label: "Track Order", icon: Truck },
  { href: "/account", label: "My Account", icon: UserRound },
];

const HELP_LINKS = [
  { href: "/support", label: "Support Hub", icon: CircleHelp },
  { href: "/contact", label: "Contact Us", icon: Phone },
];

const COUPON_CODE = "WELCOME10";
const COPIED_RESET_MS = 1600;

/* Staggered entrance: 60ms per section, capped at ~360ms total. */
const stepDelay = (step: number) => ({ animationDelay: `${Math.min(step * 60, 360)}ms` });

/* One staggered drawer section. Base state is fully visible — the animation
   only plays on entrance, so content never depends on JS/CSS to appear. */
function Staggered({ step, children }: { step: number; children: ReactNode }) {
  return (
    <section className="nav-sidebar-item" style={stepDelay(step)}>
      {children}
    </section>
  );
}

/* Section eyebrow label, shared by every group below. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
      {children}
    </p>
  );
}

export function NavSidebar({ open, onClose, onOpenSearch, user, categories, socials }: NavSidebarProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<number | null>(null);
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(() => new Set());
  const [copied, setCopied] = useState(false);

  // Body scroll lock + Escape-to-close — owned by the drawer, keyed on `open`.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Move focus to the close button when the drawer opens (a11y entry point).
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // Clear a pending "Copied" revert timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  // Track category photos that failed to load so their card swaps to a
  // branded gradient tile — a drawer card must never look broken.
  const markImageFailed = (slug: string) => {
    setFailedImages((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Set(prev);
      next.add(slug);
      return next;
    });
  };

  const copyCoupon = async () => {
    try {
      await navigator.clipboard.writeText(COUPON_CODE);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — fail silently.
    }
  };

  const firstName = user?.name.trim().split(/\s+/)[0] ?? "";
  const initial = firstName.charAt(0).toUpperCase();
  const whatsappHref = socials.whatsapp
    ? socials.whatsapp.startsWith("http")
      ? socials.whatsapp
      : `https://wa.me/${socials.whatsapp.replace(/\D/g, "")}`
    : null;
  const hasSocials = Boolean(socials.instagram || socials.facebook || whatsappHref);

  return (
    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Shop menu">
      {/* Backdrop — click to dismiss */}
      <div
        className="drawer-backdrop absolute inset-0 bg-foreground/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div className="drawer-panel absolute inset-y-0 left-0 flex w-[86vw] max-w-[380px] flex-col bg-background shadow-2xl">
        {/* Panel header — wordmark + tagline + close */}
        <div className="flex items-start justify-between px-5 pb-3 pt-5">
          <div className="pt-1.5">
            <p className="font-serif text-[22px] font-semibold leading-none tracking-[0.18em] text-foreground">
              STELLORA
            </p>
            <p className="mt-1.5 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              Premium Finds
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="btn-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground/80 transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable middle */}
        <nav className="stellora-scroll flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-1">
          {/* Account strip */}
          <Staggered step={0}>
            {user ? (
              <Link
                href="/account"
                onClick={onClose}
                className="btn-press flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
              >
                <span className="brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-primary-foreground">
                  {initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    Hi, {firstName}
                  </span>
                  <span className="block text-xs text-muted-foreground">Account, orders &amp; rewards</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/login"
                  onClick={onClose}
                  className="btn-press flex items-center justify-center gap-2 rounded-xl brand-gradient px-3 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
                >
                  <LogIn className="h-4 w-4" /> Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={onClose}
                  className="btn-press flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent"
                >
                  <UserRoundPlus className="h-4 w-4 text-primary" /> Create account
                </Link>
              </div>
            )}
          </Staggered>

          {/* Search launch affordance (opens the header search, not a real input) */}
          <Staggered step={1}>
            <button
              type="button"
              onClick={onOpenSearch}
              className="btn-press flex w-full items-center gap-3 rounded-full border border-border bg-card px-4 py-3 text-left transition hover:border-primary/50"
            >
              <Search className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm text-muted-foreground">Search jewellery, hair, gifts…</span>
            </button>
          </Staggered>

          {/* Shop by category — visual cards with graceful image fallback */}
          <Staggered step={2}>
            <SectionLabel>Shop by category</SectionLabel>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {categories.map((c) => {
                const Icon = CATEGORY_ICONS[c.slug] ?? ShoppingBag;
                const showFallback = !c.imageUrl || failedImages.has(c.slug);
                return (
                  <Link
                    key={c.slug}
                    href={`/category/${c.slug}`}
                    onClick={onClose}
                    className={`btn-press group relative aspect-[4/3] overflow-hidden rounded-xl border border-border ${
                      showFallback ? "" : "img-frame"
                    }`}
                  >
                    {showFallback ? (
                      <span className="brand-gradient absolute inset-0 flex items-center justify-center">
                        <Icon className="h-9 w-9 text-primary-foreground/90" />
                      </span>
                    ) : (
                      <Image
                        src={c.imageUrl!}
                        alt={c.name}
                        fill
                        sizes="(max-width: 1024px) 45vw, 220px"
                        className="object-cover"
                        onError={() => markImageFailed(c.slug)}
                      />
                    )}
                    {/* Bottom scrim keeps the caption readable on light photos */}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition group-hover:bg-white/25">
                      <ChevronRight className="h-3.5 w-3.5 text-white transition group-hover:translate-x-0.5" />
                    </span>
                    <span className="absolute inset-x-0 bottom-0 p-2.5">
                      <span className="block truncate text-[13px] font-medium leading-tight text-white">
                        {c.name}
                      </span>
                      <span className="tnum block text-[11px] text-white/75">
                        {c._count?.products ?? 0} products
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </Staggered>

          {/* Collections — edge-to-edge chip row */}
          <Staggered step={3}>
            <SectionLabel>Collections</SectionLabel>
            <div className="nav-sidebar-scroll-x -mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5 pb-1">
              {COLLECTIONS.map((col) => (
                <Link
                  key={col.label}
                  href={col.href}
                  onClick={onClose}
                  className="btn-press flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground transition hover:border-primary/40 hover:bg-accent"
                >
                  <col.icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {col.label}
                </Link>
              ))}
            </div>
          </Staggered>

          {/* Welcome offer — tap the pill to copy the code */}
          <Staggered step={4}>
            <div className="brand-gradient rounded-xl p-4 text-primary-foreground">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
                  <Gift className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">Welcome offer</p>
                  <p className="mt-0.5 text-xs leading-snug text-primary-foreground/85">
                    Use code {COUPON_CODE} for 10% off your first order.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={copyCoupon}
                aria-label={`Copy coupon code ${COUPON_CODE}`}
                className="btn-press mt-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary-foreground/60 bg-primary-foreground/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground transition hover:bg-primary-foreground/20"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : COUPON_CODE}
              </button>
            </div>
          </Staggered>

          {/* Quick links */}
          <Staggered step={5}>
            <SectionLabel>Quick links</SectionLabel>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {QUICK_LINKS.map((row) => (
                <Link
                  key={row.href}
                  href={row.href}
                  onClick={onClose}
                  className="btn-press flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-[13px] font-medium text-foreground transition hover:border-primary/40 hover:bg-accent"
                >
                  <row.icon className="h-4 w-4 shrink-0 text-primary" />
                  {row.label}
                </Link>
              ))}
            </div>
          </Staggered>

          {/* Help & connect */}
          <Staggered step={6}>
            <SectionLabel>Help &amp; connect</SectionLabel>
            <div className="mt-1.5 space-y-0.5">
              {HELP_LINKS.map((row) => (
                <Link
                  key={row.href}
                  href={row.href}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-foreground/85 transition hover:bg-accent hover:text-foreground"
                >
                  <row.icon className="h-4 w-4 shrink-0 text-primary" />
                  {row.label}
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
            {/* External links intentionally do NOT close the drawer */}
            {hasSocials && (
              <div className="mt-2 flex items-center gap-2 px-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Follow
                </span>
                {socials.instagram && (
                  <a
                    href={socials.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    <Instagram className="h-4 w-4" />
                  </a>
                )}
                {socials.facebook && (
                  <a
                    href={socials.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    <Facebook className="h-4 w-4" />
                  </a>
                )}
                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="WhatsApp"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
          </Staggered>
        </nav>

        {/* Panel footer — micro-caption + theme toggle, iOS safe-area padded */}
        <div className="border-t border-border px-5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Stellora · Premium Finds
            </p>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
