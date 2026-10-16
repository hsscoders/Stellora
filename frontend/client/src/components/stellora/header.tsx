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
  LayoutDashboard,
  Package,
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

export function Header({ announcement }: { announcement: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const cart = useStore((s) => s.cart);
  const refreshCart = useStore((s) => s.refreshCart);
  const refreshWishlist = useStore((s) => s.refreshWishlist);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const lastY = useRef(0);

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
  }, [pathname, refreshCart, refreshWishlist]);

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

          <nav className="ml-6 hidden items-center gap-7 text-[13px] font-medium uppercase tracking-[0.14em] lg:flex">
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
            <Link
              href="/cart"
              className="relative p-2 text-foreground/80 transition hover:text-foreground"
              aria-label="Cart"
            >
              <ShoppingBag className="h-5 w-5" />
              {cart && cart.itemCount > 0 && (
                <span key={cart.itemCount} className="anim-pop absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tnum">
                  {cart.itemCount}
                </span>
              )}
            </Link>

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
                  {user.role === "ADMIN" && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin-console">
                        <LayoutDashboard className="h-4 w-4" /> Admin Panel
                      </Link>
                    </DropdownMenuItem>
                  )}
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
            <nav className="stellora-scroll mt-8 flex flex-col gap-1 overflow-y-auto" onClick={() => setMobileOpen(false)}>
              <Link href="/shop" className="rounded-md px-3 py-3 text-base transition hover:bg-accent">
                Shop All
              </Link>
              {CATEGORIES.map((c) => (
                <Link
                  key={c.slug}
                  href={`/category/${c.slug}`}
                  className="rounded-md px-3 py-3 text-base transition hover:bg-accent"
                >
                  {c.name}
                </Link>
              ))}
              <div className="my-3 h-px gold-line" />
              <Link href="/track-order" className="rounded-md px-3 py-3 text-base transition hover:bg-accent">
                Track Order
              </Link>
              <Link href="/about" className="rounded-md px-3 py-3 text-base transition hover:bg-accent">
                About
              </Link>
              <Link href="/contact" className="rounded-md px-3 py-3 text-base transition hover:bg-accent">
                Contact
              </Link>
              <Link href="/account" className="rounded-md px-3 py-3 text-base transition hover:bg-accent">
                {user ? "My Account" : "Sign In"}
              </Link>
            </nav>
            <p className="mt-auto border-t border-border pt-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Stellora · Premium Finds
            </p>
          </div>
        </div>
      )}
    </>
  );
}
