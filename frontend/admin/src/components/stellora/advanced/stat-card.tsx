"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "./charts";
import { cn } from "@/lib/utils";

/**
 * StatCard — consistent KPI card with optional trend delta and sparkline.
 * Used 4–8× at the top of every admin page.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  deltaPct,
  deltaLabel = "vs prev",
  spark,
  accent = "text-primary",
  invertDelta = false,
  className,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  /** % change; positive renders green unless invertDelta. */
  deltaPct?: number | null;
  deltaLabel?: string;
  spark?: number[];
  accent?: string;
  invertDelta?: boolean;
  className?: string;
}) {
  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct);
  const good = hasDelta ? (invertDelta ? deltaPct! <= 0 : deltaPct! >= 0) : false;

  return (
    <div
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card p-4 transition hover:border-border hover:shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 transition group-hover:bg-muted", accent)}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="truncate text-2xl font-semibold leading-none tnum" title={String(value)}>
          {value}
        </p>
        {spark && spark.length > 1 && <Sparkline data={spark} accent="currentColor" className="shrink-0 text-primary/70" />}
      </div>
      {hasDelta && (
        <p className="mt-2 flex items-center gap-1 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
              good ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
            )}
          >
            {deltaPct! >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(deltaPct!).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">{deltaLabel}</span>
        </p>
      )}
    </div>
  );
}

/* ============================================================
   StatCardGrid — server-component-safe wrapper: pass icon NAMES
   (strings), not component references. Used by RSC pages.
   ============================================================ */

import {
  IndianRupee, TrendingUp, ShoppingCart, Users, Package, Star, Crown,
  UserPlus, CheckCircle2, XCircle, Clock3, Package2, TriangleAlert,
  CircleDot, PackageX, Layers,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  rupee: IndianRupee,
  trending: TrendingUp,
  cart: ShoppingCart,
  users: Users,
  package: Package,
  star: Star,
  crown: Crown,
  userPlus: UserPlus,
  check: CheckCircle2,
  xcircle: XCircle,
  clock: Clock3,
  package2: Package2,
  alert: TriangleAlert,
  dot: CircleDot,
  packageX: PackageX,
  layers: Layers,
};

export type StatItem = {
  label: string;
  value: string | number;
  /** Icon name from the serializable map (rupee, cart, users…). */
  icon?: string;
  deltaPct?: number | null;
  deltaLabel?: string;
  spark?: number[];
  accent?: string;
  invertDelta?: boolean;
};

export function StatCardGrid({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6", className)}>
      {items.map((it) => (
        <StatCard
          key={it.label}
          label={it.label}
          value={it.value}
          icon={it.icon ? ICON_MAP[it.icon] : undefined}
          deltaPct={it.deltaPct}
          deltaLabel={it.deltaLabel}
          spark={it.spark}
          accent={it.accent}
          invertDelta={it.invertDelta}
        />
      ))}
    </div>
  );
}
