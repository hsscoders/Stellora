"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductCardData } from "@/lib/types";
import { VariantPicker } from "@/components/stellora/product-detail-client";
import { AddToCartPanel } from "@/components/stellora/add-to-cart-panel";
import { Separator } from "@/components/ui/separator";

type Variant = ProductCardData["variants"][number];

/**
 * Client island that owns the selected-variant state and re-renders
 * price/stock/add-to-cart accordingly. Server passes the full variant list.
 *
 * LIVE STOCK: while the tab is visible the island polls the lightweight
 * `/api/products/:slug/stock` endpoint every 10s, so a sale at the counter
 * (or elsewhere) updates "Only 2 left" badges here within seconds.
 */
export function ProductPurchase({
  variants,
  productId,
  currencyNote,
  imageUrl,
  productName,
  slug,
}: {
  variants: Variant[];
  productId?: string;
  currencyNote?: string;
  imageUrl?: string | null;
  productName?: string;
  slug?: string;
}) {
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0] ?? null;
  const [selected, setSelected] = useState<Variant | null>(firstAvailable);
  /* Merged live-stock view of the variant list (server values until a poll). */
  const [liveStocks, setLiveStocks] = useState<Map<string, number> | null>(null);

  const liveVariants: Variant[] = useMemo(
    () =>
      liveStocks && liveStocks.size > 0
        ? variants.map((v) => {
            const s = liveStocks.get(v.id);
            return s === undefined ? v : { ...v, stock: s };
          })
        : variants,
    [variants, liveStocks]
  );

  useEffect(() => {
    if (!slug) return;
    /* Narrowed copy: TS cannot carry the guard above into the poll closure. */
    const activeSlug = slug;
    let alive = true;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(activeSlug)}/stock`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!alive || !json.ok || !Array.isArray(json.data)) return;
        const map = new Map<string, number>();
        for (const row of json.data as { id: string; stock: number }[]) {
          map.set(String(row.id), Number(row.stock) || 0);
        }
        setLiveStocks(map);
      } catch {
        /* transient — next tick retries */
      }
    }
    poll();
    const iv = window.setInterval(poll, 10000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      alive = false;
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [slug]);

  if (!selected) {
    return <p className="text-sm text-muted-foreground">Currently unavailable.</p>;
  }

  /* Live-stock view of the selected variant — falls back to the base variant
     until the first poll merges fresh counts into the list. */
  const liveSelected = liveVariants.find((v) => v.id === selected.id) ?? selected;

  const onSale = liveSelected && Number(liveSelected.compareAtPrice) > Number(liveSelected.price);

  return (
    <div>
      <div className="flex items-baseline gap-3 tnum">
        <span className="font-sans text-3xl font-bold tracking-tight">
          {new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: Number(liveSelected.price) % 1 === 0 ? 0 : 2,
          }).format(Number(liveSelected.price))}
        </span>
        {onSale && (
          <>
            <span className="text-lg text-muted-foreground line-through">
              {new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0,
              }).format(Number(liveSelected.compareAtPrice))}
            </span>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              Save{" "}
              {new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0,
              }).format(Number(liveSelected.compareAtPrice) - Number(liveSelected.price))}
            </span>
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Taxes included · Free 7-day returns
      </p>

      <Separator className="my-6" />

      <VariantPicker variants={liveVariants} selected={liveSelected} onSelect={setSelected} />

      <div className="mt-6">
        <AddToCartPanel
          variants={liveVariants}
          selected={liveSelected}
          maxStock={liveSelected.stock}
          productId={productId ?? ""}
          imageUrl={imageUrl}
          productName={productName}
          key={liveSelected.id}
        />
      </div>
    </div>
  );
}
