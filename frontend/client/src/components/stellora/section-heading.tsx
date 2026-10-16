import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  className,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  className?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={cn(align === "center" ? "text-center" : "text-left", className)}>
      {eyebrow && (
        <p
          className={cn(
            "eyebrow-row text-[11px] font-semibold uppercase tracking-[0.3em] text-primary",
            align === "left" && "[&::before]:hidden",
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      <div
        className={cn(
          "ornament mt-4",
          align === "center" ? "justify-center" : "justify-start",
        )}
        aria-hidden
      >
        <span className="ornament-diamond" />
      </div>
    </div>
  );
}
