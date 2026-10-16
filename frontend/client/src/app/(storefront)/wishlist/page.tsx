"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, ShoppingBag } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/stellora/empty-state";
import { formatINR } from "@/lib/utils";
import { useStore } from "@/lib/store";
import type { ProductCardData } from "@/lib/types";

export default function WishlistPage() {
  const [items, setItems] = useState<ProductCardData[] | null>(null);
  const [unauthed, setUnauthed] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/wishlist", { cache: "no-store" });
      if (res.status === 401) {
        setUnauthed(true);
        setItems([]);
        return;
      }
      const json = await res.json();
      setItems(json.ok ? json.data : []);
    })();
  }, []);

  const moveToCart = async (variantId: string, name: string) => {
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, quantity: 1 }),
    });
    const json = await res.json();
    if (json.ok) {
      useStore.getState().refreshCart();
      toast.success(`Added ${name} to cart`);
    } else {
      toast.error(json.error?.message ?? "Could not add to cart");
    }
  };

  const remove = async (productId: string, name: string) => {
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const json = await res.json();
    if (json.ok) {
      setItems((prev) => prev?.filter((i) => i.id !== productId) ?? null);
      useStore.setState({
        wishlist: useStore.getState().wishlist.filter((id) => id !== productId),
      });
      toast.success(`Removed ${name}`);
    }
  };

  if (items === null) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <Skeleton className="h-10 w-56" />
        <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <Skeleton className="aspect-square rounded-md" />
              <Skeleton className="mt-3 h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (unauthed) {
    return (
      <EmptyState
        icon="heart"
        title="Sign in to view your wishlist"
        description="Save the pieces you love and find them here whenever you return."
        actionLabel="Sign in"
        actionHref="/login?next=/wishlist"
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="heart"
        title="Your wishlist is empty"
        description="Tap the heart on any product to keep it here for later."
        actionLabel="Discover the collection"
        actionHref="/shop"
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-serif text-4xl font-medium">Wishlist</h1>
      <p className="mt-2 text-sm text-muted-foreground tnum">
        {items.length} saved {items.length === 1 ? "piece" : "pieces"}
      </p>
      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => {
          const v = p.variants[0];
          return (
            <div key={p.id} className="group">
              <Link
                href={`/product/${p.slug}`}
                className="zoom-hover block overflow-hidden rounded-md border border-border/60 bg-card"
              >
                <div className="relative aspect-square">
                  <Image
                    src={p.images[0]?.url ?? "/images/placeholder.svg"}
                    alt={p.images[0]?.alt ?? p.name}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                  />
                </div>
              </Link>
              <div className="pt-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {p.category?.name ?? "Stellora"}
                </p>
                <Link href={`/product/${p.slug}`}>
                  <h3 className="mt-1 line-clamp-1 font-serif text-[15px] font-medium hover:text-primary">
                    {p.name}
                  </h3>
                </Link>
                <p className="mt-1 text-[15px] font-semibold tnum">
                  {v ? formatINR(v.price) : "—"}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="h-8 flex-1 rounded-full bg-primary text-xs hover:bg-primary/90"
                    disabled={!v || v.stock === 0}
                    onClick={() => v && moveToCart(v.id, p.name)}
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {v?.stock ? "Add to Cart" : "Sold Out"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full px-3"
                    aria-label={`Remove ${p.name} from wishlist`}
                    onClick={() => remove(p.id, p.name)}
                  >
                    <Heart className="h-3.5 w-3.5 fill-current" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
