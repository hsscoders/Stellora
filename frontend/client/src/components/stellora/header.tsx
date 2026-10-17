"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ShoppingBag,
  Heart,
  Search,
  Menu,
  UserRound,
  X,
  LogOut,
  Package,
  Gem,
  Scissors,
  Sparkles,
  Flame,
  Award,
  ChevronRight,
  Gift,
  Truck,
  Phone,
  CircleHelp,
  Instagram,
  Facebook,
  Star,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { ThemeToggle } from "@/components/stellora/theme-toggle";
import { SearchSuggest } from "@/components/stellora/search-suggest";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CATEGORIES = [
  { slug: "jewellery", name: "Jewellery" },
  { slug: "hair-extensions", name: "Hair Extensions" },
  { slug: "vanity", name: "Vanity" },
  { slug: "handbags", name: "Handbags" },
];

const CATEGORY_ICONS: Record<string, typeof Gem> = {
  jewellery: Gem,
  "hair-extensions": Scissors,
  vanity: Sparkles,
  handbags: ShoppingBag,
};

interface MegaCategory {
  slug: string;
  name: string;
  description?: string | null;
  _count?: { products: number };
}

const COLLECTIONS = [
  { href: "/shop?new=1", label: "New Arrivals", icon: Flame },
  { href: "/shop?best=1", label: "Best Sellers", icon: Award },
  { href: "/shop?featured=1", label: "Featured Edits", icon: Star },
  { href: "/shop", label: "Shop Everything", icon: ShoppingBag },
];

export function Header({ announcement }: { announcement: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const cart = useStore((s) => s.cart);
  const setCartOpen = useStore((s) => s.setCartOpen);
  const refreshCart = useStore((s) => s.refreshCart);
  const refreshWishlist = useStore((s) => s.refreshWishlist);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [megaCategories, setMegaCategories] = useState<MegaCategory[]>(CATEGORIES);
  const [socials, setSocials] = useState<{ instagram?: string; facebook?: string; whatsapp?: string }>({});
  const lastY = useRef(0);
  const socialsLoaded = useRef(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        setScrolled(y > 8);
        const goingDown = y > lastY.current + 4 && y > 140;
        const goingUp = y < lastY.current - 4;
        if (goingDown) setHeaderHidden(true);
        else if (goingUp || y <= 140) setHeaderHidden(false);
        lastY.current = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);
  const [q, setQ] = useState("");

  useEffect(() => {
    refreshCart();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => j.ok && setUser(j.data.user))
      .catch(() => {});
    fetch("/api/wishlist")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.ok && useStore.setState({ wishlist: j.data.map((i: { productId: string }) => i.productId) }))
      .catch(() => {});
    // Live categories (with product counts) power the mega menu + drawer
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.ok && Array.isArray(j.data) && j.data.length > 0) {
          const timeout = window.setTimeout(() => setMegaCategories(j.data), 0);
          return () => window.clearTimeout(timeout);
        }
      })
      .catch(() => {});
  }, [pathname, refreshCart, refreshWishlist]);

  // Social links for the drawer — fetched once, lazily on first open
  useEffect(() => {
    if (!mobileOpen || socialsLoaded.current) return;
    socialsLoaded.current = true;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.ok) return;
        const map = Object.fromEntries(
          (j.data as { key: string; value: string }[]).map((s) => [s.key, s.value])
        );
        const timeout = window.setTimeout(
          () => setSocials({ instagram: map.instagram, facebook: map.facebook, whatsapp: map.whatsapp }),
          0
        );
        return () => window.clearTimeout(timeout);
      })
      .catch(() => {});
  }, [mobileOpen]);

  // Lock body scroll while the mobile drawer is open (Escape closes it).
  // The drawer itself closes on link clicks / backdrop tap / route changes
  // handled by the menu's onClick handlers.
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  };

  const wishlist = useStore((s) => s.wishlist);

  return (
    <>
      <header
        className={`sticky top-0 z-50 border-b border-border/70 backdrop-blur-md transition-[transform,box-shadow,background-color] duration-300 will-change-transform ${
          headerHidden && !searchOpen ? "-translate-y-full" : "translate-y-0"
        } ${scrolled ? "bg-background/95 shadow-lg shadow-foreground/5" : "bg-background/90"}`}
      >
        {announcement && (
          <div className="brand-gradient text-primary-foreground">
            <p className="mx-auto max-w-7xl truncate px-4 py-1.5 text-center text-[10px] tracking-wide sm:px-6 sm:text-xs">
              {announcement}
            </p>
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <button
            className="-ml-1 p-2 lg:hidden"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/" className="mr-auto flex flex-col items-center leading-none sm:mr-2 lg:mr-2">
            <span className="font-serif text-[21px] font-semibold tracking-[0.14em] text-foreground sm:text-[26px] sm:tracking-[0.18em]">
              STELLORA
            </span>
            <span className="text-[8px] uppercase tracking-[0.3em] text-muted-foreground sm:text-[9px] sm:tracking-[0.35em]">
              Premium Finds
            </span>
          </Link>

          <nav
            className="ml-6 hidden items-center gap-7 text-[13px] font-medium uppercase tracking-[0.14em] lg:flex"
            onMouseEnter={() => setMegaOpen(true)}
          >
            <Link
              href="/shop"
              aria-current={pathname === "/shop" ? "page" : undefined}
              className={`nav-underline transition-colors hover:text-primary ${pathname === "/shop" ? "text-primary" : "text-foreground/80"}`}
            >
              Shop All
            </Link>
            {CATEGORIES.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                aria-current={pathname === `/category/${c.slug}` ? "page" : undefined}
                className={`nav-underline transition-colors hover:text-primary ${pathname === `/category/${c.slug}` ? "text-primary" : "text-foreground/80"}`}
              >
                {c.name}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <button
              className="p-2 text-foreground/80 transition hover:text-foreground"
              aria-label="Search"
              onClick={() => setSearchOpen((v) => !v)}
            >
              <Search className="h-5 w-5" />
            </button>
            <ThemeToggle />
            <Link
              href="/wishlist"
              className="relative p-2 text-foreground/80 transition hover:text-foreground"
              aria-label="Wishlist"
            >
              <Heart className="h-5 w-5" />
              {wishlist.length > 0 && (
                <span className="anim-pop absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tnum">
                  {wishlist.length}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative p-2 text-foreground/80 transition hover:text-foreground"
              aria-label={`Open cart${cart && cart.itemCount > 0 ? ` (${cart.itemCount} items)` : ""}`}
            >
              <ShoppingBag className="h-5 w-5" />
              {cart && cart.itemCount > 0 && (
                <span key={cart.itemCount} className="anim-pop absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tnum">
                  {cart.itemCount}
                </span>
              )}
            </button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account">
                    <UserRound className="h-5 w-5 text-foreground/80" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-3 py-2 text-sm">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">My account</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/account">
                      <Package className="h-4 w-4" /> Orders &amp; Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign in"
                onClick={() => router.push("/login")}
              >
                <UserRound className="h-5 w-5 text-foreground/80" />
              </Button>
            )}
          </div>
        </div>

        {/* Desktop mega menu — live categories with counts + collections */}
        {megaOpen && (
          <div
            className="absolute inset-x-0 top-full hidden border-b border-border/70 bg-background/97 shadow-xl shadow-foreground/5 backdrop-blur-md lg:block"
            onMouseLeave={() => setMegaOpen(false)}
          >
            <div className="mx-auto grid max-w-7xl gap-6 px-6 py-7 lg:grid-cols-[1fr_260px]">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {megaCategories.map((c) => {
                  const Icon = CATEGORY_ICONS[c.slug] ?? ShoppingBag;
                  return (
                    <Link
                      key={c.slug}
                      href={`/category/${c.slug}`}
                      onClick={() => setMegaOpen(false)}
                      className="group rounded-xl border border-border/70 bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <p className="mt-3 text-sm font-semibold">{c.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground tnum">
                        {c._count?.products ?? 0} products
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary opacity-0 transition group-hover:opacity-100">
                        Explore <ChevronRight className="h-3 w-3" />
                      </span>
                    </Link>
                  );
                })}
              </div>
              <div className="rounded-xl border border-border/70 bg-card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Collections
                </p>
                <div className="mt-3 space-y-1">
                  {COLLECTIONS.map((col) => (
                    <Link
                      key={col.label}
                      href={col.href}
                      onClick={() => setMegaOpen(false)}
                      className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-foreground/80 transition hover:bg-accent hover:text-foreground"
                    >
                      <col.icon className="h-4 w-4 text-primary" /> {col.label}
                    </Link>
                  ))}
                </div>
                <div className="mt-4 rounded-lg brand-gradient p-3 text-primary-foreground">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <Gift className="h-3.5 w-3.5" /> Welcome offer
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-primary-foreground/85">
                    Use code <span className="font-bold tracking-wide">WELCOME10</span> for 10% off
                    your first order.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {searchOpen && (
          <div className="border-t border-border/70 bg-background px-4 py-3 sm:px-6">
            <SearchSuggest onNavigate={() => setSearchOpen(false)} />
          </div>
        )}
      </header>

      {/* Mobile menu — rendered OUTSIDE <header> on purpose: the header's
          backdrop-blur creates a containing block that would trap the fixed
          drawer to the header's box, leaving the panel transparent/broken. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            className="drawer-backdrop absolute inset-0 bg-foreground/45 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="drawer-panel absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col bg-background p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-serif text-xl tracking-[0.18em]">STELLORA</span>
              <button aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="stellora-scroll mt-6 flex flex-1 flex-col gap-5 overflow-y-auto pb-4" onClick={() => setMobileOpen(false)}>
              <section>
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Shop by category
                </p>
                <div className="mt-2 space-y-0.5">
                  {megaCategories.map((c) => {
                    const Icon = CATEGORY_ICONS[c.slug] ?? ShoppingBag;
                    return (
                      <Link
                        key={c.slug}
                        href={`/category/${c.slug}`}
                        className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-accent"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="flex-1 text-[15px] font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground tnum">
                          {c._count?.products ?? 0}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    );
                  })}
                </div>
              </section>

              <section>
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Collections
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {COLLECTIONS.map((col) => (
                    <Link
                      key={col.label}
                      href={col.href}
                      className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3 transition hover:border-primary/40"
                    >
                      <col.icon className="h-4 w-4 text-primary" />
                      <span className="text-[13px] font-medium leading-tight">{col.label}</span>
                    </Link>
                  ))}
                </div>
              </section>

              <Link
                href="/shop"
                className="flex items-center gap-2.5 rounded-xl brand-gradient px-4 py-3 text-sm font-medium text-primary-foreground"
              >
                <Gift className="h-4 w-4" />
                Offers live — WELCOME10 &amp; FLAT200
                <ChevronRight className="ml-auto h-4 w-4" />
              </Link>

              <section>
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Account &amp; orders
                </p>
                <div className="mt-2 space-y-0.5">
                  {[
                    { href: "/account", label: user ? "My Account & Rewards" : "Sign In", icon: UserRound },
                    { href: "/account/orders", label: "My Orders", icon: Package },
                    { href: "/wishlist", label: "Wishlist", icon: Heart },
                    { href: "/track-order", label: "Track Order", icon: Truck },
                  ].map((row) => (
                    <Link
                      key={row.href}
                      href={row.href}
                      className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] transition hover:bg-accent"
                    >
                      <row.icon className="h-4 w-4 text-primary" /> {row.label}
                    </Link>
                  ))}
                </div>
              </section>

              <section>
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Help
                </p>
                <div className="mt-2 space-y-0.5">
                  {[
                    { href: "/support", label: "Support Hub", icon: CircleHelp },
                    { href: "/contact", label: "Contact Us", icon: Phone },
                  ].map((row) => (
                    <Link
                      key={row.href}
                      href={row.href}
                      className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] transition hover:bg-accent"
                    >
                      <row.icon className="h-4 w-4 text-primary" /> {row.label}
                    </Link>
                  ))}
                </div>
              </section>

              {(socials.instagram || socials.facebook || socials.whatsapp) && (
                <section>
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Follow us
                  </p>
                  <div className="mt-2 flex gap-2 px-1" onClick={(e) => e.stopPropagation()}>
                    {socials.instagram && (
                      <a href={socials.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary">
                        <Instagram className="h-4 w-4" />
                      </a>
                    )}
                    {socials.facebook && (
                      <a href={socials.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary">
                        <Facebook className="h-4 w-4" />
                      </a>
                    )}
                    {socials.whatsapp && (
                      <a href={socials.whatsapp.startsWith("http") ? socials.whatsapp : `https://wa.me/${socials.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary">
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </section>
              )}
            </nav>
            <div className="border-t border-border pt-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Stellora · Premium Finds
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
