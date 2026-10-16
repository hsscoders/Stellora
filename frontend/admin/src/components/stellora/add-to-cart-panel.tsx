"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Zap } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/stellora/quantity-stepper";
import { useStore } from "@/lib/store";
import type { ProductCardData } from "@/lib/types";

type Variant = ProductCardData["variants"][number];

export function AddToCartPanel({
  variants,
  selected,
  maxStock,
}: {
  variants: Variant[];
  selected: Variant | null;
  maxStock: number;
}) {
  const router = useRouter();
  const addToCart = useStore((s) => s.addToCart);
  const refreshCart = useStore((s) => s.refreshCart);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const add = async (goToCart: boolean) => {
    if (!selected) return;
    setBusy(true);
    const result = await addToCart(selected.id, qty);
    setBusy(false);
    if (result.ok) {
      await refreshCart();
      toast.success("Added to cart", {
        description: `${selected.name} × ${qty}`,
        action: goToCart
          ? undefined
          : { label: "View cart", onClick: () => router.push("/cart") },
      });
      if (goToCart) router.push("/cart");
    } else {
      toast.error(result.message ?? "Could not add to cart");
    }
  };

  const outOfStock = !selected || selected.stock === 0;

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
          className="flex-1 rounded-full bg-primary text-sm tracking-wide hover:bg-primary/90"
        >
          <ShoppingBag className="h-4 w-4" />
          {outOfStock ? "Out of Stock" : busy ? "Adding…" : "Add to Cart"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={busy || outOfStock}
          onClick={() => add(true)}
          className="flex-1 rounded-full border-primary/50 text-sm tracking-wide hover:bg-accent"
        >
          <Zap className="h-4 w-4" />
          Buy Now
        </Button>
      </div>
    </div>
  );
}
