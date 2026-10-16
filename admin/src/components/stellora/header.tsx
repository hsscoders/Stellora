"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  Heart,
  Search,
  Menu,
  UserRound,
  X,
  ChevronDown,
  LogOut,
  LayoutDashboard,
  Package,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { ThemeToggle } from "@/components/stellora/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) {
      setSearchOpen(false);
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  };

  const wishlist = useStore((s) => s.wishlist);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-md">
      {announcement && (
        <div className="bg-primary text-primary-foreground">
          <p className="mx-auto max-w-7xl px-4 py-1.5 text-center text-xs tracking-wide">
            {announcement}
          </p>
        </div>
      )}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <button
          className="lg:hidden -ml-1 p-2"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/" className="mr-2 flex flex-col items-center leading-none">
          <span className="font-serif text-[26px] font-semibold tracking-[0.18em] text-foreground">
            STELLORA
          </span>
          <span className="text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
            Premium Finds
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-7 text-[13px] font-medium uppercase tracking-[0.14em] lg:flex">
          <Link
            href="/shop"
            className={`transition-colors hover:text-primary ${pathname === "/shop" ? "text-primary" : "text-foreground/80"}`}
          >
            Shop All
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              className={`transition-colors hover:text-primary ${pathname === `/category/${c.slug}` ? "text-primary" : "text-foreground/80"}`}
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-0.5">
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
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tnum">
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
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tnum">
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
                    <Package className="h-4 w-4" /> Orders & Profile
                  </Link>
                </DropdownMenuItem>
                {user.role === "ADMIN" && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
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
          <form onSubmit={submitSearch} className="mx-auto flex max-w-3xl gap-2">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search jewellery, hair extensions, vanity, handbags…"
              aria-label="Search products"
            />
            <Button type="submit" className="bg-primary hover:bg-primary/90">
              Search
            </Button>
          </form>
        </div>
      )}

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="font-serif text-xl tracking-[0.18em]">STELLORA</span>
              <button aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-8 flex flex-col gap-1" onClick={() => setMobileOpen(false)}>
              <Link href="/shop" className="rounded-md px-3 py-3 text-base hover:bg-accent">
                Shop All
              </Link>
              {CATEGORIES.map((c) => (
                <Link
                  key={c.slug}
                  href={`/category/${c.slug}`}
                  className="rounded-md px-3 py-3 text-base hover:bg-accent"
                >
                  {c.name}
                </Link>
              ))}
              <div className="my-3 h-px gold-line" />
              <Link href="/track-order" className="rounded-md px-3 py-3 text-base hover:bg-accent">
                Track Order
              </Link>
              <Link href="/about" className="rounded-md px-3 py-3 text-base hover:bg-accent">
                About
              </Link>
              <Link href="/contact" className="rounded-md px-3 py-3 text-base hover:bg-accent">
                Contact
              </Link>
              <Link href="/account" className="rounded-md px-3 py-3 text-base hover:bg-accent">
                {user ? "My Account" : "Sign In"}
              </Link>
            </nav>
            <div className="mt-auto flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
              <ChevronDown className="h-4 w-4 rotate-[-90deg]" /> Menu
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
