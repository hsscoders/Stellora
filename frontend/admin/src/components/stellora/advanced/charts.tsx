"use client";

import { useMemo, useState } from "react";
import { cn, formatINR } from "@/lib/utils";

export type ChartFormat = "inr" | "num";

/** Resolve a formatter: explicit fn (client pages) or a serializable preset (RSC pages). */
function fmt(format: ChartFormat | undefined, formatValue?: (n: number) => string): (n: number) => string {
  if (formatValue) return formatValue;
  if (format === "inr") return (n: number) => formatINR(Math.round(n));
  return (n: number) => (format === "num" ? String(Math.round(n)) : compact(n));
}

/* ============================================================
   Lightweight pure-SVG chart kit — no external chart library.
   Every chart is responsive (viewBox), animated and themed via
   currentColor / CSS vars so it works in light + dark mode.
   ============================================================ */

export type Point = { label: string; value: number };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const unit = max / pow;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return nice * pow;
}

function compact(n: number): string {
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n * 100) / 100);
}

/* ---------------- AreaChart (revenue trends) ---------------- */

export function AreaChart({
  data,
  height = 220,
  format,
  formatValue,
  accent = "hsl(var(--primary))",
  className,
}: {
  data: Point[];
  height?: number;
  format?: ChartFormat;
  formatValue?: (n: number) => string;
  accent?: string;
  className?: string;
}) {
  const formatValueSafe = fmt(format, formatValue);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const padL = 44;
  const padB = 22;
  const padT = 10;

  const { max, pts, area, line } = useMemo(() => {
    const max = niceMax(Math.max(...data.map((d) => d.value), 1));
    const iw = W - padL - 8;
    const ih = H - padB - padT;
    const step = data.length > 1 ? iw / (data.length - 1) : iw;
    const pts = data.map((d, i) => ({
      x: padL + i * step,
      y: padT + ih - (d.value / max) * ih,
      d,
    }));
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${padL + (data.length - 1) * step},${padT + ih} L${padL},${padT + ih} Z`;
    return { max, pts, area, line };
  }, [data, H]);

  if (!data.length) return null;
  const ih = H - padB - padT;

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Area chart" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="ac-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + ih * t;
          return (
            <g key={t}>
              <line x1={padL} x2={W - 8} y1={y} y2={y} className="stroke-border/60" strokeDasharray="3 4" strokeWidth="1" />
              <text x={padL - 6} y={y + 3.5} textAnchor="end" className="fill-muted-foreground" fontSize="9.5">
                {formatValueSafe(max * (1 - t))}
              </text>
            </g>
          );
        })}
        <path d={area} fill="url(#ac-grad)" />
        <path d={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x - (W - padL) / (2 * Math.max(data.length - 1, 1))}
              y={padT}
              width={(W - padL) / Math.max(data.length - 1, 1)}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
            {hover === i && (
              <>
                <line x1={p.x} x2={p.x} y1={padT} y2={padT + ih} className="stroke-border" strokeWidth="1" />
                <circle cx={p.x} cy={p.y} r="4" fill={accent} className="stroke-background" strokeWidth="2" />
              </>
            )}
          </g>
        ))}
        {pts
          .filter((_, i) => data.length <= 8 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1)
          .map((p, i) => (
            <text key={i} x={p.x} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize="9.5">
              {p.d.label}
            </text>
          ))}
      </svg>
      {hover !== null && pts[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${(pts[hover].x / W) * 100}%`, top: `${(pts[hover].y / H) * 100}%` }}
        >
          <span className="font-semibold tnum">{formatValueSafe(pts[hover].d.value)}</span>
          <span className="ml-1.5 text-muted-foreground">{pts[hover].d.label}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- DonutChart (status splits) ---------------- */

const DONUT_COLORS = [
  "hsl(152 65% 42%)", "hsl(45 93% 47%)", "hsl(199 89% 48%)", "hsl(262 83% 58%)",
  "hsl(340 82% 52%)", "hsl(25 95% 53%)", "hsl(174 72% 40%)", "hsl(220 13% 55%)",
];

export function DonutChart({
  data,
  size = 180,
  thickness = 26,
  centerLabel,
  format,
  formatValue,
  className,
}: {
  data: Point[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  format?: ChartFormat;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const formatValueSafe = fmt(format, formatValue);
  const total = data.reduce((n, d) => n + d.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  if (!total) return <Empty size={size} />;

  const segs = data.map((d, i) => {
    const frac = d.value / total;
    const before = data.slice(0, i).reduce((n, x) => n + x.value, 0) / total;
    return { ...d, i, dash: frac * c, offset: -before * c, pct: Math.round(frac * 100) };
  });

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-5", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Donut chart">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={thickness} />
          {segs.map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={DONUT_COLORS[s.i % DONUT_COLORS.length]}
              strokeWidth={hover === s.i ? thickness + 4 : thickness}
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={s.offset}
              strokeLinecap="butt"
              className="transition-all duration-200"
              opacity={hover === null || hover === s.i ? 1 : 0.35}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-semibold tnum">
            {hover !== null ? formatValueSafe(segs[hover].value) : formatValueSafe(total)}
          </span>
          <span className="max-w-24 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {hover !== null ? segs[hover].label : centerLabel ?? "total"}
          </span>
        </div>
      </div>
      <ul className="space-y-1.5 text-xs">
        {segs.map((s) => (
          <li
            key={s.label}
            className={cn("flex cursor-default items-center gap-2 rounded px-1.5 py-0.5 transition", hover === s.i && "bg-accent")}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: DONUT_COLORS[s.i % DONUT_COLORS.length] }} />
            <span className="font-medium">{s.label}</span>
            <span className="tnum text-muted-foreground">
              {formatValueSafe(s.value)} · {s.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ size }: { size: number }) {
  return (
    <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height: size / 1.4 }}>
      No data yet
    </div>
  );
}

/* ---------------- BarList (top products etc.) ---------------- */

export function BarList({
  data,
  format,
  formatValue,
  color = "hsl(var(--primary))",
  className,
}: {
  data: Point[];
  format?: ChartFormat;
  formatValue?: (n: number) => string;
  color?: string;
  className?: string;
}) {
  const formatValueSafe = fmt(format, formatValue);
  const max = Math.max(...data.map((d) => d.value), 1);
  if (!data.length) return <p className="py-8 text-center text-xs text-muted-foreground">No data yet</p>;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {data.map((d, i) => (
        <li key={d.label} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="tnum text-[10px] text-muted-foreground">#{i + 1}</span>
              <span className="truncate font-medium">{d.label}</span>
            </span>
            <span className="tnum shrink-0 font-semibold">{formatValueSafe(d.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max((d.value / max) * 100, 2)}%`, background: color, opacity: 0.55 + 0.45 * (d.value / max) }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- ColumnChart (hourly / compare) ---------------- */

export function ColumnChart({
  data,
  height = 160,
  format,
  formatValue,
  accent = "hsl(var(--primary))",
  className,
}: {
  data: Point[];
  height?: number;
  format?: ChartFormat;
  formatValue?: (n: number) => string;
  accent?: string;
  className?: string;
}) {
  const formatValueSafe = fmt(format, formatValue);
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  if (!data.length) return <p className="py-8 text-center text-xs text-muted-foreground">No data yet</p>;
  return (
    <div className={cn("relative flex items-end gap-[3px]", className)} style={{ height }}>
      {data.map((d, i) => (
        <div
          key={i}
          className="group relative flex h-full flex-1 flex-col justify-end"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <div
            className="w-full rounded-t-[3px] transition-all duration-300"
            style={{
              height: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0.8)}%`,
              background: accent,
              opacity: hover === null || hover === i ? 0.85 : 0.35,
            }}
          />
          {hover === i && (
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] shadow-md">
              <span className="font-semibold tnum">{formatValueSafe(d.value)}</span>
              <span className="ml-1 text-muted-foreground">{d.label}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Sparkline (stat cards) ---------------- */

export function Sparkline({
  data,
  width = 96,
  height = 30,
  accent = "hsl(var(--primary))",
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  accent?: string;
  className?: string;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - ((v - min) / range) * (height - 6)).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={accent} opacity="0.1" />
      <path d={line} fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- RatingBars (reviews distribution) ---------------- */

export function RatingBars({ dist, total, className }: { dist: number[]; total: number; className?: string }) {
  return (
    <ul className={cn("space-y-1.5", className)}>
      {[5, 4, 3, 2, 1].map((star) => {
        const n = dist[star] ?? 0;
        return (
          <li key={star} className="flex items-center gap-2 text-xs">
            <span className="w-7 shrink-0 tnum font-medium">{star}★</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-500"
                style={{ width: `${total ? Math.max((n / total) * 100, n > 0 ? 3 : 0) : 0}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right tnum text-muted-foreground">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}

export const chartHelpers = { niceMax, compact };
