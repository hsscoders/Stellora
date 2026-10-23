"use client";

import { useCallback, useEffect, useMemo, useRef, useState, isValidElement, type ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ============================================================
   Shared page widgets — consistent across every admin page:
   SectionCard, EmptyState, ErrorState, ChipRow, ToggleGroup,
   DateRange presets, useAutoRefresh hook, Kbd, MiniProgress.
   ============================================================ */

/* ---------------- SectionCard ---------------- */

export function SectionCard({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  /** Client pages: a LucideIcon component. Server (RSC) pages: a pre-rendered <Icon/> element. */
  icon?: React.ComponentType<{ className?: string }> | ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const iconEl =
    icon == null ? null : isValidElement(icon) ? (
      <span className="[&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-muted-foreground">{icon}</span>
    ) : (
      (() => {
        const IconComp = icon as React.ComponentType<{ className?: string }>;
        return <IconComp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
      })()
    );
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border border-border/70 bg-card", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
          <h2 className="flex items-center gap-2 font-serif text-base font-medium">
            {iconEl}
            {title}
          </h2>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("min-w-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------------- EmptyState ---------------- */

export function EmptyState({ icon: Icon = Inbox, title, hint, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/70">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------------- ErrorState ---------------- */

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10">
        <AlertTriangle className="h-5 w-5 text-rose-500" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {message && <p className="max-w-md text-xs text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

/* ---------------- ChipRow (filter chips) ---------------- */

export function ChipRow<T extends string>({
  value,
  options,
  onChange,
  label,
  counts,
  size = "md",
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  label: string;
  counts?: Partial<Record<T, number>>;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {options.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          aria-pressed={value === s}
          className={cn(
            "rounded-full border font-medium transition",
            size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
            value === s
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {s === "ALL" ? "All" : s}
          {counts?.[s] !== undefined && <span className="tnum ml-1 opacity-70">{counts[s]}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Toggle chip (single boolean pill) ---------------- */

export function ToggleChip({ on, onToggle, children, icon: Icon }: { on: boolean; onToggle: () => void; children: ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/* ---------------- Date range presets ---------------- */

export type DatePreset = "ALL" | "TODAY" | "7D" | "30D" | "90D";

export const DATE_PRESETS: readonly DatePreset[] = ["ALL", "TODAY", "7D", "30D", "90D"];

export function presetStart(preset: DatePreset): Date | null {
  const now = new Date();
  switch (preset) {
    case "TODAY":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "7D":
      return new Date(now.getTime() - 7 * 86400000);
    case "30D":
      return new Date(now.getTime() - 30 * 86400000);
    case "90D":
      return new Date(now.getTime() - 90 * 86400000);
    default:
      return null;
  }
}

export function DateRangeChips({ value, onChange }: { value: DatePreset; onChange: (v: DatePreset) => void }) {
  return (
    <ChipRow
      label="Date range"
      value={value}
      options={DATE_PRESETS}
      onChange={onChange}
      size="sm"
    />
  );
}

export function inPreset(d: Date | string, preset: DatePreset): boolean {
  const start = presetStart(preset);
  if (!start) return true;
  return new Date(d).getTime() >= start.getTime();
}

/* ---------------- useAutoRefresh hook ---------------- */

export function useAutoRefresh(fn: () => void, ms = 30000, enabledDefault = false) {
  const [enabled, setEnabled] = useState(enabledDefault);
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [enabled, ms]);
  return { autoRefresh: enabled, setAutoRefresh: setEnabled };
}

export function AutoRefreshToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        checked ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground hover:bg-accent"
      )}
      title="Refresh data automatically every 30s"
    >
      <RefreshCw className={cn("h-3.5 w-3.5", checked && "animate-spin [animation-duration:3s]")} />
      Live {checked ? "ON" : "OFF"}
    </button>
  );
}

/* ---------------- Kbd ---------------- */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] font-semibold text-muted-foreground">
      {children}
    </kbd>
  );
}

/* ---------------- MiniProgress ---------------- */

export function MiniProgress({ value, max, className, barClass = "bg-primary" }: { value: number; max: number; className?: string; barClass?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", barClass)} style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
    </div>
  );
}

/* ---------------- useConfirm helper (window.confirm wrapper kept simple) ---------------- */

export function useToastCallback() {
  const [busy, setBusy] = useState(false);
  const wrap = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return useMemo(() => ({ busy, wrap }), [busy, wrap]);
}
