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
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-serif text-3xl font-medium text-foreground sm:text-4xl">
        {title}
      </h2>
      <div
        className={cn(
          "mt-4 h-px w-24 gold-line",
          align === "center" ? "mx-auto" : ""
        )}
      />
    </div>
  );
}
