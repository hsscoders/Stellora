import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
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
  const inStock = product.variants.some((v) => v.stock > 0);
  const onSale = from.compareAtPrice && from.compareAtPrice > from.price;

  return (
    <div className="group relative">
      <Link
        href={`/product/${product.slug}`}
        className="zoom-hover block overflow-hidden rounded-md border border-border/60 bg-card"
        aria-label={product.name}
      >
        <div className="relative aspect-square">
          <Image
            src={product.images[0]?.url ?? "/images/placeholder.svg"}
            alt={product.images[0]?.alt ?? product.name}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
          {onSale && (
            <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
              Sale
            </span>
          )}
          {!inStock && (
            <span className="absolute left-3 top-3 rounded-full bg-foreground/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-background">
              Sold Out
            </span>
          )}
        </div>
      </Link>

      <WishlistButton productId={product.id} className="absolute right-3 top-3" />

      <div className="px-1 pt-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {product.category?.name ?? "Stellora"}
        </p>
        <Link href={`/product/${product.slug}`}>
          <h3 className="mt-1 line-clamp-1 font-serif text-[15px] font-medium leading-snug hover:text-primary">
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
