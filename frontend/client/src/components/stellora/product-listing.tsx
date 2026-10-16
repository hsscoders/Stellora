"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal, X, Star, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ProductCard } from "@/components/stellora/product-card";
import { EmptyState } from "@/components/stellora/empty-state";
import type { ProductCardData } from "@/lib/types";

export interface ShopSearchParams {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  minRating?: string;
  inStock?: string;
  sort?: string;
  page?: string;
  category?: string;
}

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "rating-desc", label: "Top rated" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A–Z" },
  { value: "name-desc", label: "Name: Z–A" },
];

const PRICE_RANGES = [
  { label: "Under ₹1,000", min: "", max: "999" },
  { label: "₹1,000 – ₹1,999", min: "1000", max: "1999" },
  { label: "₹2,000 – ₹2,999", min: "2000", max: "2999" },
  { label: "₹3,000 & above", min: "3000", max: "" },
];

const RATINGS = [
  { value: "4", label: "4★ & up" },
  { value: "3", label: "3★ & up" },
];

export function buildQuery(current: ShopSearchParams, patch: Partial<ShopSearchParams>) {
  const merged = { ...current, ...patch };
  if (patch.page === undefined) delete merged.page; // reset to page 1 on filter change
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/* ------------------------------------------------------------------ */
/* Advanced filter panel — shared by the desktop sidebar and the       */
/* mobile bottom-sheet so both always offer identical controls.        */
/* ------------------------------------------------------------------ */

function FilterPanel({
  searchParams,
  basePath,
}: {
  searchParams: ShopSearchParams;
  basePath: string;
}) {
  const router = useRouter();
  const [minInput, setMinInput] = useState(searchParams.minPrice ?? "");
  const [maxInput, setMaxInput] = useState(searchParams.maxPrice ?? "");
  const minRating = searchParams.minRating ?? "";
  const inStock = searchParams.inStock === "1";

  const apply = (patch: Partial<ShopSearchParams>) =>
    router.push(`${basePath}${buildQuery(searchParams, patch)}`, { scroll: false });

  const applyPrice = () => {
    const min = minInput.replace(/[^0-9]/g, "");
    const max = maxInput.replace(/[^0-9]/g, "");
    if (min && max && Number(min) > Number(max)) {
      setMaxInput(min);
      apply({ minPrice: min, maxPrice: "" });
      return;
    }
    apply({ minPrice: min, maxPrice: max });
  };

  const priceActive = !!(searchParams.minPrice || searchParams.maxPrice);
  const anyActive = priceActive || !!minRating || inStock;

  return (
    <div className="space-y-6 text-sm">
      {/* Price */}
      <section>
        <p className="mb-2.5 flex items-center justify-between font-medium">
          Price
          {priceActive && (
            <button
              className="text-[11px] font-normal text-primary hover:underline"
              onClick={() => {
                setMinInput("");
                setMaxInput("");
                apply({ minPrice: "", maxPrice: "" });
              }}
            >
              reset
            </button>
          )}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              ₹
            </span>
            <Input
              inputMode="numeric"
              placeholder="Min"
              className="h-9 pl-6 tnum"
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyPrice()}
              aria-label="Minimum price"
            />
          </div>
          <span className="text-muted-foreground">–</span>
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              ₹
            </span>
            <Input
              inputMode="numeric"
              placeholder="Max"
              className="h-9 pl-6 tnum"
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyPrice()}
              aria-label="Maximum price"
            />
          </div>
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={applyPrice}>
          Apply price
        </Button>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {PRICE_RANGES.map((r) => {
            const active = searchParams.minPrice === r.min && searchParams.maxPrice === r.max;
            return (
              <button
                key={r.label}
                onClick={() => {
                  setMinInput(r.min);
                  setMaxInput(r.max);
                  apply({ minPrice: r.min, maxPrice: r.max });
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Rating */}
      <section className="border-t border-border pt-5">
        <p className="mb-2.5 font-medium">Customer rating</p>
        <div className="flex flex-wrap gap-1.5">
          {RATINGS.map((r) => {
            const active = minRating === r.value;
            return (
              <button
                key={r.value}
                onClick={() => apply({ minRating: active ? "" : r.value })}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                <Star className={cn("h-3 w-3", active ? "fill-current" : "text-primary")} />
                {r.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Availability */}
      <section className="border-t border-border pt-5">
        <p className="mb-2.5 font-medium">Availability</p>
        <label className="flex cursor-pointer items-center gap-2.5">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded border transition",
              inStock ? "border-primary bg-primary text-primary-foreground" : "border-border"
            )}
            aria-hidden
          >
            {inStock && <Check className="h-3.5 w-3.5" />}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={inStock}
            onChange={() => apply({ inStock: inStock ? "" : "1" })}
          />
          In stock only
        </label>
      </section>

      {anyActive && (
        <div className="border-t border-border pt-5">
          <Link
            href={basePath}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Clear all filters
          </Link>
        </div>
      )}
    </div>
  );
}

/* Active filter chips — one removable chip per applied filter */
function ActiveChips({
  searchParams,
  basePath,
}: {
  searchParams: ShopSearchParams;
  basePath: string;
}) {
  const router = useRouter();
  const chips: { label: string; patch: Partial<ShopSearchParams> }[] = [];
  if (searchParams.q) chips.push({ label: `“${searchParams.q}”`, patch: { q: "" } });
  if (searchParams.minPrice || searchParams.maxPrice) {
    const min = searchParams.minPrice ? `₹${Number(searchParams.minPrice).toLocaleString("en-IN")}` : "₹0";
    const max = searchParams.maxPrice ? `₹${Number(searchParams.maxPrice).toLocaleString("en-IN")}` : "∞";
    chips.push({ label: `${min} – ${max}`, patch: { minPrice: "", maxPrice: "" } });
  }
  if (searchParams.minRating) {
    chips.push({ label: `${searchParams.minRating}★ & up`, patch: { minRating: "" } });
  }
  if (searchParams.inStock === "1") chips.push({ label: "In stock only", patch: { inStock: "" } });
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 py-1 pl-3 pr-1.5 text-xs text-foreground"
        >
          {c.label}
          <button
            aria-label={`Remove filter ${c.label}`}
            onClick={() => router.push(`${basePath}${buildQuery(searchParams, c.patch)}`, { scroll: false })}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary hover:text-primary-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Link
        href={basePath}
        className="text-xs font-medium text-primary hover:underline"
      >
        Clear all
      </Link>
    </div>
  );
}

export function ProductListing({
  products,
  total,
  page,
  pages,
  basePath,
  searchParams,
  title,
  subtitle,
}: {
  products: ProductCardData[];
  total: number;
  page: number;
  pages: number;
  basePath: string;
  searchParams: ShopSearchParams;
  title: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const currentSort = searchParams.sort ?? "newest";
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasFilters = !!(searchParams.minPrice || searchParams.maxPrice || searchParams.minRating || searchParams.inStock === "1");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="text-center">
        <h1 className="font-serif text-4xl font-medium">{title}</h1>
        {subtitle && <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mx-auto mt-5 h-px w-24 gold-line" />
      </header>

      {/* Toolbar */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground tnum">
          <span className="font-medium text-foreground">{total}</span>{" "}
          {total === 1 ? "product" : "products"}
        </p>

        {/* Mobile filter trigger */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="relative lg:hidden">
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {hasFilters && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-5 pb-8">
            <SheetHeader className="pb-2 text-left">
              <SheetTitle className="font-serif">Refine</SheetTitle>
            </SheetHeader>
            <FilterPanel searchParams={searchParams} basePath={basePath} />
          </SheetContent>
        </Sheet>

        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="shop-sort" className="hidden text-xs uppercase tracking-[0.14em] text-muted-foreground sm:block">
            Sort
          </Label>
          <Select
            value={currentSort}
            onValueChange={(v) => router.push(`${basePath}${buildQuery(searchParams, { sort: v })}`, { scroll: false })}
          >
            <SelectTrigger id="shop-sort" className="h-9 w-[190px] rounded-full text-sm" aria-label="Sort products">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active filter chips */}
      <div className="mt-4">
        <ActiveChips searchParams={searchParams} basePath={basePath} />
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        {/* Desktop filter sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="rounded-xl border border-border/70 bg-card p-5 lg:sticky lg:top-28">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Refine
            </p>
            <div className="mt-5">
              <FilterPanel searchParams={searchParams} basePath={basePath} />
            </div>
          </div>
        </aside>

        {/* Grid */}
        <div className="flex-1">
          {products.length === 0 ? (
            <EmptyState
              icon="search"
              title="No products match"
              description="Try adjusting your filters or search for something else — our collection is always growing."
              actionLabel="Browse everything"
              actionHref="/shop"
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3">
                {products.map((p, i) => (
                  <ProductCard key={p.id} product={p} priority={i < 3} />
                ))}
              </div>
              {pages > 1 && (
                <nav className="mt-12 flex items-center justify-center gap-1.5" aria-label="Pagination">
                  {page > 1 && (
                    <Link
                      href={`${basePath}${buildQuery(searchParams, { page: String(page - 1) })}`}
                      className="rounded-md border border-border px-3.5 py-2 text-sm hover:bg-accent"
                    >
                      ← Previous
                    </Link>
                  )}
                  {Array.from({ length: pages }).slice(0, 8).map((_, i) => {
                    const p = i + 1;
                    return (
                      <Link
                        key={p}
                        href={`${basePath}${buildQuery(searchParams, { page: String(p) })}`}
                        aria-current={p === page ? "page" : undefined}
                        className={cn(
                          "min-w-10 rounded-md border border-border px-3.5 py-2 text-center text-sm tnum transition hover:bg-accent",
                          p === page && "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                      >
                        {p}
                      </Link>
                    );
                  })}
                  {page < pages && (
                    <Link
                      href={`${basePath}${buildQuery(searchParams, { page: String(page + 1) })}`}
                      className="rounded-md border border-border px-3.5 py-2 text-sm hover:bg-accent"
                    >
                      Next →
                    </Link>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
