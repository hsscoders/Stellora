"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Zap, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityStepper } from "@/components/stellora/quantity-stepper";
import { useStore } from "@/lib/store";
import type { ProductCardData } from "@/lib/types";

type Variant = ProductCardData["variants"][number];

export function AddToCartPanel({
  variants,
  selected,
  maxStock,
  productId,
}: {
  variants: Variant[];
  selected: Variant | null;
  maxStock: number;
  productId: string;
}) {
  const router = useRouter();
  const addToCart = useStore((s) => s.addToCart);
  const refreshCart = useStore((s) => s.refreshCart);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifying, setNotifying] = useState(false);
  const [notified, setNotified] = useState(false);

  const add = async (goToCheckout: boolean) => {
    if (!selected) return;
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
      toast.success("Added to cart", {
        description: `${selected.name} × ${qty}`,
        action: { label: "View cart", onClick: () => router.push("/cart") },
      });
    } else {
      toast.error(result.message ?? "Could not add to cart");
    }
  };

  const outOfStock = !selected || selected.stock === 0;

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
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Quantity</span>
        <QuantityStepper
          value={qty}
          onChange={setQty}
          max={Math.max(1, Math.min(10, maxStock))}
        />
        {selected && selected.stock > 0 && selected.stock <= 5 && (
          <span className="text-xs font-medium text-destructive">
            Only {selected.stock} left
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          disabled={busy || outOfStock}
          onClick={() => add(false)}
          className="btn-press flex-1 rounded-full bg-primary text-sm tracking-wide hover:bg-primary/90"
        >
          <ShoppingBag className="h-4 w-4" />
          {outOfStock ? "Out of Stock" : busy ? "Adding…" : "Add to Cart"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={busy || outOfStock}
          onClick={() => add(true)}
          className="btn-press flex-1 rounded-full border-primary/50 text-sm tracking-wide hover:bg-accent"
        >
          <Zap className="h-4 w-4" />
          {busy ? "Please wait…" : "Buy Now"}
        </Button>
      </div>
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
