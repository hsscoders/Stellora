"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/stellora/product-card";
import type { ProductCardData } from "@/lib/types";

const KEY = "stellora:recently-viewed";
const MAX = 12;

export function readRecentlyViewed(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(productId: string) {
  try {
    const ids = readRecentlyViewed().filter((id) => id !== productId);
    ids.unshift(productId);
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Invisible helper rendered on the product page to remember the visit. */
export function RecordRecentlyViewed({ productId }: { productId: string }) {
  useEffect(() => {
    recordRecentlyViewed(productId);
  }, [productId]);
  return null;
}

/** "Recently viewed" strip — reads localStorage, hydrates via the API. */
export function RecentlyViewedSection({ excludeId }: { excludeId?: string }) {
  const [products, setProducts] = useState<ProductCardData[] | null>(null);

  useEffect(() => {
    const ids = readRecentlyViewed()
      .filter((id) => id !== excludeId)
      .slice(0, 4);
    if (ids.length === 0) {
      // Defer to a macrotask so we never setState synchronously in the effect.
      const t = window.setTimeout(() => setProducts([]), 0);
      return () => window.clearTimeout(t);
    }
    let alive = true;
    fetch(`/api/products/by-ids?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive) setProducts(j.ok ? (j.data as ProductCardData[]) : []);
      })
      .catch(() => {
        if (alive) setProducts([]);
      });
    return () => {
      alive = false;
    };
  }, [excludeId]);

  if (products === null || products.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <h2 className="text-center font-serif text-3xl font-medium">Recently Viewed</h2>
      <div className="mx-auto mt-4 h-px w-24 gold-line" />
      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
