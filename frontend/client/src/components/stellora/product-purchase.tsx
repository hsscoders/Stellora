"use client";

import { useState } from "react";
import type { ProductCardData } from "@/lib/types";
import { VariantPicker } from "@/components/stellora/product-detail-client";
import { AddToCartPanel } from "@/components/stellora/add-to-cart-panel";
import { Separator } from "@/components/ui/separator";

type Variant = ProductCardData["variants"][number];

/**
 * Client island that owns the selected-variant state and re-renders
 * price/stock/add-to-cart accordingly. Server passes the full variant list.
 */
export function ProductPurchase({
  variants,
  productId,
  currencyNote,
  imageUrl,
  productName,
}: {
  variants: Variant[];
  productId?: string;
  currencyNote?: string;
  imageUrl?: string | null;
  productName?: string;
}) {
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0] ?? null;
  const [selected, setSelected] = useState<Variant | null>(firstAvailable);

  if (!selected) {
    return <p className="text-sm text-muted-foreground">Currently unavailable.</p>;
  }

  const onSale = selected.compareAtPrice && Number(selected.compareAtPrice) > Number(selected.price);

  return (
    <div>
      <div className="flex items-baseline gap-3 tnum">
        <span className="font-sans text-3xl font-bold tracking-tight">
          {new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: Number(selected.price) % 1 === 0 ? 0 : 2,
          }).format(Number(selected.price))}
        </span>
        {onSale && (
          <>
            <span className="text-lg text-muted-foreground line-through">
              {new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0,
              }).format(Number(selected.compareAtPrice))}
            </span>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              Save{" "}
              {new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0,
              }).format(Number(selected.compareAtPrice) - Number(selected.price))}
            </span>
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Taxes included · Free 7-day returns
      </p>

      <Separator className="my-6" />

      <VariantPicker variants={variants} selected={selected} onSelect={setSelected} />

      <div className="mt-6">
        <AddToCartPanel
          variants={variants}
          selected={selected}
          maxStock={selected.stock}
          productId={productId ?? ""}
          imageUrl={imageUrl}
          productName={productName}
          key={selected.id}
        />
      </div>
    </div>
  );
}
