"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ShoppingBag, Check, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { formatINR } from "@/lib/utils";

/**
 * Mobile-only sticky purchase bar. Appears when the main purchase panel
 * scrolls out of view so "Add to Cart" is always one thumb-tap away.
 * Desktop stays clean (lg:hidden).
 *
 * Rendered through a portal to document.body: the page-transition template
 * keeps a filled transform animation on its wrapper, which would otherwise
 * become the containing block and pin this bar to the page instead of the
 * viewport (same class of bug as the old drawer/header backdrop-blur trap).
 */
export function StickyBuyBar({
  variantId,
  price,
  title,
  imageUrl,
  inStock,
  watchSelector = "#purchase-panel",
}: {
  variantId: string;
  price: number;
  title: string;
  imageUrl: string;
  inStock: boolean;
  watchSelector?: string;
}) {
  const router = useRouter();
  const addToCart = useStore((s) => s.addToCart);
  const refreshCart = useStore((s) => s.refreshCart);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    // rAF keeps the setState out of the synchronous effect pass (lint rule)
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const target = document.querySelector(watchSelector);
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [watchSelector]);

  if (!inStock || !mounted) return null;

  const add = async () => {
    if (busy) return;
    setBusy(true);
    const result = await addToCart(variantId, 1);
    setBusy(false);
    if (result.ok) {
      await refreshCart();
      setAdded(true);
      toast.cart({ name: title, image: imageUrl });
      window.setTimeout(() => setAdded(false), 2000);
    } else {
      toast.error(result.message ?? "Could not add to cart");
    }
  };

  return createPortal(
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-[60] border-t border-border/80 glass px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 lg:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="img-frame relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border/60">
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{title}</p>
          <p className="text-sm font-semibold tnum">{formatINR(price)}</p>
        </div>
        <Button
          size="lg"
          disabled={busy}
          onClick={add}
          className={`btn-sheen btn-gradient btn-press h-11 shrink-0 rounded-full px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/30 ${
            added ? "atc-success" : ""
          }`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : added ? (
            <>
              <Check className="h-4 w-4" /> Added
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" /> Add
            </>
          )}
        </Button>
        {added && (
          <Button
            variant="outline"
            size="lg"
            className="h-11 shrink-0 rounded-full border-primary/40 px-4"
            onClick={() => router.push("/cart")}
          >
            Cart
          </Button>
        )}
      </div>
    </div>,
    document.body
  );
}
