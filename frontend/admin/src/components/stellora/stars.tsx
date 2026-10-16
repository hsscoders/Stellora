import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only star row. `value` 0–5; supports halves visually. */
export function StarRating({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = value >= i - 0.25;
        return (
          <Star
            key={i}
            className={cn(
              dim,
              filled ? "fill-primary text-primary" : "fill-transparent text-muted-foreground/40"
            )}
            aria-hidden
          />
        );
      })}
    </span>
  );
}
