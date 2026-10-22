"use client";

import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Barcode,
  CheckSquare,
  Hash,
  Loader2,
  Minus,
  PackageOpen,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { formatINR } from "@/lib/utils";

/* ------------------------------ API shapes ------------------------------ */

interface ApiVariant {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number | string;
  compareAtPrice: number | string | null;
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
  mrp: number | null;
}

/* ------------------------------ print geometry ------------------------------ */

const MM = 96 / 25.4; // CSS px per mm
const MAX_LABELS = 800;
const CFG_KEY = "stellora_barcode_cfg_v2";
const DEFAULT_KEY = "stellora_barcode_default_v1";
const LAYOUTS_KEY = "stellora_barcode_layouts_v1";

const clampN = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const api = (path: string) => `/admin-console${path}`;

const BRAND = {
  solid: "bg-primary hover:bg-primary/90 text-white",
};

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
  source: "sku" | "ean13" | "qr";
  showName: boolean;
  showVariant: boolean;
  showPrice: boolean;
  showMrp: boolean; // MRP strikethrough next to the sale price (beyond Stocky)
  showSku: boolean;
  showNumber: boolean; // human-readable digits under the bars
  storeName: string;
  borders: boolean;
  autoPrint: boolean; // print dialog fires automatically (Stocky "Auto Print")
  /* Stocky-style fine tuning */
  fontScale: number; // text size multiplier (0.7–1.5)
  barScale: number; // barcode height multiplier (0.5–1.6)
  barWidth: number; // bar density multiplier (0.8–2.2) — beyond Stocky
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
  showMrp: false,
  showSku: false,
  showNumber: true,
  storeName: "",
  borders: true,
  autoPrint: true,
  fontScale: 1,
  barScale: 1,
  barWidth: 1,
  numScale: 1,
  fontWeight: "bold",
  fontFamily: "Arial",
};

/* Stocky-exact sheet presets — the dropdown labels mirror the demo
   ("40 per sheet (a4) (1.799 * 1.003)" with inch dimensions). One click maps
   a commercial label stock onto paper + label + margins; the engine then
   computes the real cols×rows that fit, so every preset stays WYSIWYG. */
const SHEET_PRESETS: {
  id: string;
  n: number;
  paper: PaperId;
  label: LabelId;
  lw: number;
  lh: number;
  margin: number;
  gap: number;
}[] = [
  { id: "p40", n: 40, paper: "A4", label: "custom", lw: 45.7, lh: 25.5, margin: 5, gap: 1 },
  { id: "p30", n: 30, paper: "A4", label: "custom", lw: 66.7, lh: 25.4, margin: 5, gap: 0 },
  { id: "p24", n: 24, paper: "A4", label: "custom", lw: 63, lh: 33.9, margin: 6, gap: 1 },
  { id: "p20", n: 20, paper: "A4", label: "custom", lw: 101.6, lh: 25.4, margin: 3, gap: 0 },
  { id: "p18", n: 18, paper: "A4", label: "custom", lw: 63.5, lh: 46.6, margin: 6, gap: 1 },
  { id: "p14", n: 14, paper: "A4", label: "custom", lw: 101.6, lh: 33.9, margin: 3, gap: 0 },
  { id: "p12", n: 12, paper: "A4", label: "custom", lw: 63.5, lh: 72, margin: 6, gap: 1 },
  { id: "p10", n: 10, paper: "A4", label: "custom", lw: 101.6, lh: 50.8, margin: 3, gap: 0 },
];

/** Stocky-style sheet option label: "40 per sheet (a4) (1.799 * 1.003)" —
    inches, three decimals, exactly like the reference. */
function presetLabel(pr: (typeof SHEET_PRESETS)[number]): string {
  return `${pr.n} per sheet (a4) (${(pr.lw / 25.4).toFixed(3)} * ${(pr.lh / 25.4).toFixed(3)})`;
}

/* Stocky-style design templates — display toggles + type scale in one tap. */
const DESIGN_TEMPLATES: {
  id: string;
  name: string;
  short: string;
  patch: Partial<BcCfg>;
}[] = [
  {
    id: "t1",
    name: "Template 1 — Name, Barcode, Number, Price",
    short: "Name, Barcode, Number…",
    patch: { showName: true, showNumber: true, showPrice: true, showVariant: false, showSku: false, fontScale: 1, barScale: 1, numScale: 1, fontWeight: "bold" },
  },
  {
    id: "t2",
    name: "Template 2 — Name & Price only",
    short: "Name & Price only",
    patch: { showName: true, showNumber: false, showPrice: true, showVariant: false, showSku: false, fontScale: 1.1, barScale: 1, fontWeight: "bold" },
  },
  {
    id: "t3",
    name: "Template 3 — Barcode only",
    short: "Barcode only",
    patch: { showName: false, showNumber: false, showPrice: false, showVariant: false, showSku: false, fontScale: 1, barScale: 1.2 },
  },
  {
    id: "t4",
    name: "Template 4 — Name, Barcode, Price (large)",
    short: "Name, Barcode, Price (larg…",
    patch: { showName: true, showNumber: true, showPrice: true, showVariant: false, showSku: false, fontScale: 1.25, barScale: 1.15, numScale: 1.2, fontWeight: "bold" },
  },
  {
    id: "t5",
    name: "Template 5 — Compact (small accessories)",
    short: "Compact (small…",
    patch: { showName: true, showNumber: true, showPrice: false, showVariant: true, showSku: true, fontScale: 0.85, barScale: 0.85, numScale: 0.9 },
  },
];

function loadCfg(): BcCfg {
  if (typeof window === "undefined") return DEFAULT_CFG;
  try {
    // layered defaults: factory < saved "default" < last-used session cfg
    let cfg = DEFAULT_CFG;
    const savedDefault = window.localStorage.getItem(DEFAULT_KEY);
    if (savedDefault) cfg = { ...cfg, ...(JSON.parse(savedDefault) as Partial<BcCfg>) };
    const raw = window.localStorage.getItem(CFG_KEY);
    if (raw) cfg = { ...cfg, ...(JSON.parse(raw) as Partial<BcCfg>) };
    return cfg;
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

const mmToInch = (mm: number) => (mm / 25.4).toFixed(1);

/* ------------------------------ barcode svg ------------------------------ */

function BarcodeSvg({
  value,
  format,
  height,
  fontSize,
  showNumber,
  barWidth,
}: {
  value: string;
  format: "CODE128" | "EAN13";
  height: number;
  fontSize: number;
  showNumber: boolean;
  barWidth: number;
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
        width: (format === "EAN13" ? 1.6 : 1.15) * barWidth,
        lineColor: "#000000",
        flat: format === "EAN13" && height < 22,
      });
    } catch {
      /* invalid charset — leave empty rather than crash the sheet */
    }
  }, [value, format, height, fontSize, showNumber, barWidth]);
  return <svg ref={ref} className="h-auto max-h-full max-w-full" />;
}

/** 2D QR label (beyond Stocky) — encodes the SKU/number as a scannable QR.
    Renders an inline SVG string so the print popup clone keeps it. */
function QrSvg({ value }: { value: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(value || " ", {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((s) => {
        if (live) setSvg(s);
      })
      .catch(() => {
        if (live) setSvg("");
      });
    return () => {
      live = false;
    };
  }, [value]);
  if (!svg) return null;
  return (
    <span
      aria-hidden
      className="flex h-full w-full items-center justify-center [&_svg]:h-full [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:w-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
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
  const isQr = cfg.source === "qr";
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
        {cfg.showVariant || cfg.showPrice || (cfg.showMrp && item.mrp) ? (
          <p className="w-full truncate text-center leading-tight" style={{ fontSize: `${subFs}px`, fontFamily: fam }}>
            {cfg.showVariant ? item.variantName : ""}
            {cfg.showVariant && (cfg.showPrice || (cfg.showMrp && item.mrp)) ? " · " : ""}
            {cfg.showMrp && item.mrp ? (
              <span style={{ textDecoration: "line-through", opacity: 0.55 }}>{formatINR(item.mrp)}</span>
            ) : null}
            {cfg.showMrp && item.mrp && cfg.showPrice ? " " : ""}
            {cfg.showPrice ? formatINR(item.price) : ""}
          </p>
        ) : null}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          {value ? (
            isQr ? (
              <QrSvg value={value} />
            ) : (
              <BarcodeSvg value={value} format={format} height={barH} fontSize={numFs} showNumber={cfg.showNumber} barWidth={cfg.barWidth || 1} />
            )
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

/* Mini template tile preview — a tiny label mock drawn with CSS bars so the
   six choices read like Stocky's visual template picker. */
function TemplateThumb({ id }: { id: string }) {
  const bars = (
    <span
      aria-hidden
      className="block h-5 w-full"
      style={{
        background: "repeating-linear-gradient(90deg,#0f172a 0 1.5px,#fff 1.5px 3px,#0f172a 3px 4.5px,#fff 4.5px 5.5px)",
      }}
    />
  );
  const nameBar = <span className="block h-1.5 w-3/4 rounded-full bg-slate-700" />;
  const priceBar = <span className="block h-1.5 w-1/3 self-end rounded-full bg-primary/80" />;
  return (
    <span className="flex h-12 w-full flex-col justify-between rounded-sm border border-slate-200 bg-white p-1.5">
      {id === "t2" ? (
        <>
          {nameBar}
          {priceBar}
        </>
      ) : id === "t3" ? (
        <span className="flex h-full items-center">{bars}</span>
      ) : id === "t5" ? (
        <>
          <span className="flex items-center justify-between gap-1">
            <span className="block h-1 w-2/3 rounded-full bg-slate-600" />
            <span className="block h-1 w-1/5 rounded-full bg-slate-400" />
          </span>
          {bars}
          <span className="block h-1 w-1/2 self-end rounded-full bg-slate-300" />
        </>
      ) : (
        <>
          {nameBar}
          {bars}
          {priceBar}
        </>
      )}
    </span>
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
  const [advanced, setAdvanced] = useState(false);
  /* Stocky-style: per-variant quantity (default 1), plus preview zoom */
  const [perQty, setPerQty] = useState<Record<string, number>>({});
  const [zoom, setZoom] = useState(1); // 1 | 1.5 | 2 — preview only, print stays 1:1
  /* Beyond Stocky: multiple named saved layouts (Stocky keeps only one default) */
  const [layouts, setLayouts] = useState<{ id: string; name: string; cfg: BcCfg }[]>([]);
  const [layoutName, setLayoutName] = useState("");

  /* Persisted print configuration — survives reloads and machines. */
  useEffect(() => {
    // localStorage config restore must happen post-mount; once per page load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCfg(loadCfg());
    try {
      const raw = window.localStorage.getItem(LAYOUTS_KEY);
      if (raw) setLayouts(JSON.parse(raw) as { id: string; name: string; cfg: BcCfg }[]);
    } catch {
      /* ignore corrupt layouts */
    }
    setHydrated(true);
  }, []);

  function persistLayouts(next: { id: string; name: string; cfg: BcCfg }[]) {
    setLayouts(next);
    try {
      window.localStorage.setItem(LAYOUTS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }

  function saveLayout() {
    const name = layoutName.trim();
    if (!name) {
      toast.error("Enter a layout name first");
      return;
    }
    persistLayouts([...layouts.filter((l) => l.name !== name), { id: `l-${Date.now()}`, name, cfg }]);
    setLayoutName("");
    toast.success(`"${name}" layout saved`);
  }

  function applyLayout(id: string) {
    const found = layouts.find((l) => l.id === id);
    if (!found) return;
    setCfg((c) => ({ ...c, ...found.cfg }));
    toast.success(`"${found.name}" layout applied`);
  }

  function deleteLayout(id: string) {
    persistLayouts(layouts.filter((l) => l.id !== id));
  }
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    } catch {
      /* private mode — settings just won't persist */
    }
  }, [cfg, hydrated]);

  const set = <K extends keyof BcCfg>(key: K, value: BcCfg[K]) => setCfg((c) => ({ ...c, [key]: value }));

  /* "Save as default" — the current design becomes the starting point on
     every machine and every reload (Stocky's Save as default). */
  function saveAsDefault() {
    try {
      window.localStorage.setItem(DEFAULT_KEY, JSON.stringify(cfg));
      toast.success("Saved as default — every new label run starts from this design");
    } catch {
      toast.error("Could not save the default (storage blocked)");
    }
  }

  /* Pull the whole ACTIVE catalog once (paginated loop over the public API). */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let acc: ApiProduct[] = [];
      let page = 1;
      let pages = 1;
      do {
        const res = await fetch(`${api("/api/products")}?page=${page}`, { cache: "no-store" });
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
        const res = await fetch(`${api("/api/admin/barcodes/assign")}`, {
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

  /* Which Stocky sheet preset (if any) matches the live geometry — drives the
     Paper size dropdown's selected option. */
  const activePresetId = useMemo(() => {
    const pr = SHEET_PRESETS.find(
      (p) =>
        cfg.paper === p.paper &&
        cfg.label === p.label &&
        Math.abs(cfg.lw - p.lw) < 0.01 &&
        Math.abs(cfg.lh - p.lh) < 0.01 &&
        Math.abs(cfg.margin - p.margin) < 0.01 &&
        Math.abs(cfg.gap - p.gap) < 0.01
    );
    return pr?.id ?? null;
  }, [cfg]);

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
        const mrpRaw = v.compareAtPrice == null ? null : Number(v.compareAtPrice);
        const price = Number(v.price);
        const mrp = mrpRaw != null && mrpRaw > price ? mrpRaw : null;
        for (let i = 0; i < qty; i += 1) {
          out.push({
            key: `${v.id}-${i}`,
            variantId: v.id,
            productName: p.name,
            variantName: v.name,
            sku: v.sku,
            barcode: v.barcode ?? null,
            price,
            mrp,
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

  function removeRow(variantId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(variantId);
      return next;
    });
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
      dialog opens automatically (Auto Print) — the main tab is never disturbed. */
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
    // clone at 1:1 (preview transform is on .bc-sheet, which we reset via CSS);
    // the on-page run is parked offscreen, so clear that on the clone root
    const clone = sheets.cloneNode(true) as HTMLElement;
    clone.style.position = "static";
    clone.style.left = "";
    clone.style.top = "";
    clone.removeAttribute("aria-hidden");
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
    if (cfg.autoPrint) setTimeout(() => win.print(), 350);
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
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
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
      <PageHeader
        icon={Barcode}
        className="no-print"
        title="Print Labels"
        subtitle="Design numbered barcode labels — commercial sheet stocks, thermal rolls, or a custom size."
        actions={
          <>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void fetchAll()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => router.push("/admin/pos")}>
              Back to POS
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        {/* ============ LEFT — configuration column ============ */}
        <section className="no-print min-w-0 space-y-4">
          {/* --- Configuration (paper + source + auto print) --- */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-3 text-[14px] font-bold">Configuration</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bc-paper" className="text-[12px] font-semibold text-foreground/80">
                  Paper size:
                </Label>
                <select
                  id="bc-paper"
                  value={activePresetId ? `preset:${activePresetId}` : cfg.paper}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("preset:")) {
                      const pr = SHEET_PRESETS.find((x) => x.id === v.slice(7));
                      if (pr)
                        setCfg((c) => ({
                          ...c,
                          paper: pr.paper,
                          label: pr.label,
                          lw: pr.lw,
                          lh: pr.lh,
                          margin: pr.margin,
                          gap: pr.gap,
                        }));
                      return;
                    }
                    set("paper", v as PaperId);
                  }}
                  className="h-9 w-full rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                >
                  {/* Stocky-exact commercial sheet stocks first */}
                  <optgroup label="Commercial label sheets">
                    {SHEET_PRESETS.map((pr) => (
                      <option key={pr.id} value={`preset:${pr.id}`}>
                        {presetLabel(pr)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Papers & rolls">
                    {PAPERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bc-label" className="text-[12px] font-semibold text-foreground/80">
                  Label size:
                </Label>
                <select
                  id="bc-label"
                  value={cfg.label}
                  onChange={(e) => set("label", e.target.value as LabelId)}
                  className="h-9 w-full rounded-lg border border-border bg-card px-2 text-[13px] outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                >
                  {LABELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                {/* auto print — Stocky parity: the print dialog fires itself */}
                <label className="flex cursor-pointer items-center gap-2 pt-2 text-[13px] font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={cfg.autoPrint}
                    onChange={(e) => set("autoPrint", e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Auto Print
                  <span className="text-[11px] font-normal text-muted-foreground">
                    (dialog opens automatically)
                  </span>
                </label>
                {/* barcode content — 3 symbologies: linear, retail EAN, QR */}
                <div className="grid grid-cols-3 gap-1.5 pt-2">
                  {(
                    [
                      ["sku", "SKU · CODE128"],
                      ["ean13", "Number · EAN-13"],
                      ["qr", "QR · 2D code"],
                    ] as const
                  ).map(([val, lbl]) => (
                    <Button
                      key={val}
                      type="button"
                      size="sm"
                      variant={cfg.source === val ? "default" : "outline"}
                      className={`h-8 rounded-lg px-1 text-[10.5px] font-semibold ${cfg.source === val ? BRAND.solid : ""}`}
                      onClick={() => set("source", val)}
                    >
                      {lbl}
                    </Button>
                  ))}
                </div>
                {cfg.source === "ean13" ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg text-[11.5px]"
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
                      className="h-8 rounded-lg text-[11.5px]"
                      disabled={assigning || selected.size === 0}
                      onClick={() => void assignNumbers(true)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Regenerate
                    </Button>
                  </div>
                ) : (
                  <p className="pt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                    {cfg.source === "qr"
                      ? "QR labels scan from any phone camera — no EAN needed."
                      : "Prints the SKU as a CODE128 barcode — works with every USB scanner."}
                  </p>
                )}
              </div>
            </div>

            {/* custom sizes + margins */}
            {(cfg.paper === "custom" || cfg.label === "custom") && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 sm:grid-cols-4">
                {cfg.paper === "custom" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="bc-pw" className="text-[11px]">Paper W (mm)</Label>
                      <Input id="bc-pw" type="number" min={20} max={600} value={cfg.pw} onChange={(e) => set("pw", Number(e.target.value))} inputMode="numeric" className="h-8 rounded-lg" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="bc-ph" className="text-[11px]">Paper H (mm)</Label>
                      <Input id="bc-ph" type="number" min={20} max={900} value={cfg.ph} onChange={(e) => set("ph", Number(e.target.value))} inputMode="numeric" className="h-8 rounded-lg" />
                    </div>
                  </>
                )}
                {cfg.label === "custom" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="bc-lw" className="text-[11px]">Label W (mm)</Label>
                      <Input id="bc-lw" type="number" min={12} max={600} value={cfg.lw} onChange={(e) => set("lw", Number(e.target.value))} inputMode="numeric" className="h-8 rounded-lg" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="bc-lh" className="text-[11px]">Label H (mm)</Label>
                      <Input id="bc-lh" type="number" min={8} max={300} value={cfg.lh} onChange={(e) => set("lh", Number(e.target.value))} inputMode="numeric" className="h-8 rounded-lg" />
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="bc-margin" className="text-[11px]">Margin (mm)</Label>
                <Input id="bc-margin" type="number" min={0} max={15} value={cfg.margin} onChange={(e) => set("margin", Number(e.target.value))} inputMode="numeric" className="h-8 rounded-lg" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bc-gap" className="text-[11px]">Gap (mm)</Label>
                <Input id="bc-gap" type="number" min={0} max={10} value={cfg.gap} onChange={(e) => set("gap", Number(e.target.value))} inputMode="numeric" className="h-8 rounded-lg" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bc-copies" className="text-[11px]">Qty for all</Label>
                <Input id="bc-copies" type="number" min={1} max={100} value={cfg.copies} onChange={(e) => set("copies", Number(e.target.value))} inputMode="numeric" className="h-8 rounded-lg" />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" size="sm" className="h-8 w-full rounded-lg text-[11.5px]" onClick={() => setAllQty(Number(cfg.copies) || 1)}>
                  Apply to all
                </Button>
              </div>
            </div>
          </div>

          {/* --- Label design (templates + toggles + fine tuning) --- */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[14px] font-bold">Label design</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg border-primary/40 px-3 text-[11.5px] font-semibold text-primary hover:bg-accent"
                onClick={saveAsDefault}
              >
                Save as default
              </Button>
            </div>

            {/* visual template tiles */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {DESIGN_TEMPLATES.map((t) => {
                const active = Object.entries(t.patch).every(([k, v]) => cfg[k as keyof BcCfg] === v);
                return (
                  <button
                    key={t.id}
                    type="button"
                    title={t.name}
                    onClick={() => setCfg((c) => ({ ...c, ...t.patch }))}
                    className={`flex flex-col gap-1.5 rounded-xl border p-2 text-left transition ${
                      active
                        ? "border-primary bg-accent/60 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40 hover:bg-muted"
                    }`}
                  >
                    <TemplateThumb id={t.id} />
                    <span className={`line-clamp-2 text-[10px] font-semibold leading-tight ${active ? "text-primary" : "text-muted-foreground"}`}>
                      {t.short}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setAdvanced(true)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-2 text-muted-foreground transition hover:border-primary/40 hover:text-primary ${
                  advanced ? "border-primary/60 text-primary" : ""
                }`}
              >
                <Settings2 className="h-5 w-5" />
                <span className="text-[10px] font-semibold">Custom</span>
              </button>
            </div>

            {/* saved layouts — beyond Stocky: name and reuse whole designs */}
            <div className="mt-3 border-t border-border/60 pt-3">
              <div className="flex items-center gap-1.5">
                <Input
                  value={layoutName}
                  onChange={(e) => setLayoutName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveLayout();
                    }
                  }}
                  placeholder="Layout name — e.g. Jewellery tags"
                  className="h-8 flex-1 rounded-lg text-[12px]"
                  aria-label="New layout name"
                  maxLength={28}
                />
                <Button
                  type="button"
                  size="sm"
                  className={`h-8 shrink-0 rounded-lg px-3 text-[11.5px] font-semibold ${BRAND.solid}`}
                  onClick={saveLayout}
                >
                  Save layout
                </Button>
              </div>
              {layouts.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {layouts.map((l) => (
                    <span
                      key={l.id}
                      className={`inline-flex items-center overflow-hidden rounded-full border text-[11px] font-semibold transition ${
                        cfg === l.cfg
                          ? "border-primary bg-accent text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                      }`}
                    >
                      <button type="button" className="px-2.5 py-1" onClick={() => applyLayout(l.id)}>
                        {l.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete layout ${l.name}`}
                        className="border-l border-inherit px-1.5 py-1 text-muted-foreground/60 transition hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => deleteLayout(l.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* display toggles — Stocky's purple checkboxes */}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {(
                [
                  ["showName", "Display product name"],
                  ["showNumber", "Display barcode number"],
                  ["showPrice", "Display Price"],
                  ["showMrp", "Display MRP (strikethrough)"],
                  ["showVariant", "Display variant"],
                  ["showSku", "Display SKU text"],
                  ["borders", "Cut lines"],
                ] as const
              ).map(([key, text]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={cfg[key]}
                    onChange={(e) => set(key, e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  {text}
                </label>
              ))}
            </div>

            {/* fine tuning — Stocky's numeric inputs + selects */}
            <details open={advanced} className="mt-3 rounded-lg border border-border">
              <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                Fine tuning
              </summary>
              <div className="grid gap-3 border-t border-border/60 p-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="bc-bs" className="text-[11px]">Barcode height:</Label>
                  <Input id="bc-bs" type="number" min={0.5} max={1.6} step={0.05} value={cfg.barScale} onChange={(e) => set("barScale", Number(e.target.value))} inputMode="decimal" className="h-8 rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bc-fs" className="text-[11px]">Font size:</Label>
                  <Input id="bc-fs" type="number" min={0.7} max={1.5} step={0.05} value={cfg.fontScale} onChange={(e) => set("fontScale", Number(e.target.value))} inputMode="decimal" className="h-8 rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bc-bw" className="text-[11px]">Bar density:</Label>
                  <Input id="bc-bw" type="number" min={0.8} max={2.2} step={0.05} value={cfg.barWidth} onChange={(e) => set("barWidth", Number(e.target.value))} inputMode="decimal" className="h-8 rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bc-ns" className="text-[11px]">Barcode number size:</Label>
                  <Input id="bc-ns" type="number" min={0.8} max={1.6} step={0.05} value={cfg.numScale} onChange={(e) => set("numScale", Number(e.target.value))} inputMode="decimal" className="h-8 rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bc-fw" className="text-[11px]">Font weight:</Label>
                  <select
                    id="bc-fw"
                    value={cfg.fontWeight}
                    onChange={(e) => set("fontWeight", e.target.value as BcCfg["fontWeight"])}
                    className="h-8 w-full rounded-lg border border-border bg-card px-2 text-[12px] outline-none focus:border-primary/60"
                  >
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bc-ff" className="text-[11px]">Font family:</Label>
                  <select
                    id="bc-ff"
                    value={cfg.fontFamily}
                    onChange={(e) => set("fontFamily", e.target.value as BcCfg["fontFamily"])}
                    className="h-8 w-full rounded-lg border border-border bg-card px-2 text-[12px] outline-none focus:border-primary/60"
                  >
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                    <option value="monospace">Mono</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="bc-store" className="text-[11px]">Store name on label (optional)</Label>
                  <Input
                    id="bc-store"
                    value={cfg.storeName}
                    onChange={(e) => set("storeName", e.target.value)}
                    placeholder="e.g. STELLORA"
                    maxLength={24}
                    className="h-8 rounded-lg"
                  />
                </div>
              </div>
            </details>

            {/* selection actions + print CTA */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11.5px]" onClick={selectAllFiltered}>
                <CheckSquare className="h-3.5 w-3.5" /> Select all filtered ({totalLabelable})
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11.5px]" onClick={() => setSelected(new Set())}>
                <Square className="h-3.5 w-3.5" /> Clear
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-[11.5px]" onClick={() => setCfg(DEFAULT_CFG)}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset layout
              </Button>
            </div>
          </div>

          {/* --- Product search + picker (Stocky "Product Name" card) --- */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-3 text-[14px] font-bold">Product Name</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan / Search Product by Code Or Name"
                className="rounded-lg pl-9"
                aria-label="Filter label selection"
              />
            </div>

            <div className="stellora-scroll mt-3 max-h-72 overflow-y-auto rounded-lg border border-border/60">
              {loading && products === null ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-8 text-center">
                  <PackageOpen className="h-8 w-8 text-muted-foreground/70" />
                  <p className="text-[13px] text-muted-foreground">No products match the filter.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {filtered.map(({ p, vs }) => (
                    <li key={p.id} className="px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[13px] font-semibold">{p.name}</p>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {vs.length} variant{vs.length === 1 ? "" : "s"}
                        </span>
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
                                on
                                  ? "border-primary bg-accent text-primary"
                                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent/50"
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

        {/* ============ RIGHT — sticky live preview (Stocky) ============ */}
        <section ref={wrapRef} className="min-w-0">
          <div className="xl:sticky xl:top-6 space-y-4">
            {/* --- Selected products quantity table --- */}
            {selectedRows.length > 0 && (
              <div className="no-print rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                  <p className="text-[13px] font-bold">
                    Selected Products <span className="font-normal text-muted-foreground">({selectedRows.length})</span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-lg border-rose-200 px-2.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setSelected(new Set())}
                  >
                    Reset
                  </Button>
                </div>
                <div className="stellora-scroll max-h-56 overflow-y-auto">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-1.5 font-bold">Product Name</th>
                        <th className="px-4 py-1.5 font-bold">Code Product</th>
                        <th className="px-4 py-1.5 text-center font-bold">Quantity</th>
                        <th className="px-4 py-1.5 text-center font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {selectedRows.map((r) => (
                        <tr key={r.variantId}>
                          <td className="max-w-44 truncate px-4 py-1.5 font-medium">
                            {r.productName}
                            <span className="ml-1 text-[10.5px] text-muted-foreground">· {r.variantName}</span>
                          </td>
                          <td className="px-4 py-1.5 font-mono text-[11px] text-muted-foreground">{r.sku}</td>
                          <td className="px-2 py-1.5">
                            <div className="mx-auto flex w-fit items-center rounded-lg border border-border">
                              <button
                                type="button"
                                aria-label={`Decrease quantity of ${r.productName}`}
                                className="flex h-7 w-7 items-center justify-center rounded-l-lg text-muted-foreground transition hover:bg-muted"
                                onClick={() => setQty(r.variantId, r.qty - 1)}
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={r.qty}
                                onChange={(e) => setQty(r.variantId, Number(e.target.value))}
                                aria-label={`Print quantity for ${r.productName} ${r.variantName}`}
                                className="tnum w-10 border-0 bg-transparent text-center text-[11.5px] font-bold focus:outline-none"
                              />
                              <button
                                type="button"
                                aria-label={`Increase quantity of ${r.productName}`}
                                className="flex h-7 w-7 items-center justify-center rounded-r-lg text-muted-foreground transition hover:bg-muted"
                                onClick={() => setQty(r.variantId, r.qty + 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              aria-label={`Remove ${r.productName} ${r.variantName} from labels`}
                              className="rounded-md p-1 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                              onClick={() => removeRow(r.variantId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* warnings */}
            {overflow ? (
              <div className="no-print flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-700">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  The label ({labelW} × {labelH} mm) does not fit the printable area ({usableW.toFixed(1)} ×{" "}
                  {usableH.toFixed(1)} mm). Pick a bigger paper, smaller label, or reduce the margin.
                </p>
              </div>
            ) : null}
            {cfg.source === "ean13" && missingNumbers > 0 && !overflow ? (
              <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px]">
                <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                <p className="min-w-0 flex-1 text-amber-700">
                  {missingNumbers} selected variant{missingNumbers === 1 ? " has" : "s have"} no barcode number yet.
                </p>
                <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" disabled={assigning} onClick={() => void assignNumbers(false)}>
                  {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hash className="h-3.5 w-3.5" />} Assign now
                </Button>
              </div>
            ) : null}

            {/* --- Live preview on the dotted grid --- */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px] font-bold">Live preview</p>
                <div className="flex items-center gap-1" role="group" aria-label="Preview zoom">
                  {[1, 1.5, 2].map((z) => (
                    <button
                      key={z}
                      type="button"
                      aria-pressed={zoom === z}
                      onClick={() => setZoom(z)}
                      className={`tnum rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                        zoom === z
                          ? "border-primary bg-primary text-white"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                      }`}
                    >
                      {z * 100}%
                    </button>
                  ))}
                </div>
              </div>

              {labels.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
                  <Barcode className="h-9 w-9 text-muted-foreground/70" />
                  <p className="text-[13px] font-semibold text-muted-foreground">No labels selected</p>
                  <p className="text-[11px] text-muted-foreground">
                    Pick variants below — every selected SKU gets a printed, scannable label.
                  </p>
                </div>
              ) : (
                <>
                  {/* dotted paper mat (Stocky's preview grid) */}
                  <div
                    className="relative overflow-hidden rounded-xl border border-border p-4"
                    style={{
                      backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
                      backgroundSize: "14px 14px",
                      backgroundColor: "#f8fafc",
                    }}
                  >
                    <div className="flex items-center justify-center">
                      <div className="bc-frame" style={{ width: pageW * MM * scale, height: pageH * MM * scale }}>
                        <div
                          className="bc-sheet bg-white shadow-lg shadow-foreground/20"
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
                            {(sheetPages[0] ?? []).map((item) => (
                              <LabelBox key={item.key} item={item} cfg={cfg} labelW={labelW} labelH={labelH} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* size chip */}
                    <span className="tnum absolute bottom-3 left-3 rounded-md bg-card px-2 py-1 text-[10.5px] font-bold text-foreground/80 shadow-sm">
                      {labelW} × {labelH} mm · {(labelW / 25.4).toFixed(1)} × {(labelH / 25.4).toFixed(1)} in
                    </span>
                  </div>

                  {/* hidden full print sheets — cloned by printPopup */}
                  <div className="bc-sheets" aria-hidden style={{ position: "absolute", left: -10000, top: 0 }}>
                    {sheetPages.map((pageItems, pi) => (
                      <div key={pi}>
                        <div
                          className="bc-sheet bg-white"
                          style={{
                            width: `${pageW}mm`,
                            height: `${pageH}mm`,
                            padding: `${margin}mm`,
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
                    ))}
                  </div>

                  {/* print row */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11.5px] text-muted-foreground">
                      <span className="tnum font-bold text-foreground">{labels.length}</span> label{labels.length === 1 ? "" : "s"} ·{" "}
                      <span className="tnum">{cols}×{rows}</span> per sheet ·{" "}
                      <span className="tnum">{sheetPages.length}</span> sheet{sheetPages.length === 1 ? "" : "s"}
                      {labels.length >= MAX_LABELS ? " (capped)" : ""}
                    </p>
                    <Button
                      size="sm"
                      disabled={overflow}
                      onClick={printPopup}
                      className={`h-9 rounded-lg px-5 text-[13px] font-bold shadow-md shadow-primary/20 ${BRAND.solid}`}
                    >
                      <Printer className="h-4 w-4" /> Print labels
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                    Print at 100% scale, margins “None”, paper “{paper.name}”
                    {cfg.autoPrint ? " — the print dialog opens automatically." : " — then press Ctrl+P in the popup."}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
