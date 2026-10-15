"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function WishlistButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const router = useRouter();
  const wishlist = useStore((s) => s.wishlist);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const [busy, setBusy] = useState(false);
  const active = wishlist.includes(productId);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    setBusy(false);
    if (res.status === 401) {
      toast.info("Sign in to save favourites");
      router.push("/login?next=/wishlist");
      return;
    }
    const json = await res.json();
    if (json.ok) {
      const nowActive = json.data.inWishlist;
      useStore.setState({
        wishlist: nowActive
          ? [...wishlist, productId]
          : wishlist.filter((id) => id !== productId),
      });
      toast.success(nowActive ? "Added to wishlist" : "Removed from wishlist");
    } else {
      toast.error(json.error?.message ?? "Could not update wishlist");
    }
  };

  return (
    <button
      onClick={onClick}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={active}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/90 shadow-sm backdrop-blur transition hover:scale-105",
        className
      )}
    >
      <Heart
        className={cn("h-4 w-4 transition", active ? "fill-primary text-primary" : "text-foreground/70")}
      />
    </button>
  );
}
