"use client";

import JsBarcode from "jsbarcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Barcode,
  CheckSquare,
  Hash,
  Loader2,
  PackageOpen,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/utils";

/* ------------------------------ API shapes ------------------------------ */

interface ApiVariant {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number | string;
  isActive: boolean;
}

interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  variants: ApiVariant[];
}

interface LabelItem {
  key: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  price: number;
}

/* ------------------------------ print geometry ------------------------------ */

const MM = 96 / 25.4; // CSS px per mm
const MAX_LABELS = 800;
const CFG_KEY = "stellora_barcode_cfg_v2";

const clampN = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Physical papers (A-series + US) and continuous thermal rolls. */
const PAPERS = [
  { id: "A4", name: "A4 · 210 × 297 mm", w: 210, h: 297, roll: false },
  { id: "A5", name: "A5 · 148 × 210 mm", w: 148, h: 210, roll: false },
  { id: "A3", name: "A3 · 297 × 420 mm", w: 297, h: 420, roll: false },
  { id: "letter", name: "US Letter · 216 × 279 mm", w: 215.9, h: 279.4, roll: false },
  { id: "legal", name: "US Legal · 216 × 356 mm", w: 215.9, h: 355.6, roll: false },
  { id: "r58", name: "Thermal roll · 58 mm", w: 58, h: 0, roll: true },
  { id: "r80", name: "Thermal roll · 80 mm", w: 80, h: 0, roll: true },
  { id: "custom", name: "Custom size…", w: 100, h: 150, roll: false },
] as const;

type PaperId = (typeof PAPERS)[number]["id"];

/** Common retail label stocks in mm + a custom escape hatch. */
const LABELS = [
  { id: "25x12", name: "25 × 12 mm · mini tag", w: 25, h: 12 },
  { id: "30x20", name: "30 × 20 mm · tiny", w: 30, h: 20 },
  { id: "38x25", name: "38 × 25 mm · small", w: 38, h: 25 },
  { id: "50x25", name: "50 × 25 mm · price label", w: 50, h: 25 },
  { id: "50x30", name: "50 × 30 mm · medium", w: 50, h: 30 },
  { id: "60x40", name: "60 × 40 mm · large", w: 60, h: 40 },
  { id: "70x50", name: "70 × 50 mm · XL", w: 70, h: 50 },
  { id: "100x50", name: "100 × 50 mm · shipping", w: 100, h: 50 },
  { id: "custom", name: "Custom size…", w: 0, h: 0 },
] as const;

type LabelId = (typeof LABELS)[number]["id"];

interface BcCfg {
  paper: PaperId;
  pw: number; // custom paper mm
  ph: number;
  label: LabelId;
  lw: number; // custom label mm
  lh: number;
  margin: number; // page margin mm
  gap: number; // label gutter mm
  copies: number;
  source: "sku" | "ean13";
  showName: boolean;
  showVariant: boolean;
  showPrice: boolean;
  showSku: boolean;
  showNumber: boolean; // human-readable digits under the bars
  storeName: string;
  borders: boolean;
  /* Stocky-style fine tuning */
  fontScale: number; // text size multiplier (0.7–1.5)
  barScale: number; // barcode height multiplier (0.5–1.6)
  numScale: number; // barcode number size multiplier (0.8–1.6)
  fontWeight: "normal" | "bold";
  fontFamily: "Arial" | "Georgia" | "monospace";
}

const DEFAULT_CFG: BcCfg = {
  paper: "A4",
  pw: 100,
  ph: 150,
  label: "50x25",
  lw: 40,
  lh: 25,
  margin: 6,
  gap: 2,
  copies: 1,
  source: "sku",
  showName: true,
  showVariant: true,
  showPrice: true,
  showSku: false,
  showNumber: true,
  storeName: "",
  borders: true,
  fontScale: 1,
  barScale: 1,
  numScale: 1,
  fontWeight: "bold",
  fontFamily: "Arial",
};

/* Stocky-style sheet presets — one click maps a commercial label stock onto
   paper + label + margins. The engine then computes the real cols×rows that
   fit, so every preset stays WYSIWYG-correct on the chosen sheet. */
const SHEET_PRESETS: {
  id: string;
  name: string;
  paper: PaperId;
  label: LabelId;
  lw: number;
  lh: number;
  margin: number;
  gap: number;
}[] = [
  { id: "p40", name: "40-up · 45.7×25.5", paper: "A4", label: "custom", lw: 45.7, lh: 25.5, margin: 5, gap: 1 },
  { id: "p30", name: "30-up · 66.7×25.4", paper: "A4", label: "custom", lw: 66.7, lh: 25.4, margin: 5, gap: 0 },
  { id: "p24", name: "24-up · 63×33.9", paper: "A4", label: "custom", lw: 63, lh: 33.9, margin: 6, gap: 1 },
  { id: "p20", name: "20-up · 101.6×25.4", paper: "A4", label: "custom", lw: 101.6, lh: 25.4, margin: 3, gap: 0 },
  { id: "p18", name: "18-up · 63.5×46.6", paper: "A4", label: "custom", lw: 63.5, lh: 46.6, margin: 6, gap: 1 },
  { id: "p14", name: "14-up · 101.6×33.9", paper: "A4", label: "custom", lw: 101.6, lh: 33.9, margin: 3, gap: 0 },
  { id: "p12", name: "12-up · 63.5×72", paper: "A4", label: "custom", lw: 63.5, lh: 72, margin: 6, gap: 1 },
  { id: "p10", name: "10-up · 101.6×50.8", paper: "A4", label: "custom", lw: 101.6, lh: 50.8, margin: 3, gap: 0 },
  { id: "s5025", name: "Stickers · 50×25", paper: "A4", label: "50x25", lw: 50, lh: 25, margin: 5, gap: 0 },
  { id: "s5030", name: "Stickers · 50×30", paper: "A4", label: "50x30", lw: 50, lh: 30, margin: 5, gap: 0 },
];

/* Stocky-style design templates — display toggles + type scale in one tap. */
const DESIGN_TEMPLATES: {
  id: string;
  name: string;
  desc: string;
  patch: Partial<BcCfg>;
}[] = [
  {
    id: "t1",
    name: "Template 1",
    desc: "Name, Barcode, Number, Price",
    patch: { showName: true, showNumber: true, showPrice: true, showVariant: false, showSku: false, fontScale: 1, barScale: 1, numScale: 1, fontWeight: "bold" },
  },
  {
    id: "t2",
    name: "Template 2",
    desc: "Name & Price only",
    patch: { showName: true, showNumber: false, showPrice: true, showVariant: false, showSku: false, fontScale: 1.1, barScale: 1, fontWeight: "bold" },
  },
  {
    id: "t3",
    name: "Template 3",
    desc: "Barcode only",
    patch: { showName: false, showNumber: false, showPrice: false, showVariant: false, showSku: false, fontScale: 1, barScale: 1.2 },
  },
  {
    id: "t4",
    name: "Template 4",
    desc: "Large fonts (readable at arm's length)",
    patch: { showName: true, showNumber: true, showPrice: true, showVariant: false, showSku: false, fontScale: 1.25, barScale: 1.15, numScale: 1.2, fontWeight: "bold" },
  },
  {
    id: "t5",
    name: "Template 5",
    desc: "Compact (small accessories)",
    patch: { showName: true, showNumber: true, showPrice: false, showVariant: true, showSku: true, fontScale: 0.85, barScale: 0.85, numScale: 0.9 },
  },
];

function loadCfg(): BcCfg {
  if (typeof window === "undefined") return DEFAULT_CFG;
  try {
    const raw = window.localStorage.getItem(CFG_KEY);
    if (raw) return { ...DEFAULT_CFG, ...(JSON.parse(raw) as Partial<BcCfg>) };
  } catch {
    /* fall through */
  }
  return DEFAULT_CFG;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ------------------------------ barcode svg ------------------------------ */

function BarcodeSvg({
  value,
  format,
  height,
  fontSize,
  showNumber,
}: {
  value: string;
  format: "CODE128" | "EAN13";
  height: number;
  fontSize: number;
  showNumber: boolean;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format,
        displayValue: showNumber,
        font: "monospace",
        fontSize,
        textMargin: 0.4,
        margin: 0,
        height,
        width: format === "EAN13" ? 1.6 : 1.15,
        lineColor: "#000000",
        flat: format === "EAN13" && height < 22,
      });
    } catch {
      /* invalid charset — leave empty rather than crash the sheet */
    }
  }, [value, format, height, fontSize, showNumber]);
  return <svg ref={ref} className="h-auto max-h-full max-w-full" />;
}

/* ------------------------------ label box ------------------------------ */

function LabelBox({
  item,
  cfg,
  labelW,
  labelH,
}: {
  item: LabelItem;
  cfg: BcCfg;
  labelW: number;
  labelH: number;
}) {
  const value = cfg.source === "ean13" ? (item.barcode ?? "") : item.sku;
  const format = cfg.source === "ean13" ? "EAN13" : "CODE128";
  const pad = labelH >= 30 ? 1 : 0.6;
  const fs = cfg.fontScale || 1;
  const fam = cfg.fontFamily === "monospace" ? "'Sarasa Mono SC', monospace" : cfg.fontFamily === "Georgia" ? "Georgia, serif" : "Arial, sans-serif";
  const storeFs = clampN(labelH * 0.115 * fs, 4.5, 10);
  const nameFs = clampN(labelH * 0.16 * fs, 5.5, 13);
  const subFs = clampN(labelH * 0.135 * fs, 5, 11.5);
  const skuFs = clampN(labelH * 0.12 * fs, 4.5, 10);
  const numFs = clampN(labelH * 0.14 * fs * (cfg.numScale || 1), 5, 12);
  const barH = clampN(labelH * (cfg.showNumber ? 0.32 : 0.42) * (cfg.barScale || 1), 6, 60);

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden bg-white"
      style={{
        width: `${labelW}mm`,
        height: `${labelH}mm`,
        border: cfg.borders ? "0.2mm solid #94a3b8" : "none",
      }}
    >
      <div
        className="flex h-full w-full flex-col items-center justify-between overflow-hidden text-black"
        style={{ padding: `${pad}mm` }}
      >
        {cfg.storeName ? (
          <p
            className="w-full truncate text-center font-semibold uppercase leading-tight tracking-wide"
            style={{ fontSize: `${storeFs}px`, fontFamily: fam, fontWeight: cfg.fontWeight === "bold" ? 700 : 400 }}
          >
            {cfg.storeName}
          </p>
        ) : null}
        {cfg.showName ? (
          <p
            className="w-full truncate text-center leading-tight"
            style={{ fontSize: `${nameFs}px`, fontFamily: fam, fontWeight: cfg.fontWeight === "bold" ? 700 : 400 }}
          >
            {item.productName}
          </p>
        ) : null}
        {cfg.showVariant || cfg.showPrice ? (
          <p className="w-full truncate text-center leading-tight" style={{ fontSize: `${subFs}px`, fontFamily: fam }}>
            {cfg.showVariant ? item.variantName : ""}
            {cfg.showVariant && cfg.showPrice ? " · " : ""}
            {cfg.showPrice ? formatINR(item.price) : ""}
          </p>
        ) : null}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          {value ? (
            <BarcodeSvg value={value} format={format} height={barH} fontSize={numFs} showNumber={cfg.showNumber} />
          ) : (
            <span className="text-center leading-tight text-neutral-400" style={{ fontSize: `${subFs}px` }}>
              no number yet
            </span>
          )}
        </div>
        {cfg.showSku ? (
          <p className="w-full truncate text-center leading-none" style={{ fontSize: `${skuFs}px`, fontFamily: fam }}>
            {item.sku}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------ page ------------------------------ */

export default function AdminBarcodesPage() {
  const router = useRouter();

  const [products, setProducts] = useState<ApiProduct[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [cfg, setCfg] = useState<BcCfg>(DEFAULT_CFG);
  const [hydrated, setHydrated] = useState(false);
  /* Stocky-style: per-variant quantity (default 1), plus preview zoom */
  const [perQty, setPerQty] = useState<Record<string, number>>({});
  const [zoom, setZoom] = useState(1); // 1 | 1.5 | 2 — preview only, print stays 1:1

  /* Persisted print configuration — survives reloads and machines. */
  useEffect(() => {
    // localStorage config restore must happen post-mount; once per page load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCfg(loadCfg());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    } catch {
      /* private mode — settings just won't persist */
    }
  }, [cfg, hydrated]);

  const set = <K extends keyof BcCfg>(key: K, value: BcCfg[K]) => setCfg((c) => ({ ...c, [key]: value }));

  /* Pull the whole ACTIVE catalog once (paginated loop over the public API). */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let acc: ApiProduct[] = [];
      let page = 1;
      let pages = 1;
      do {
        const res = await fetch(`/api/products?page=${page}`, { cache: "no-store" });
        const json = await res.json();
        if (!json.ok) {
          toast.error(json.error?.message ?? "Could not load products");
          break;
        }
        const d = json.data as { products: ApiProduct[]; pages: number };
        acc = acc.concat(d.products);
        pages = d.pages;
        page += 1;
      } while (page <= pages && acc.length < 800);

      setProducts(acc);
      setSelected((prev) => {
        const valid = new Set<string>();
        for (const p of acc) for (const v of p.variants) if (v.isActive) valid.add(v.id);
        const next = new Set([...prev].filter((id) => valid.has(id)));
        return next.size > 0 ? next : valid;
      });
    } catch {
      toast.error("Network error while loading products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // fetchAll flips loading state before its first await — intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll();
  }, [fetchAll]);

  /* ---------------- assign EAN-13 numbers (bulk) ---------------- */

  const assignNumbers = useCallback(
    async (overwrite: boolean) => {
      if (overwrite && !window.confirm("Overwrite existing barcode numbers for the selected variants?")) return;
      setAssigning(true);
      try {
        const ids = products
          ? products.flatMap((p) => p.variants.filter((v) => v.isActive && selected.has(v.id)).map((v) => v.id))
          : [];
        const res = await fetch("/api/admin/barcodes/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantIds: ids, overwrite }),
        });
        const json = await res.json();
        if (!json.ok) {
          toast.error(json.error?.message ?? "Could not assign numbers");
          return;
        }
        toast.success(`${json.data.assigned} barcode number${json.data.assigned === 1 ? "" : "s"} assigned`);
        await fetchAll();
      } catch {
        toast.error("Network error while assigning numbers");
      } finally {
        setAssigning(false);
      }
    },
    [products, selected, fetchAll]
  );

  /* ---------------- geometry: paper · grid · pages ---------------- */

  const paper = PAPERS.find((p) => p.id === cfg.paper) ?? PAPERS[0];
  const pageW = paper.id === "custom" ? clampN(cfg.pw, 20, 600) : paper.w;
  const labelW =
    cfg.label === "custom" ? clampN(cfg.lw, 12, 600) : (LABELS.find((l) => l.id === cfg.label) ?? LABELS[3]).w;
  const labelH =
    cfg.label === "custom" ? clampN(cfg.lh, 8, 300) : (LABELS.find((l) => l.id === cfg.label) ?? LABELS[3]).h;
  // continuous roll: one label row per page
  const pageH = paper.roll ? labelH + 2 * cfg.margin : paper.id === "custom" ? clampN(cfg.ph, 20, 900) : paper.h;

  const margin = clampN(cfg.margin, 0, 15);
  const gap = clampN(cfg.gap, 0, 10);
  const usableW = pageW - 2 * margin;
  const usableH = pageH - 2 * margin;
  const overflow = labelW > usableW + 0.01 || labelH > usableH + 0.01;
  const cols = Math.max(1, Math.floor((usableW + gap + 0.01) / (labelW + gap)));
  const rows = paper.roll ? 1 : Math.max(1, Math.floor((usableH + gap + 0.01) / (labelH + gap)));
  const perPage = Math.max(1, cols * rows);

  const copiesNum = 1; // per-variant quantities drive the run now

  /* Build the label run: selection × filter × per-variant qty. */
  const labels = useMemo(() => {
    const out: LabelItem[] = [];
    const q = query.trim().toLowerCase();
    if (!products) return out;
    for (const p of products) {
      for (const v of p.variants) {
        if (!v.isActive) continue;
        if (!selected.has(v.id)) continue;
        if (q && !`${p.name} ${v.name} ${v.sku}`.toLowerCase().includes(q)) continue;
        const qty = Math.min(Math.max(Math.round(perQty[v.id] ?? cfg.copies ?? 1), 1), 100);
        for (let i = 0; i < qty; i += 1) {
          out.push({
            key: `${v.id}-${i}`,
            variantId: v.id,
            productName: p.name,
            variantName: v.name,
            sku: v.sku,
            barcode: v.barcode ?? null,
            price: Number(v.price),
          });
        }
      }
    }
    return out.slice(0, MAX_LABELS);
  }, [products, selected, query, perQty, cfg.copies]);

  /* Selected variants (with qty) for the Stocky-style quantity table */
  const selectedRows = useMemo(() => {
    if (!products) return [];
    const rows: { variantId: string; productName: string; variantName: string; sku: string; qty: number }[] = [];
    for (const p of products) {
      for (const v of p.variants) {
        if (v.isActive && selected.has(v.id)) {
          rows.push({
            variantId: v.id,
            productName: p.name,
            variantName: v.name,
            sku: v.sku,
            qty: Math.min(Math.max(Math.round(perQty[v.id] ?? cfg.copies ?? 1), 1), 100),
          });
        }
      }
    }
    return rows;
  }, [products, selected, perQty, cfg.copies]);

  function setQty(variantId: string, qty: number) {
    const clamped = Math.min(Math.max(Math.round(qty) || 1, 1), 100);
    setPerQty((prev) => ({ ...prev, [variantId]: clamped }));
  }

  function setAllQty(qty: number) {
    const clamped = Math.min(Math.max(Math.round(qty) || 1, 1), 100);
    const next: Record<string, number> = {};
    for (const id of selected) next[id] = clamped;
    setPerQty((prev) => ({ ...prev, ...next }));
  }

  const sheetPages = useMemo(() => chunk(labels, perPage), [labels, perPage]);

  const totalLabelable = useMemo(() => {
    const q = query.trim().toLowerCase();
    let n = 0;
    if (!products) return 0;
    for (const p of products) {
      for (const v of p.variants) {
        if (!v.isActive) continue;
        if (q && !`${p.name} ${v.name} ${v.sku}`.toLowerCase().includes(q)) continue;
        n += 1;
      }
    }
    return n;
  }, [products, query]);

  const missingNumbers = useMemo(() => {
    if (!products) return 0;
    let n = 0;
    for (const p of products) {
      for (const v of p.variants) {
        if (v.isActive && selected.has(v.id) && !v.barcode) n += 1;
      }
    }
    return n;
  }, [products, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!products) return [];
    return products
      .map((p) => ({ p, vs: p.variants.filter((v) => v.isActive) }))
      .filter(
        ({ p, vs }) =>
          vs.length > 0 && (!q || `${p.name} ${vs.map((v) => v.sku).join(" ")}`.toLowerCase().includes(q))
      );
  }, [products, query]);

  /* Preview auto-scale so even A3 sheets fit the column (print is always 1:1). */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(760);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setAvail(Math.max(el.clientWidth - 28, 220));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, avail / (pageW * MM)) * zoom;

  /* ---------------- selection helpers ---------------- */

  /** Stocky-style print: sheets are cloned into a clean popup and the print
      dialog opens automatically — the main tab is never disturbed. */
  function printPopup() {
    const sheets = document.querySelector(".bc-sheets");
    if (!sheets) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.error("Popup blocked — allow popups to print labels");
      return;
    }
    const css = `
      @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .bc-sheets { display: flex; flex-direction: column; align-items: center; gap: 5mm; }
      .bc-sheet { break-after: page; page-break-after: always; overflow: hidden; }
      .bc-sheet:last-child { break-after: auto; page-break-after: auto; }
      svg { display: block; }
    `;
    // clone at 1:1 (preview transform is on .bc-sheet, which we reset via CSS)
    const clone = sheets.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".bc-sheet").forEach((el) => {
      (el as HTMLElement).style.transform = "none";
      (el as HTMLElement).style.boxShadow = "none";
    });
    clone.querySelectorAll(".no-print").forEach((el) => el.remove());
    win.document.write(
      `<!doctype html><html><head><title>Stellora — Barcode Labels</title><style>${css}</style></head><body>${clone.outerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

  function toggleVariant(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    if (!products) return;
    const q = query.trim().toLowerCase();
    const ids: string[] = [];
    for (const p of products) {
      for (const v of p.variants) {
        if (!v.isActive) continue;
        if (q && !`${p.name} ${v.name} ${v.sku}`.toLowerCase().includes(q)) continue;
        ids.push(v.id);
      }
    }
    setSelected(new Set(ids));
  }

  return (
    <div className="space-y-6">
      {/* Dynamic @page — the print dialog pagination matches the chosen paper exactly. */}
      <style>{`
@page { size: ${pageW}mm ${pageH}mm; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body * { visibility: hidden !important; }
  .bc-sheets, .bc-sheets * { visibility: visible !important; }
  .bc-sheets {
    position: absolute !important; left: 0 !important; top: 0 !important;
    width: auto !important; margin: 0 !important; padding: 0 !important; display: block !important;
  }
  .no-print { display: none !important; }
  .bc-frame { width: auto !important; height: auto !important; margin: 0 !important; }
  .bc-sheet { transform: none !important; box-shadow: none !important; break-after: page; page-break-after: always; overflow: hidden; }
  .bc-sheet:last-child { break-after: auto; page-break-after: auto; }
}`}</style>

      {/* header */}
      <div className="no-print flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Barcode className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-medium sm:text-3xl">Barcode Studio</h1>
          <p className="text-sm text-muted-foreground">
            Numbered barcodes on any paper — A4/A5/A3, Letter, Legal, thermal rolls, or a custom size.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => void fetchAll()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => router.push("/admin/pos")}>
            Back to POS
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        {/* LEFT — controls */}
        <section className="no-print space-y-4">
          <div className="space-y-3.5 rounded-lg border border-border/70 bg-card p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter products / SKUs…"
                className="pl-9"
                aria-label="Filter label selection"
              />
            </div>

            {/* barcode source */}
            <div className="space-y-1.5">
              <Label>Barcode content</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={cfg.source === "sku" ? "default" : "outline"}
                  className="rounded-full text-xs"
                  onClick={() => set("source", "sku")}
                >
                  SKU · CODE128
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={cfg.source === "ean13" ? "default" : "outline"}
                  className="rounded-full text-xs"
                  onClick={() => set("source", "ean13")}
                >
                  Number · EAN-13
                </Button>
              </div>
              {cfg.source === "ean13" ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full text-xs"
                    disabled={assigning || missingNumbers === 0}
                    onClick={() => void assignNumbers(false)}
                  >
                    {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hash className="h-3.5 w-3.5" />}
                    Assign missing ({missingNumbers})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-full text-xs"
                    disabled={assigning || selected.size === 0}
                    onClick={() => void assignNumbers(true)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Regenerate
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Stocky-style sheet presets — one tap maps a label stock */}
            <div className="space-y-1.5">
              <Label>Sheet presets (N per sheet)</Label>
              <div className="flex flex-wrap gap-1.5">
                {SHEET_PRESETS.map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() =>
                      setCfg((c) => ({
                        ...c,
                        paper: pr.paper,
                        label: pr.label,
                        lw: pr.lw,
                        lh: pr.lh,
                        margin: pr.margin,
                        gap: pr.gap,
                      }))
                    }
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    {pr.name}
                  </button>
                ))}
              </div>
            </div>

            {/* paper + label sizing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bc-paper">Paper size</Label>
                <select
                  id="bc-paper"
                  value={cfg.paper}
                  onChange={(e) => set("paper", e.target.value as PaperId)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {PAPERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bc-label">Label size</Label>
                <select
                  id="bc-label"
                  value={cfg.label}
                  onChange={(e) => set("label", e.target.value as LabelId)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {LABELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {cfg.paper === "custom" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bc-pw">Paper W (mm)</Label>
                  <Input id="bc-pw" type="number" min={20} max={600} value={cfg.pw} onChange={(e) => set("pw", Number(e.target.value))} inputMode="numeric" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bc-ph">Paper H (mm)</Label>
                  <Input id="bc-ph" type="number" min={20} max={900} value={cfg.ph} onChange={(e) => set("ph", Number(e.target.value))} inputMode="numeric" />
                </div>
              </div>
            ) : null}
            {cfg.label === "custom" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bc-lw">Label W (mm)</Label>
                  <Input id="bc-lw" type="number" min={12} max={600} value={cfg.lw} onChange={(e) => set("lw", Number(e.target.value))} inputMode="numeric" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bc-lh">Label H (mm)</Label>
                  <Input id="bc-lh" type="number" min={8} max={300} value={cfg.lh} onChange={(e) => set("lh", Number(e.target.value))} inputMode="numeric" />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bc-margin">Margin (mm)</Label>
                <Input id="bc-margin" type="number" min={0} max={15} value={cfg.margin} onChange={(e) => set("margin", Number(e.target.value))} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bc-gap">Gap (mm)</Label>
                <Input id="bc-gap" type="number" min={0} max={10} value={cfg.gap} onChange={(e) => set("gap", Number(e.target.value))} inputMode="numeric" />
              </div>
            </div>

            {/* copies for all selected — quick action over the per-variant qty table */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="bc-copies">Qty for all selected</Label>
                <Input id="bc-copies" type="number" min={1} max={100} value={cfg.copies} onChange={(e) => set("copies", Number(e.target.value))} inputMode="numeric" />
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9 rounded-md px-3 text-xs" onClick={() => setAllQty(Number(cfg.copies) || 1)}>
                Apply to all
              </Button>
            </div>

            {/* Stocky-style design templates — display + type scale in one tap */}
            <div className="space-y-1.5">
              <Label>Label design templates</Label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {DESIGN_TEMPLATES.map((t) => {
                  const active = Object.entries(t.patch).every(
                    ([k, v]) => cfg[k as keyof BcCfg] === v
                  );
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCfg((c) => ({ ...c, ...t.patch }))}
                      className={`rounded-md border px-2 py-1.5 text-left transition ${
                        active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-accent"
                      }`}
                    >
                      <span className={`block text-[11px] font-semibold ${active ? "text-primary" : ""}`}>{t.name}</span>
                      <span className="block text-[10px] leading-tight text-muted-foreground">{t.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* label content toggles */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["showNumber", "Number"],
                  ["showName", "Name"],
                  ["showVariant", "Variant"],
                  ["showPrice", "Price"],
                  ["showSku", "SKU text"],
                  ["borders", "Cut lines"],
                ] as const
              ).map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={cfg[key]}
                  onClick={() => set(key, !cfg[key])}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    cfg[key] ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bc-store">Store name on label (optional)</Label>
              <Input
                id="bc-store"
                value={cfg.storeName}
                onChange={(e) => set("storeName", e.target.value)}
                placeholder="e.g. STELLORA"
                maxLength={24}
              />
            </div>

            {/* Stocky-style fine tuning — type + barcode metrics */}
            <details className="rounded-md border border-border/70 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Fine tuning (advanced)
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="bc-fs" className="text-[11px]">Font size ×{cfg.fontScale.toFixed(2)}</Label>
                  <input id="bc-fs" type="range" min={0.7} max={1.5} step={0.05} value={cfg.fontScale} onChange={(e) => set("fontScale", Number(e.target.value))} className="w-full accent-primary" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bc-bs" className="text-[11px]">Barcode height ×{cfg.barScale.toFixed(2)}</Label>
                  <input id="bc-bs" type="range" min={0.5} max={1.6} step={0.05} value={cfg.barScale} onChange={(e) => set("barScale", Number(e.target.value))} className="w-full accent-primary" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bc-ns" className="text-[11px]">Number size ×{cfg.numScale.toFixed(2)}</Label>
                  <input id="bc-ns" type="range" min={0.8} max={1.6} step={0.05} value={cfg.numScale} onChange={(e) => set("numScale", Number(e.target.value))} className="w-full accent-primary" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Font weight</Label>
                  <div className="grid grid-cols-2 gap-1">
                    {(["normal", "bold"] as const).map((w) => (
                      <Button key={w} type="button" size="sm" variant={cfg.fontWeight === w ? "default" : "outline"} className="h-7 rounded-full text-[11px] capitalize" onClick={() => set("fontWeight", w)}>
                        {w}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px]">Font family</Label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["Arial", "Georgia", "monospace"] as const).map((f) => (
                      <Button key={f} type="button" size="sm" variant={cfg.fontFamily === f ? "default" : "outline"} className="h-7 rounded-full text-[11px]" onClick={() => set("fontFamily", f)}>
                        {f === "monospace" ? "Mono" : f}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
              <Button type="button" variant="outline" size="sm" className="rounded-full text-xs" onClick={selectAllFiltered}>
                <CheckSquare className="h-3.5 w-3.5" /> Select all filtered ({totalLabelable})
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-full text-xs" onClick={() => setSelected(new Set())}>
                <Square className="h-3.5 w-3.5" /> Clear
              </Button>
              <Button type="button" variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => setCfg(DEFAULT_CFG)}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset layout
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
              <p className="text-xs text-muted-foreground">
                {labels.length} label{labels.length === 1 ? "" : "s"}
                {labels.length >= MAX_LABELS ? " (capped)" : ""} · {cols}×{rows} per sheet ·{" "}
                {sheetPages.length} sheet{sheetPages.length === 1 ? "" : "s"}
              </p>
              <Button size="sm" className="rounded-full" disabled={labels.length === 0 || overflow} onClick={printPopup}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
          </div>

          {/* selection list */}
          <div className="rounded-lg border border-border/70 bg-card">
            <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Products ({filtered.length})
            </p>
            <div className="stellora-scroll max-h-[420px] overflow-y-auto">
              {loading && products === null ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-8 text-center">
                  <PackageOpen className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm">No products match the filter.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map(({ p, vs }) => (
                    <li key={p.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{p.name}</p>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {vs.length} variant{vs.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {vs.map((v) => {
                          const on = selected.has(v.id);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              aria-pressed={on}
                              title={v.barcode ? `EAN ${v.barcode}` : "No EAN assigned yet"}
                              onClick={() => toggleVariant(v.id)}
                              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition ${
                                on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                              }`}
                            >
                              {v.sku}
                              {cfg.source === "ean13" && !v.barcode ? (
                                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT — live sheet preview */}
        <section ref={wrapRef} className="min-w-0">
          {/* Stocky-style selected-products quantity table */}
          {selectedRows.length > 0 && (
            <div className="no-print mb-4 rounded-lg border border-border/70 bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Selected products ({selectedRows.length}) — set print quantity
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-full text-xs text-destructive hover:text-destructive"
                  onClick={() => setSelected(new Set())}
                >
                  Reset
                </Button>
              </div>
              <div className="stellora-scroll max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-1.5 font-medium">Product</th>
                      <th className="px-4 py-1.5 font-medium">Code</th>
                      <th className="px-4 py-1.5 text-right font-medium">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {selectedRows.map((r) => (
                      <tr key={r.variantId}>
                        <td className="max-w-56 truncate px-4 py-1.5">
                          {r.productName}
                          <span className="ml-1 text-[11px] text-muted-foreground">· {r.variantName}</span>
                        </td>
                        <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">{r.sku}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={r.qty}
                            onChange={(e) => setQty(r.variantId, Number(e.target.value))}
                            aria-label={`Print quantity for ${r.productName} ${r.variantName}`}
                            className="tnum ml-auto w-16 rounded border border-border bg-transparent px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {overflow ? (
            <div className="no-print mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                The label ({labelW} × {labelH} mm) does not fit the printable area ({usableW.toFixed(1)} ×{" "}
                {usableH.toFixed(1)} mm). Pick a bigger paper, smaller label, or reduce the margin.
              </p>
            </div>
          ) : null}
          {cfg.source === "ean13" && missingNumbers > 0 && !overflow ? (
            <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1 text-amber-700">
                {missingNumbers} selected variant{missingNumbers === 1 ? " has" : "s have"} no barcode number yet.
              </p>
              <Button size="sm" variant="outline" className="rounded-full text-xs" disabled={assigning} onClick={() => void assignNumbers(false)}>
                {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hash className="h-3.5 w-3.5" />} Assign now
              </Button>
            </div>
          ) : null}

          {labels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-20 text-center">
              <Barcode className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No labels selected</p>
              <p className="text-xs text-muted-foreground">
                Pick variants on the left — every selected SKU gets a printed, scannable label.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border/70 bg-card p-4">
              <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  1:1 WYSIWYG preview · print at 100% scale, margins “None”, paper “{paper.name}”.
                </p>
                {/* Stocky-style zoom — preview only, print stays 1:1 */}
                <div className="flex items-center gap-1" role="group" aria-label="Preview zoom">
                  {[1, 1.5, 2].map((z) => (
                    <button
                      key={z}
                      type="button"
                      aria-pressed={zoom === z}
                      onClick={() => setZoom(z)}
                      className={`tnum rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        zoom === z ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {z * 100}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="bc-sheets flex flex-col items-center gap-5">
                {sheetPages.map((pageItems, pi) => (
                  <div key={pi} className="flex flex-col items-center">
                    <p className="no-print mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Sheet {pi + 1} / {sheetPages.length}
                    </p>
                    <div className="bc-frame" style={{ width: pageW * MM * scale, height: pageH * MM * scale }}>
                      <div
                        className="bc-sheet bg-white shadow-md"
                        style={{
                          width: `${pageW}mm`,
                          height: `${pageH}mm`,
                          padding: `${margin}mm`,
                          transform: `scale(${scale})`,
                          transformOrigin: "top left",
                        }}
                      >
                        <div
                          className="grid h-full"
                          style={{
                            gridTemplateColumns: `repeat(${cols}, ${labelW}mm)`,
                            gridAutoRows: `${labelH}mm`,
                            gap: `${gap}mm`,
                            justifyContent: "start",
                            alignContent: "start",
                          }}
                        >
                          {pageItems.map((item) => (
                            <LabelBox key={item.key} item={item} cfg={cfg} labelW={labelW} labelH={labelH} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
