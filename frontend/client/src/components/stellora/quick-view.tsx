"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Eye, ShoppingBag, Check, Loader2, ArrowUpRight } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuantityStepper } from "@/components/stellora/quantity-stepper";
import { useStore } from "@/lib/store";
import { formatINR } from "@/lib/utils";
import type { ProductCardData } from "@/lib/types";

type Variant = ProductCardData["variants"][number];

/**
 * Quick view: opens a dialog from the product card grid so shoppers can
 * pick a variant, set quantity and add to cart without leaving the page.
 */
export function QuickViewButton({
  product,
  className = "",
}: {
  product: ProductCardData;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const firstAvailable = product.variants.find((v) => Number(v.stock) > 0) ?? product.variants[0];
  const [selected, setSelected] = useState<Variant | null>(firstAvailable ?? null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const addToCart = useStore((s) => s.addToCart);
  const refreshCart = useStore((s) => s.refreshCart);
  const setCartOpen = useStore((s) => s.setCartOpen);

  if (!firstAvailable) return null;

  const price = Number(selected?.price ?? firstAvailable.price);
  const compareAt = selected?.compareAtPrice == null ? null : Number(selected.compareAtPrice);
  const onSale = compareAt != null && compareAt > price;
  const outOfStock = !selected || Number(selected.stock) === 0;

  const add = async () => {
    if (!selected || busy) return;
    setBusy(true);
    const result = await addToCart(selected.id, qty);
    setBusy(false);
    if (result.ok) {
      await refreshCart();
      setAdded(true);
      // Slide over the cart drawer — quick view closes as the drawer takes over.
      window.setTimeout(() => {
        setOpen(false);
        setCartOpen(true);
      }, 700);
    } else {
      toast.error(result.message ?? "Could not add to cart");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Quick view ${product.name}`}
        className={className}
      >
        <Eye className="h-3.5 w-3.5" />
        Quick View
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setAdded(false); }}>
        <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>{product.name}</DialogTitle>
              <DialogDescription>Quick view</DialogDescription>
            </DialogHeader>
          <div className="grid max-h-[85vh] grid-cols-1 overflow-y-auto sm:grid-cols-2 stellora-scroll">
            <div className="img-frame relative aspect-square sm:aspect-auto sm:min-h-[380px]">
              <Image
                src={product.images[0]?.url ?? "/images/placeholder.svg"}
                alt={product.images[0]?.alt ?? product.name}
                fill
                sizes="(max-width: 640px) 100vw, 360px"
                className="object-cover"
              />
            </div>
            <div className="flex flex-col p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                {product.category?.name ?? "Stellora"}
              </p>
              <h3 className="mt-1.5 font-serif text-2xl font-medium leading-snug">
                {product.name}
              </h3>
              <div className="mt-3 flex items-baseline gap-2 tnum">
                <span className="text-2xl font-bold">{formatINR(price)}</span>
                {onSale && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatINR(compareAt!)}
                  </span>
                )}
              </div>

              {product.variants.length > 1 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Option
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {product.variants.map((v) => {
                      const active = selected?.id === v.id;
                      const stock = Number(v.stock);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelected(v)}
                          disabled={stock === 0}
                          aria-pressed={active}
                          className={`btn-press rounded-lg border px-3.5 py-2 text-sm transition ${
                            active
                              ? "border-primary bg-accent font-semibold text-accent-foreground shadow-[0_0_0_1px_var(--primary)]"
                              : "border-border hover:border-primary/60"
                          } ${stock === 0 ? "cursor-not-allowed text-muted-foreground line-through opacity-60" : ""}`}
                        >
                          {v.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center gap-3">
                <QuantityStepper
                  value={qty}
                  onChange={setQty}
                  max={Math.max(1, Math.min(10, Number(selected?.stock ?? 1)))}
                />
                <span className="text-sm text-muted-foreground tnum">
                  Total <span className="font-semibold text-foreground">{formatINR(price * qty)}</span>
                </span>
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <Button
                  disabled={busy || outOfStock}
                  onClick={add}
                  className={`btn-sheen btn-gradient btn-press h-12 rounded-full font-semibold text-primary-foreground shadow-lg shadow-primary/25 ${
                    added ? "atc-success" : ""
                  }`}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : added ? (
                    <>
                      <Check className="h-4 w-4" /> Added
                    </>
                  ) : outOfStock ? (
                    "Out of Stock"
                  ) : (
                    <>
                      <ShoppingBag className="h-4 w-4" /> Add to Cart · {formatINR(price * qty)}
                    </>
                  )}
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-full border-primary/40">
                  <Link href={`/product/${product.slug}`}>
                    View Full Details <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
