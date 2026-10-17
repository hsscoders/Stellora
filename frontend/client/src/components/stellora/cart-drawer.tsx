"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag, Trash2, Truck, Loader2, ArrowRight, PartyPopper } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "@/lib/store";
import { formatINR } from "@/lib/utils";

const FALLBACK_FREE_SHIPPING = 1999;

/**
 * Slide-over cart drawer — Shopify-style mini cart.
 * Opens on add-to-cart and from the header bag icon. Shows a live
 * free-shipping progress bar driven by the active shipping rate
 * (GET /api/shipping → freeAbove, with a safe fallback), line items
 * with inline quantity steppers, and checkout/view-cart CTAs.
 */
export function CartDrawer() {
  const router = useRouter();
  const open = useStore((s) => s.cartOpen);
  const setOpen = useStore((s) => s.setCartOpen);
  const cart = useStore((s) => s.cart);
  const cartLoading = useStore((s) => s.cartLoading);
  const refreshCart = useStore((s) => s.refreshCart);
  const updateItem = useStore((s) => s.updateItem);
  const removeItem = useStore((s) => s.removeItem);

  const [freeAbove, setFreeAbove] = useState<number>(FALLBACK_FREE_SHIPPING);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Keep cart fresh + fetch the active shipping rate for the progress bar.
    refreshCart();
    let alive = true;
    fetch("/api/shipping")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.ok && j.data?.freeAbove) setFreeAbove(Number(j.data.freeAbove));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const subtotal = cart?.subtotal ?? 0;
  const progress = useMemo(
    () => Math.min(100, Math.round((subtotal / freeAbove) * 100)),
    [subtotal, freeAbove]
  );
  const away = Math.max(0, freeAbove - subtotal);
  const qualifies = subtotal >= freeAbove && freeAbove > 0;

  async function changeQty(itemId: string, quantity: number) {
    setBusyItem(itemId);
    await updateItem(itemId, quantity);
    setBusyItem(null);
  }
  async function drop(itemId: string) {
    setBusyItem(itemId);
    await removeItem(itemId);
    setBusyItem(null);
  }

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 font-serif text-lg">
            <ShoppingBag className="h-4.5 w-4.5" /> Your cart
            {cart && cart.itemCount > 0 && (
              <span className="tnum rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                {cart.itemCount}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">Review items and check out.</SheetDescription>
        </SheetHeader>

        {/* Free-shipping progress — driven by the live shipping rate */}
        <div className="border-b border-border px-5 py-3">
          {qualifies ? (
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <PartyPopper className="h-4 w-4 shrink-0" /> You&apos;ve unlocked FREE shipping!
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Truck className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Add <span className="tnum font-semibold text-foreground">{formatINR(away)}</span> more to unlock{" "}
                <span className="font-medium text-foreground">free shipping</span>
              </span>
            </p>
          )}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress towards free shipping">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5">
          {cartLoading && !cart ? (
            <div className="space-y-4 py-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-20 w-20 rounded-md" />
                  <div className="flex-1 space-y-2 py-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : !cart || cart.items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
                <ShoppingBag className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Your cart is empty</p>
              <p className="max-w-60 text-sm text-muted-foreground">
                Explore the collection and add something you love.
              </p>
              <Button variant="outline" size="sm" className="mt-1 rounded-full" onClick={() => go("/shop")}>
                Start shopping <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {cart.items.map((item) => (
                <li key={item.itemId} className="flex gap-3 py-4">
                  <Link
                    href={`/product/${item.slug}`}
                    onClick={() => setOpen(false)}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                  >
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.productName} fill sizes="80px" className="object-cover" />
                    ) : (
                      <ShoppingBag className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/product/${item.slug}`}
                        onClick={() => setOpen(false)}
                        className="line-clamp-1 text-sm font-medium hover:text-primary"
                      >
                        {item.productName}
                      </Link>
                      <button
                        onClick={() => drop(item.itemId)}
                        disabled={busyItem === item.itemId}
                        aria-label={`Remove ${item.productName} from cart`}
                        className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                      >
                        {busyItem === item.itemId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.variantName}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-full border border-border">
                        <button
                          onClick={() => changeQty(item.itemId, item.quantity - 1)}
                          disabled={busyItem === item.itemId || item.quantity <= 1}
                          aria-label="Decrease quantity"
                          className="flex h-7 w-7 items-center justify-center rounded-l-full transition hover:bg-accent disabled:opacity-40"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="tnum w-7 text-center text-xs font-semibold">{item.quantity}</span>
                        <button
                          onClick={() => changeQty(item.itemId, Math.min(item.quantity + 1, item.stock))}
                          disabled={busyItem === item.itemId || item.quantity >= item.stock}
                          aria-label="Increase quantity"
                          className="flex h-7 w-7 items-center justify-center rounded-r-full transition hover:bg-accent disabled:opacity-40"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="tnum text-sm font-semibold">{formatINR(item.lineTotal)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — subtotal + CTAs */}
        {cart && cart.items.length > 0 && (
          <div className="border-t border-border px-5 py-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tnum text-base font-semibold">{formatINR(subtotal)}</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Shipping, taxes and discount codes are calculated at checkout.
            </p>
            <div className="flex flex-col gap-2">
              <Button size="lg" className="btn-press h-12 w-full rounded-full font-semibold" onClick={() => go("/checkout")}>
                Checkout <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="lg" className="h-11 w-full rounded-full" onClick={() => go("/cart")}>
                View cart
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
