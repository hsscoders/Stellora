import Link from "next/link";
import { PackageOpen, SearchX, HeartCrack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon = "package",
  title,
  description,
  actionLabel,
  actionHref,
  className,
}: {
  icon?: "package" | "search" | "heart";
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}) {
  const Icon = icon === "search" ? SearchX : icon === "heart" ? HeartCrack : PackageOpen;
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-20 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
        <Icon className="h-7 w-7 text-accent-foreground" />
      </div>
      <h3 className="mt-5 font-serif text-2xl">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel && actionHref && (
        <Button asChild className="mt-6 bg-primary hover:bg-primary/90">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
