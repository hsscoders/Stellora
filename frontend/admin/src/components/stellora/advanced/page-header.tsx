"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — the single consistent header used by EVERY admin page.
 * Icon chip + serif title + muted subtitle on the left, actions on the right.
 *
 * Client pages pass `icon` (a LucideIcon component reference).
 * Server (RSC) pages pass `iconNode` (a pre-rendered element) instead —
 * functions cannot cross the RSC boundary, elements can.
 */
export function PageHeader({
  icon,
  iconNode,
  title,
  subtitle,
  actions,
  className,
}: {
  icon?: LucideIcon;
  iconNode?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {(icon || iconNode) && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-primary/5 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-primary">
            {icon ? <IconOf icon={icon} /> : iconNode}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-medium leading-tight md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function IconOf({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-5 w-5 text-primary" aria-hidden="true" />;
}
