"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

/**
 * Flash-sale announcement strip with a live countdown clock.
 * Replaces the static announcement bar while the sale is running
 * (Admin → Business Settings → Flash sale countdown).
 *
 * Hydration-safe: the countdown digits render only after mount; the server
 * HTML shows the same bar with just the headline text.
 */
export function SaleCountdown({ text, endsAt }: { text: string; endsAt: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(endsAt).getTime();
    if (Number.isNaN(target)) return;
    const tick = () => setRemaining(target - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const ended = remaining !== null && remaining <= 0;
  if (ended) return null;

  const parts =
    remaining !== null && remaining > 0
      ? (() => {
          const s = Math.floor(remaining / 1000);
          const days = Math.floor(s / 86400);
          const hours = Math.floor((s % 86400) / 3600);
          const mins = Math.floor((s % 3600) / 60);
          const secs = s % 60;
          const pad = (n: number) => String(n).padStart(2, "0");
          return days > 0
            ? `${days}d ${pad(hours)}h ${pad(mins)}m`
            : `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
        })()
      : null;

  return (
    <div className="brand-gradient text-primary-foreground">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-[10px] tracking-wide sm:px-6 sm:text-xs">
        <Zap className="h-3 w-3 shrink-0 fill-current" aria-hidden />
        <span className="truncate">{text}</span>
        {parts && (
          <span
            className="shrink-0 rounded-full bg-black/25 px-2 py-0.5 font-mono text-[10px] tabular-nums sm:text-[11px]"
            suppressHydrationWarning
            aria-label={`Sale ends in ${parts}`}
          >
            ⏱ {parts}
          </span>
        )}
      </p>
    </div>
  );
}
