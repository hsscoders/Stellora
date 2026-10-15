import { cn } from "@/lib/utils";

export function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse", className)}>
      <div className="aspect-square rounded-md bg-muted" />
      <div className="mt-3 h-3 w-1/3 rounded bg-muted" />
      <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
      <div className="mt-2 h-4 w-1/4 rounded bg-muted" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
