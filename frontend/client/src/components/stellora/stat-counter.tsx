"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Count-up stat: animates from 0 to `value` when it first enters the
 * viewport. Easing keeps large numbers readable; static fallback for
 * reduced-motion (global CSS kills transitions anyway, but we also skip
 * the rAF loop entirely).
 */
export function StatCounter({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  label,
  duration = 1600,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  label: string;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Start at zero (SSR-safe); the count-up replaces it when the stat enters view.
  const [display, setDisplay] = useState(() =>
    (0).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  );
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const format = (n: number) =>
      n.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        if (reduced) {
          setDisplay(format(value));
          return;
        }
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 4);
          setDisplay(format(value * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, decimals, duration]);

  return (
    <div ref={ref} className="text-center">
      <p className="font-serif text-3xl font-semibold tracking-tight tnum sm:text-4xl">
        <span className="text-gradient-brand">
          {prefix}
          {display}
          {suffix}
        </span>
      </p>
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
