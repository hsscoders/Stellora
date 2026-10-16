import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Heart } from "lucide-react";
import { formatINR, cn } from "@/lib/utils";
import type { ProductCardData } from "@/lib/types";
import { WishlistButton } from "@/components/stellora/wishlist-button";

export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductCardData;
  priority?: boolean;
}) {
  const from = product.variants[0];
  if (!from) return null;
  const price = Number(from.price);
  const compareAt = from.compareAtPrice == null ? null : Number(from.compareAtPrice);
  const inStock = product.variants.some((v) => Number(v.stock) > 0);
  const onSale = compareAt != null && compareAt > price;
  const discount = onSale ? Math.round(((compareAt! - price) / compareAt!) * 100) : 0;

  return (
    <div className="group relative">
      <Link
        href={`/product/${product.slug}`}
        className="zoom-hover card-glow block overflow-hidden rounded-md border border-border/60 bg-card"
        aria-label={product.name}
      >
        <div className="img-frame relative aspect-square">
          <Image
            src={product.images[0]?.url ?? "/images/placeholder.svg"}
            alt={product.images[0]?.alt ?? product.name}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
          {onSale && (
            <span className="anim-pop absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground shadow-sm">
              {discount > 0 ? `−${discount}%` : "Sale"}
            </span>
          )}
          {!inStock && (
            <span className="absolute left-3 top-3 rounded-full bg-foreground/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-background">
              Sold Out
            </span>
          )}
          {/* Slide-up quick action — desktop pointer devices only */}
          <span className="quick-bar absolute inset-x-0 bottom-0 hidden items-center justify-between bg-background/92 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary backdrop-blur-sm sm:flex">
            View Details
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>

      <WishlistButton productId={product.id} className="absolute right-3 top-3" />

      <div className="px-1 pt-3">
        <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="h-px w-4 bg-primary/40" aria-hidden />
          {product.category?.name ?? "Stellora"}
        </p>
        <Link href={`/product/${product.slug}`}>
          <h3 className="mt-1.5 line-clamp-1 font-serif text-[15px] font-medium leading-snug transition-colors hover:text-primary">
            {product.name}
          </h3>
        </Link>
        <div className="mt-1 flex items-baseline gap-2 tnum">
          <span className="text-[15px] font-semibold">{formatINR(from.price)}</span>
          {onSale && (
            <span className="text-xs text-muted-foreground line-through">
              {formatINR(from.compareAtPrice!)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
