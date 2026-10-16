"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/components/stellora/product-card";
import { EmptyState } from "@/components/stellora/empty-state";
import type { ProductCardData } from "@/lib/types";

export interface ShopSearchParams {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  sort?: string;
  page?: string;
  category?: string;
}

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A–Z" },
  { value: "name-desc", label: "Name: Z–A" },
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
  const inStock = searchParams.inStock === "1";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="text-center">
        <h1 className="font-serif text-4xl font-medium">{title}</h1>
        {subtitle && <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mx-auto mt-5 h-px w-24 gold-line" />
      </header>

      <div className="mt-10 flex flex-col gap-8 lg:flex-row">
        {/* Filters */}
        <aside className="lg:w-56 lg:shrink-0">
          <div className="rounded-lg border border-border/70 bg-card p-5 lg:sticky lg:top-28">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Filters
            </h3>
            <div className="mt-4 space-y-5 text-sm">
              <div>
                <p className="mb-2 font-medium">Sort by</p>
                <div className="space-y-1.5">
                  {SORTS.map((s) => (
                    <Link
                      key={s.value}
                      href={`${basePath}${buildQuery(searchParams, { sort: s.value })}`}
                      className={cn(
                        "block rounded px-2 py-1 transition hover:bg-accent",
                        currentSort === s.value && "bg-accent font-medium text-accent-foreground"
                      )}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <p className="mb-2 font-medium">Price</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Under ₹1,000", min: "", max: "999" },
                    { label: "₹1,000 – ₹1,499", min: "1000", max: "1499" },
                    { label: "₹1,500 – ₹1,999", min: "1500", max: "1999" },
                    { label: "₹2,000 & above", min: "2000", max: "" },
                  ].map((r) => (
                    <Link
                      key={r.label}
                      href={`${basePath}${buildQuery(searchParams, { minPrice: r.min, maxPrice: r.max })}`}
                      className="block rounded px-2 py-1 transition hover:bg-accent"
                    >
                      {r.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <label className="flex cursor-pointer items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={inStock}
                    readOnly
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(
                        `${basePath}${buildQuery(searchParams, {
                          inStock: inStock ? "" : "1",
                        })}`
                      );
                    }}
                  />
                  In stock only
                </label>
              </div>
              {(searchParams.minPrice || searchParams.maxPrice || inStock || searchParams.q) && (
                <Link
                  href={basePath}
                  className="block border-t border-border pt-4 text-xs font-medium text-primary hover:underline"
                >
                  Clear all filters
                </Link>
              )}
            </div>
          </div>
        </aside>

        {/* Grid */}
        <div className="flex-1">
          <p className="mb-5 text-sm text-muted-foreground tnum">
            {total} {total === 1 ? "product" : "products"}
          </p>
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
