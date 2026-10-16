"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Zap, BellRing, Check, Loader2, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityStepper } from "@/components/stellora/quantity-stepper";
import { useStore } from "@/lib/store";
import { formatINR } from "@/lib/utils";
import type { ProductCardData } from "@/lib/types";

type Variant = ProductCardData["variants"][number];

/**
 * Purchase panel for the PDP.
 * Detailing: price-aware primary CTA (gradient + sheen), success morph,
 * honest stock meter, express checkout secondary, inline confirmation strip.
 */
export function AddToCartPanel({
  variants,
  selected,
  maxStock,
  productId,
  imageUrl,
  productName,
}: {
  variants: Variant[];
  selected: Variant | null;
  maxStock: number;
  productId: string;
  imageUrl?: string | null;
  productName?: string;
}) {
  const router = useRouter();
  const addToCart = useStore((s) => s.addToCart);
  const refreshCart = useStore((s) => s.refreshCart);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<number | undefined>(undefined);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifying, setNotifying] = useState(false);
  const [notified, setNotified] = useState(false);

  useEffect(() => () => window.clearTimeout(addedTimer.current), []);

  const add = async (goToCheckout: boolean) => {
    if (!selected || busy) return;
    setBusy(true);
    const result = await addToCart(selected.id, qty);
    setBusy(false);
    if (result.ok) {
      await refreshCart();
      if (goToCheckout) {
        // Express checkout: skip the cart page entirely.
        router.push("/checkout");
        return;
      }
      // Success morph on the primary CTA + inline confirmation strip.
      setAdded(true);
      window.clearTimeout(addedTimer.current);
      addedTimer.current = window.setTimeout(() => setAdded(false), 1800);
      toast.cart({
        name: productName ?? selected.name,
        subtitle: selected.name,
        image: imageUrl ?? null,
        qty,
        price: selected.price,
        onView: () => router.push("/cart"),
      });
    } else {
      toast.error(result.message ?? "Could not add to cart");
    }
  };

  const outOfStock = !selected || selected.stock === 0;
  const lowStock = !outOfStock && selected.stock <= 5;
  const unit = selected ? Number(selected.price) : 0;
  const lineTotal = unit * qty;

  const registerAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyEmail.trim()) return;
    setNotifying(true);
    try {
      const res = await fetch("/api/restock-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, variantId: selected?.id ?? "", email: notifyEmail.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setNotified(true);
        toast.success(json.data?.message ?? "We'll email you when it's back.");
      } else {
        toast.error(json.error?.message ?? "Could not register the alert.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setNotifying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stock meter — honest, glanceable, alive */}
      <div className="flex items-center gap-2.5 text-sm" role="status">
        {outOfStock ? (
          <>
            <span className="h-2 w-2 rounded-full bg-muted-foreground/60" aria-hidden />
            <span className="text-muted-foreground">Out of stock — restocking soon</span>
          </>
        ) : lowStock ? (
          <>
            <span className="stock-dot stock-dot-low h-2 w-2 rounded-full" aria-hidden />
            <span className="font-medium text-primary">
              Hurry — only {selected.stock} left in stock
            </span>
          </>
        ) : (
          <>
            <span className="stock-dot h-2 w-2 rounded-full" aria-hidden />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">In stock</span> · dispatches within 24
              hours
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Qty</span>
        <QuantityStepper
          value={qty}
          onChange={setQty}
          max={Math.max(1, Math.min(10, maxStock))}
        />
        {selected && !outOfStock && (
          <span className="ml-auto text-sm text-muted-foreground tnum">
            Total <span className="font-semibold text-foreground">{formatINR(lineTotal)}</span>
          </span>
        )}
      </div>

      {/* Stacked, full-width CTAs — primary action is unmistakable */}
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          disabled={busy || outOfStock}
          onClick={() => add(false)}
          className={`btn-sheen btn-gradient btn-press relative h-14 w-full rounded-full text-[15px] font-semibold tracking-wide text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 ${
            added ? "atc-success" : ""
          }`}
        >
          {busy ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" /> Adding…
            </>
          ) : added ? (
            <>
              <Check className="h-5 w-5" /> Added to Cart
            </>
          ) : (
            <>
              <ShoppingBag className="h-4.5 w-4.5" />
              Add to Cart
              <span className="tnum opacity-80">· {formatINR(lineTotal)}</span>
            </>
          )}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={busy || outOfStock}
          onClick={() => add(true)}
          className="btn-press h-14 w-full rounded-full border-primary/40 text-[15px] font-semibold tracking-wide hover:border-primary hover:bg-accent"
        >
          <Zap className="h-4 w-4" />
          {busy ? "Please wait…" : "Buy It Now"}
        </Button>
      </div>

      {/* Inline confirmation strip — reinforces the add without leaving the page */}
      {added && (
        <div className="anim-fade-up flex items-center justify-between rounded-lg border border-primary/30 bg-accent/60 px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span className="font-medium">Added to your cart</span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-primary hover:bg-accent"
            onClick={() => router.push("/cart")}
          >
            View Cart <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {outOfStock && (
        <div className="rounded-lg border border-border/70 bg-card p-4">
          {notified ? (
            <p className="flex items-center gap-2 text-sm text-accent-foreground">
              <BellRing className="h-4 w-4 text-primary" /> You're on the list — we'll email you the
              moment it's back.
            </p>
          ) : (
            <form onSubmit={registerAlert} className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                required
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="Email for back-in-stock alert"
                aria-label="Email for back-in-stock alert"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={notifying}
                className="btn-press shrink-0 rounded-full border-primary/50"
              >
                <BellRing className="h-4 w-4" />
                {notifying ? "Saving…" : "Notify me"}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
