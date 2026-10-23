"use client";

/**
 * Stellora Point of Sale — "Aurum" terminal (full redesign).
 *
 * A dark, jewellery-boutique grade register: warm charcoal canvas, champagne
 * gold accents, Playfair serif display numerals, and a three-zone kiosk layout.
 *   ┌────┬──────────────────────────────────────────────┬──────────────┐
 *   │rail│  topbar · categories · catalog grid          │  BILL panel  │
 *   └────┴──────────────────────────────────────────────┴──────────────┘
 * Mobile (<lg): Browse / Cart tabs + sticky charge button.
 *
 * Every wire payload (fetch paths, field names, storage keys, sound cues) is
 * identical to the previous build, so held bills, drafts and terminal ids keep
 * working across the upgrade.
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowUpDown,
  Banknote,
  Camera,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Copy,
  CreditCard,
  Delete,
  HandCoins,
  History,
  Home,
  IndianRupee,
  Keyboard,
  Landmark,
  Loader2,
  LockKeyhole,
  LockOpen,
  Maximize2,
  Minus,
  PackageOpen,
  Pause,
  Percent,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  ScanLine,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store,
  Tags,
  Ticket,
  Trash2,
  UserRound,
  UserRoundPlus,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";
import {
  getPosVolume,
  playPosSound,
  posSoundEnabled,
  setPosSoundEnabled,
  setPosVolume,
  testPosSound,
  unlockAudio,
} from "@/lib/pos-sound";
import { toast } from "@/components/ui/notify";
import { cn, formatDateTime, formatINR } from "@/lib/utils";

/* =============================== API shapes =============================== */

interface ApiVariant {
  id: string;
  name: string;
  sku: string;
  price: number | string;
  compareAtPrice: number | string | null;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
}

interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  images: { url: string; alt: string | null }[];
  variants: ApiVariant[];
  category: { name: string; slug: string } | null;
}

/** Optional per-line variant snapshot — powers the inline variant switcher. */
interface BillVariantOpt {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
}

interface BillLine {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  stock: number;
  /* Superset additions — older saved bills simply omit them. */
  image?: string | null;
  note?: string;
  variants?: BillVariantOpt[];
}

type PaymentMethod = "CASH" | "CARD" | "UPI" | "BANK" | "WALLET" | "CHEQUE" | "OTHER";

interface Tender {
  method: PaymentMethod;
  amount: number;
}

interface RegisterSession {
  id: string;
  terminalId: string;
  status: "OPEN" | "CLOSED";
  openedByName: string | null;
  openingBalance: number;
  openingNote: string | null;
  openedAt: string;
  countedBalance: number | null;
  expectedCash: number | null;
  variance: number | null;
  closedAt: string | null;
}

interface RegisterLive {
  expectedCash: number;
  cashIn: number;
  change: number;
  nonCash: number;
}

interface CustomerHit {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  points: number;
}

/* Today strip (IST business day, served by /api/admin/pos/live) */
interface TodayStats {
  orders: number;
  posOrders: number;
  revenue: number;
  cashSales: number;
  nonCashSales: number;
  itemsSold: number;
  hourly?: { hour: number; revenue: number; orders: number }[];
}

interface PosOrderItem {
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number | string;
  quantity: number;
  lineTotal: number | string;
}

interface PosOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number | string;
  discountTotal: number | string;
  shippingFee: number | string;
  grandTotal: number | string;
  items: PosOrderItem[];
  payments: { method: string; status: string; amount: number | string; providerRef: string | null }[];
  createdAt: string;
}

interface ReceiptData {
  order: PosOrder;
  pointsEarned: number;
  method: PaymentMethod;
  changeDue: number;
  taxPercent: number;
  paidAmount: number;
}

interface HeldBill {
  id: string;
  at: number;
  lines: BillLine[];
  discount: string;
  customerEmail: string;
  customerPhone: string;
  customerName: string | null;
  note: string;
  paymentMethod: PaymentMethod;
  taxPercent: string;
  shippingFee: string;
  couponCode: string;
  /* Superset additions — bills held by the previous build omit them. */
  discountMode?: string;
  customerPoints?: number | null;
}

/* Row shape served by GET /api/admin/orders-list (serializeOrderDetail). */
interface RecentOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  source?: string;
  subtotal: number | string;
  discountTotal: number | string;
  shippingFee: number | string;
  grandTotal: number | string;
  couponCode?: string | null;
  pointsEarned?: number;
  items: PosOrderItem[];
  payments: { method: string; status: string; amount: number | string; providerRef: string | null }[];
  createdAt: string;
  user: { name: string; email: string } | null;
}

/* ============================ POS UI constants ============================ */

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "CARD", label: "Card", icon: CreditCard },
  { value: "UPI", label: "UPI", icon: Smartphone },
  { value: "BANK", label: "Bank", icon: Landmark },
  { value: "WALLET", label: "Wallet", icon: Wallet },
  { value: "CHEQUE", label: "Cheque", icon: ReceiptText },
  { value: "OTHER", label: "Other", icon: CircleAlert },
];

const QUICK_NOTES = [100, 200, 500, 2000];

const NUMPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"] as const;

const SHORTCUT_LIST: { keys: string; label: string }[] = [
  { keys: "F2", label: "Focus the scan / search field" },
  { keys: "F4", label: "Charge the bill (open payment)" },
  { keys: "F7", label: "Hold the current bill" },
  { keys: "F8", label: "Open held bills" },
  { keys: "F9", label: "Refresh stock and the day summary" },
  { keys: "Enter", label: "In the scan field — bill the scanned code" },
  { keys: "?", label: "Show this shortcuts help" },
  { keys: "Esc", label: "Close the topmost dialog or drawer" },
  { keys: "Scanner", label: "USB scanners type anywhere — codes end with Enter" },
];

/* All admin XHRs go through the app's basePath so the terminal works BOTH when
   served from the storefront proxy (:3000/admin-console/…) and directly on the
   admin origin (:3001/admin-console/…) — Next only maps /admin-console/api/*. */
const api = (path: string) => `/admin-console${path}`;

const r2 = (n: number) => Math.round(n * 100) / 100;

const minPriceOf = (p: ApiProduct) =>
  p.variants.filter((v) => v.isActive).reduce((m, v) => Math.min(m, Number(v.price)), Infinity);

const stockOf = (p: ApiProduct) => p.variants.filter((v) => v.isActive).reduce((s, v) => s + v.stock, 0);

function methodLabel(m: string): string {
  const found = PAYMENT_METHODS.find((p) => p.value === m.toUpperCase());
  return found?.label ?? m;
}

/* Receipt helper — the order tax implied by the bill math
   (total − (subtotal − discount + shipping)); zero when percentages weren't used. */
function taxAmountOf(order: PosOrder): number {
  const sub = Number(order.subtotal);
  const disc = Number(order.discountTotal);
  const ship = Number(order.shippingFee);
  const total = Number(order.grandTotal);
  return Math.max(Math.round((total - (sub - disc + ship)) * 100) / 100, 0);
}

/* "POS:CASH:500.00+UPI:100.00|CHG:8.50" → change paid out, when present. */
function changeFromRef(providerRef: string | null | undefined): number {
  if (!providerRef || !providerRef.startsWith("POS:")) return 0;
  const changePart = providerRef.split("|")[1];
  return changePart?.startsWith("CHG:") ? Number(changePart.slice(4)) || 0 : 0;
}

/* Rebuild the same receipt the sale produced, from an orders-list row. */
function receiptFromOrder(o: RecentOrder): ReceiptData {
  const payments = o.payments ?? [];
  const grandTotal = Number(o.grandTotal) || 0;
  const paidRaw = payments.reduce((n, p) => n + (Number(p.amount) || 0), 0);
  const paidAmount = Math.min(paidRaw > 0 ? paidRaw : grandTotal, grandTotal);
  const taxAmt = taxAmountOf(o as unknown as PosOrder);
  const base = Math.max(Number(o.subtotal) - Number(o.discountTotal), 0);
  const taxPercent = taxAmt > 0 && base > 0 ? Math.round((taxAmt / base) * 10000) / 100 : 0;
  return {
    order: o as unknown as PosOrder,
    pointsEarned: Number(o.pointsEarned ?? 0),
    method: ((payments[0]?.method ?? o.paymentMethod ?? "CASH").toUpperCase()) as PaymentMethod,
    changeDue: changeFromRef(payments[0]?.providerRef),
    taxPercent,
    paidAmount,
  };
}

/* ========================= Aurum design tokens ========================= */

const AURUM = {
  gold: "#d9a441",
  goldSoft: "#e8bd68",
  goldDeep: "#b57e26",
  ink: "#0e0c09",
  panel: "#14110d",
  card: "#1a1610",
  cardHi: "#201a12",
  line: "#2b2418",
  lineHi: "#453a24",
  text: "#f2ecdf",
  muted: "#a19681",
  faint: "#6b6252",
};

/** Shared classes for the dark inputs across the terminal. */
const fieldCls =
  "w-full rounded-xl border border-[#2b2418] bg-[#100e0a] px-3.5 text-[14px] text-[#f2ecdf] placeholder:text-[#6b6252] outline-none transition focus:border-[#d9a441]/55 focus:ring-2 focus:ring-[#d9a441]/15";

/** Ghost icon button used in headers / rails. */
const ghostIcon =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#a19681] transition hover:bg-[#241e14] hover:text-[#f2ecdf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/30";

/** Small pill for labels. */
function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[#2b2418] bg-[#171310] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a19681]",
        className
      )}
    >
      {children}
    </span>
  );
}

export default function AdminPosPage() {
  const router = useRouter();

  /* ------------------------------- catalog ------------------------------- */
  const [products, setProducts] = useState<ApiProduct[] | null>(null);
  const [prodFailed, setProdFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const seqRef = useRef(0);
  const [categories, setCategories] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [catFilter, setCatFilter] = useState(""); // category slug
  const [inStockOnly, setInStockOnly] = useState(false);
  const [outOnly, setOutOnly] = useState(false);
  const [sortMode, setSortMode] = useState<"featured" | "price-asc" | "price-desc" | "stock">("featured");

  /* --------------------------------- bill --------------------------------- */
  const [bill, setBill] = useState<BillLine[]>([]);
  const billRef = useRef<BillLine[]>([]);
  useEffect(() => {
    billRef.current = bill;
  }, [bill]);
  const [discount, setDiscount] = useState("");
  const [discountMode, setDiscountMode] = useState<"flat" | "pct">("flat");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [customerEmail, setCustomerEmail] = useState("");
  /* Mobile-first shop: the phone number is the primary customer handle. */
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [customerPoints, setCustomerPoints] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  /* ---------------------- cash register (sessions) ------------------------ */
  const [registerSession, setRegisterSession] = useState<RegisterSession | null>(null);
  const [registerLive, setRegisterLive] = useState<RegisterLive | null>(null);
  const [regOpenOpen, setRegOpenOpen] = useState(false);
  const [regCloseOpen, setRegCloseOpen] = useState(false);
  const [regOpeningBalance, setRegOpeningBalance] = useState("");
  const [regOpeningNote, setRegOpeningNote] = useState("");
  const [regCounted, setRegCounted] = useState("");
  const [regClosingNote, setRegClosingNote] = useState("");
  const [regBusy, setRegBusy] = useState(false);

  /* --------------------------- payment checkout --------------------------- */
  const [payOpen, setPayOpen] = useState(false);
  const [tenders, setTenders] = useState<Tender[]>([{ method: "CASH", amount: 0 }]);
  const [saleNote, setSaleNote] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [emailReceipt, setEmailReceipt] = useState(false);
  const [cashBuf, setCashBuf] = useState("");

  /* --------------------------- customer quick pick ------------------------- */
  const [custOpen, setCustOpen] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [custHits, setCustHits] = useState<CustomerHit[] | null>(null);
  const [custCreateOpen, setCustCreateOpen] = useState(false);
  const [custNewName, setCustNewName] = useState("");
  const [custNewPhone, setCustNewPhone] = useState("");
  const [custNewEmail, setCustNewEmail] = useState("");
  const [custNewBusy, setCustNewBusy] = useState(false);

  /* ------------------------------ live feed ------------------------------- */
  const [today, setToday] = useState<TodayStats | null>(null);

  /* ------------------------------- overlays ------------------------------- */
  const [variantPickerId, setVariantPickerId] = useState<string | null>(null);
  /* Derived from the live products list so open-dialog stock stays current. */
  const variantPicker = products?.find((p) => p.id === variantPickerId) ?? null;
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptIsReprint, setReceiptIsReprint] = useState(false);
  const [receiptFooter, setReceiptFooter] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [heldOpen, setHeldOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [recentBusy, setRecentBusy] = useState(false);
  const [recentErr, setRecentErr] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [volOpen, setVolOpen] = useState(false);

  /* ----------------- scanner + terminal + sounds + drafts ----------------- */
  const [terminalId, setTerminalId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [scanFlash, setScanFlash] = useState<"ok" | "err" | null>(null);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [camOpen, setCamOpen] = useState(false);
  const [camSupported, setCamSupported] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(0.9);
  const [mobileTab, setMobileTab] = useState<"browse" | "cart">("browse");
  const [noteEdit, setNoteEdit] = useState<{ variantId: string; draft: string } | null>(null);
  const scanRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camTimerRef = useRef<number | null>(null);
  const scanSeq = useRef(0);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  /* ----------------------------- data loading ----------------------------- */

  const fetchProducts = useCallback(async (targetPage: number, q: string, categoryId: string) => {
    const seq = ++seqRef.current;
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage) });
      if (q.trim()) params.set("q", q.trim());
      if (categoryId) params.set("category", categoryId); // category slug
      const res = await fetch(`${api("/api/products")}?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (seq !== seqRef.current) return; // a newer request superseded this one
      if (json.ok) {
        const d = json.data as { products: ApiProduct[]; total: number; page: number; pages: number };
        setProducts(d.products);
        setPage(d.page);
        setPages(d.pages);
        setTotal(d.total);
        setProdFailed(false);
      } else {
        setProducts([]);
        setProdFailed(true);
        toast.error(json.error?.message ?? "Could not load products");
      }
    } catch {
      if (seq === seqRef.current) {
        setProducts([]);
        setProdFailed(true);
        toast.error("Network error while loading products");
      }
    } finally {
      if (seq === seqRef.current) setRefreshing(false);
    }
  }, []);

  /* Debounced search (250ms) — also covers the initial load with query "" */
  useEffect(() => {
    const t = setTimeout(() => {
      void fetchProducts(1, query, catFilter);
    }, 250);
    return () => clearTimeout(t);
  }, [query, catFilter, fetchProducts]);

  /* Category chip row */
  useEffect(() => {
    fetch(`${api("/api/admin/categories")}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) =>
        setCategories(
          j.ok
            ? j.data.map((c: { id: string; slug: string; name: string }) => ({
                id: c.id,
                slug: c.slug,
                name: c.name,
              }))
            : []
        )
      )
      .catch(() => {});
  }, []);

  /* Receipt footer setting (optional, may be empty) */
  useEffect(() => {
    let alive = true;
    fetch(`${api("/api/admin/settings")}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.ok) return;
        const found = (j.data as { key: string; value: string }[]).find(
          (s) => s.key === "pos_receipt_footer"
        );
        setReceiptFooter(found?.value ?? "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /* Signed-in cashier name for the receipt's "Seller" line. */
  useEffect(() => {
    fetch(`${api("/api/auth/me")}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const u = j?.data?.user ?? j?.data ?? null;
        if (u?.name) setSellerName(String(u.name));
      })
      .catch(() => {});
  }, []);

  /* Terminal + bill restore. sessionStorage is per-window/tab, so every
     cashier window gets its own isolated bill — multiple windows can bill
     side by side without overwriting each other. Key names and JSON shapes
     are unchanged from the previous build, so existing drafts survive. */
  useEffect(() => {
    try {
      let tid = sessionStorage.getItem("pos_terminal");
      if (!tid) {
        tid = Math.random().toString(36).slice(2, 6).toUpperCase();
        sessionStorage.setItem("pos_terminal", tid);
      }
      setTerminalId(tid);
      const saved = sessionStorage.getItem(`pos_bill_${tid}`);
      if (saved) {
        const p = JSON.parse(saved);
        if (Array.isArray(p.lines) && p.lines.length > 0) {
          setBill(p.lines as BillLine[]);
          setDiscount(typeof p.discount === "string" ? p.discount : "");
          setCustomerEmail(typeof p.customerEmail === "string" ? p.customerEmail : "");
          setCustomerPhone(typeof p.customerPhone === "string" ? p.customerPhone : "");
          setNote(typeof p.note === "string" ? p.note : "");
          if (typeof p.paymentMethod === "string") setPaymentMethod(p.paymentMethod as PaymentMethod);
          if (typeof p.taxPercent === "string") setTaxPercent(p.taxPercent);
          if (typeof p.shippingFee === "string") setShippingFee(p.shippingFee);
          if (typeof p.couponCode === "string") setCouponCode(p.couponCode);
          if (p.customerName) setCustomerName(p.customerName);
        }
        if (p.discountMode === "pct") setDiscountMode("pct");
        if (typeof p.customerPoints === "number") setCustomerPoints(p.customerPoints);
      }
      const savedHeld = sessionStorage.getItem(`pos_held_${tid}`);
      if (savedHeld) {
        const h = JSON.parse(savedHeld);
        if (Array.isArray(h)) setHeld(h as HeldBill[]);
      }
      setSoundOn(posSoundEnabled());
      setVolume(getPosVolume());
    } catch {
      /* storage unavailable (privacy mode) — in-memory bill still works */
    }
    setHydrated(true);
  }, []);

  /* Arm the Web Audio context on the first real gesture (click/keydown) so
     beeps always fire — before this, browsers keep the context suspended. */
  useEffect(() => {
    unlockAudio();
  }, []);

  /* Persist the working bill so a refresh or accidental close never loses it. */
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(
        `pos_bill_${terminalId}`,
        JSON.stringify({
          lines: bill,
          discount,
          discountMode,
          customerEmail,
          customerPhone,
          customerName,
          customerPoints,
          note,
          paymentMethod,
          taxPercent,
          shippingFee,
          couponCode,
        })
      );
    } catch {}
  }, [
    bill,
    discount,
    discountMode,
    customerEmail,
    customerPhone,
    customerName,
    customerPoints,
    note,
    paymentMethod,
    taxPercent,
    shippingFee,
    couponCode,
    hydrated,
    terminalId,
  ]);

  /* Cash register session — restore on load, refresh after each sale. */
  const refreshRegister = useCallback(async (tid: string) => {
    if (!tid) return;
    try {
      const res = await fetch(`${api("/api/admin/pos/register/current")}?terminalId=${encodeURIComponent(tid)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.ok) {
        setRegisterSession(json.data.session as RegisterSession | null);
        setRegisterLive(json.data.live ? (json.data.live as RegisterLive) : null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (hydrated && terminalId) void refreshRegister(terminalId);
  }, [hydrated, terminalId, refreshRegister]);

  /* ---------------------- live feed — real-time updates ----------------------
     Polls /admin/pos/live every few seconds while the tab is visible. One
     call carries: changed variant stocks (from StockMovement), today's
     business strip, and the live cash-register state. */
  const lastFeedAtRef = useRef(new Date(Date.now() - 60_000).toISOString());
  const applyLiveFeed = useCallback(async () => {
    if (!terminalId) return;
    try {
      const res = await fetch(
        `${api("/api/admin/pos/live")}?terminalId=${encodeURIComponent(terminalId)}&since=${encodeURIComponent(lastFeedAtRef.current)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json.ok) return;
      lastFeedAtRef.current = typeof json.data.at === "string" ? json.data.at : lastFeedAtRef.current;
      if (json.data.today) setToday(json.data.today as TodayStats);
      if (json.data.session !== undefined) {
        setRegisterSession((json.data.session ?? null) as RegisterSession | null);
        setRegisterLive((json.data.live ?? null) as RegisterLive | null);
      }
      const stocks = (json.data.stocks ?? []) as { variantId: string; stock: number }[];
      if (stocks.length === 0) return;
      const stockMap = new Map(stocks.map((s) => [s.variantId, s.stock]));
      /* catalog tiles follow silently */
      setProducts((prev) =>
        prev
          ? prev.map((p) => {
              let changed = false;
              const variants = p.variants.map((v) => {
                const ns = stockMap.get(v.id);
                if (ns !== undefined && ns !== v.stock) {
                  changed = true;
                  return { ...v, stock: ns };
                }
                return v;
              });
              return changed ? { ...p, variants } : p;
            })
          : prev
      );
      /* bill safety — a counter/website sale can shrink stock under an open
         line; clamp it instead of failing at charge time */
      const billNow = billRef.current;
      let billTouched = false;
      const nextBill: BillLine[] = [];
      for (const l of billNow) {
        const ns = stockMap.get(l.variantId);
        if (ns === undefined) {
          nextBill.push(l);
          continue;
        }
        if (ns <= 0) {
          playPosSound("error");
          toast.warning(`${l.productName} (${l.variantName}) is out of stock — removed from the bill`, {
            action: { label: "OK", onClick: () => {} },
          });
          billTouched = true;
          continue;
        }
        if (ns < l.quantity) {
          playPosSound("error");
          toast.warning(`${l.productName}: only ${ns} left — quantity adjusted`);
          nextBill.push({ ...l, quantity: ns, stock: ns });
          billTouched = true;
          continue;
        }
        if (ns !== l.stock) {
          nextBill.push({ ...l, stock: ns });
          billTouched = true;
          continue;
        }
        nextBill.push(l);
      }
      if (billTouched) setBill(nextBill);
    } catch {
      /* transient network hiccup — next tick retries */
    }
  }, [terminalId]);

  useEffect(() => {
    if (!hydrated || !terminalId) return;
    let alive = true;
    const tick = () => {
      if (alive && document.visibilityState === "visible") void applyLiveFeed();
    };
    tick();
    const iv = window.setInterval(tick, 6000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [hydrated, terminalId, applyLiveFeed]);

  /* Customer quick-search for the bill picker (debounced) */
  useEffect(() => {
    if (!custOpen) return;
    const t = setTimeout(() => {
      fetch(`${api("/api/admin/pos/customers")}?q=${encodeURIComponent(custQuery)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setCustHits(j.ok ? (j.data as CustomerHit[]) : []))
        .catch(() => setCustHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [custQuery, custOpen]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(`pos_held_${terminalId}`, JSON.stringify(held));
    } catch {}
  }, [held, hydrated, terminalId]);

  /* Recent sales (orders-list) — fetched when the drawer opens. */
  const fetchRecent = useCallback(async () => {
    setRecentBusy(true);
    setRecentErr(false);
    try {
      const res = await fetch(`${api("/api/admin/orders-list")}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        const rows = (json.data as RecentOrder[]).filter((o) => o.status !== "CANCELLED").slice(0, 8);
        setRecentOrders(rows);
      } else {
        setRecentErr(true);
      }
    } catch {
      setRecentErr(true);
    } finally {
      setRecentBusy(false);
    }
  }, []);

  useEffect(() => {
    if (recentOpen) void fetchRecent();
  }, [recentOpen, fetchRecent]);

  /* Invoice QR for the thermal receipt. */
  useEffect(() => {
    if (!receipt) return; // stale QR is hidden with the dialog itself
    const payload = [
      `REF:${receipt.order.orderNumber}`,
      `TOTAL:${receipt.order.grandTotal}`,
      `PAID:${receipt.paidAmount}`,
    ].join("|");
    QRCode.toDataURL(payload, { margin: 1, width: 220, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(""));
  }, [receipt]);

  /* ------------------------------ bill math ------------------------------ */

  const subtotal = useMemo(
    () => r2(bill.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)),
    [bill]
  );
  const discountRaw = Math.max(Number(discount) || 0, 0);
  const billDiscount =
    discountMode === "pct"
      ? r2((Math.min(discountRaw, 100) / 100) * subtotal)
      : r2(discountRaw);
  const couponDiscount = appliedCoupon ? Math.min(appliedCoupon.discount, subtotal) : 0;
  const appliedDiscount = Math.min(billDiscount + couponDiscount, subtotal);
  const discountInvalid = billDiscount + couponDiscount > subtotal;
  const payableSubtotal = Math.max(subtotal - appliedDiscount, 0);
  const taxNum = Math.max(Math.min(Number(taxPercent) || 0, 100), 0);
  const taxTotal = Math.round(payableSubtotal * taxNum) / 100;
  const shippingNum = Math.max(Number(shippingFee) || 0, 0);
  const grandTotal = Math.max(Math.round((payableSubtotal + taxTotal + shippingNum) * 100) / 100, 0);
  const billCount = bill.reduce((n, l) => n + l.quantity, 0);

  /* Catalog filtering + sorting (client-side, over the current page). */
  const visibleProducts = useMemo(() => {
    if (!products) return null;
    const list = products.filter((p) => {
      const stock = stockOf(p);
      if (inStockOnly && stock <= 0) return false;
      if (outOnly && stock > 0) return false;
      return true;
    });
    if (sortMode === "price-asc") list.sort((a, b) => minPriceOf(a) - minPriceOf(b));
    else if (sortMode === "price-desc") list.sort((a, b) => minPriceOf(b) - minPriceOf(a));
    else if (sortMode === "stock") list.sort((a, b) => stockOf(b) - stockOf(a));
    return list;
  }, [products, inStockOnly, outOnly, sortMode]);

  /* ------------------------------ bill logic ------------------------------ */

  function editLinePrice(variantId: string, price: number) {
    const line = bill.find((l) => l.variantId === variantId);
    if (!line) return;
    if (!Number.isFinite(price) || price < 0) return;
    const clamped = Math.min(price, 999999);
    setBill(bill.map((l) => (l.variantId === variantId ? { ...l, unitPrice: clamped } : l)));
  }

  function setLineNote(variantId: string, text: string) {
    const clean = text.trim().slice(0, 140);
    setBill(bill.map((l) => (l.variantId === variantId ? { ...l, note: clean || undefined } : l)));
  }

  /* Inline variant switch on a billed line (size / color swapped at counter). */
  function swapVariant(currentVariantId: string, opt: BillVariantOpt) {
    if (bill.some((l) => l.variantId === opt.id)) {
      toast.info("That variant is already on the bill");
      return;
    }
    if (opt.stock <= 0) {
      playPosSound("error");
      toast.error("That variant is out of stock");
      return;
    }
    setBill((prev) =>
      prev.map((l) => {
        if (l.variantId !== currentVariantId) return l;
        return {
          ...l,
          variantId: opt.id,
          variantName: opt.name,
          sku: opt.sku,
          unitPrice: opt.price,
          stock: opt.stock,
          quantity: Math.min(l.quantity, opt.stock),
        };
      })
    );
    playPosSound("click");
  }

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code || couponBusy || bill.length === 0) return;
    setCouponBusy(true);
    try {
      const res = await fetch(`${api("/api/admin/pos/coupon")}?code=${encodeURIComponent(code)}&subtotal=${subtotal}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.ok && json.data?.valid) {
        setAppliedCoupon({ code: json.data.code, discount: Number(json.data.discount) });
        setCouponCode(json.data.code);
        toast.success(`Coupon ${json.data.code} applied — saves ${formatINR(Number(json.data.discount))}`);
        playPosSound("click");
      } else {
        setAppliedCoupon(null);
        toast.error(json.data?.message ?? json.error?.message ?? "Coupon is not valid");
        playPosSound("error");
      }
    } catch {
      toast.error("Network error while validating the coupon");
    } finally {
      setCouponBusy(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
  }

  function addVariant(product: ApiProduct, v: ApiVariant) {
    if (!v.isActive || v.stock <= 0) {
      playPosSound("error");
      toast.error(`${product.name} (${v.name}) is out of stock`);
      return;
    }
    const existing = bill.find((l) => l.variantId === v.id);
    if (existing) {
      if (existing.quantity + 1 > v.stock) {
        playPosSound("error");
        toast.error(`Only ${v.stock} in stock`);
        return;
      }
      playPosSound("add");
      setBill(bill.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l)));
      return;
    }
    playPosSound("add");
    const active = product.variants.filter((x) => x.isActive);
    setBill([
      ...bill,
      {
        variantId: v.id,
        productName: product.name,
        variantName: v.name,
        sku: v.sku,
        unitPrice: Number(v.price),
        quantity: 1,
        stock: v.stock,
        image: product.images[0]?.url ?? null,
        variants:
          active.length > 1
            ? active.map((x) => ({ id: x.id, name: x.name, sku: x.sku, price: Number(x.price), stock: x.stock }))
            : undefined,
      },
    ]);
  }

  function changeQty(variantId: string, delta: number) {
    const line = bill.find((l) => l.variantId === variantId);
    if (!line) return;
    const next = line.quantity + delta;
    if (next < 1) return;
    if (next > line.stock) {
      playPosSound("error");
      toast.error(`Only ${line.stock} in stock`);
      return;
    }
    setBill(bill.map((l) => (l.variantId === variantId ? { ...l, quantity: next } : l)));
  }

  function handleProductClick(p: ApiProduct) {
    const active = p.variants.filter((v) => v.isActive);
    if (active.length === 1) {
      addVariant(p, active[0]);
    } else if (active.length === 0) {
      playPosSound("error");
      toast.error(`${p.name} is out of stock`);
    } else {
      playPosSound("click");
      setVariantPickerId(p.id);
    }
  }

  /* ------------------------------ barcode scanning ------------------------------ */

  async function handleScan(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;
    // Debounce identical codes (cameras hold the barcode in frame; scanners
    // can double-fire) so one physical scan adds exactly one unit.
    const last = lastScanRef.current;
    if (last && last.code === code && Date.now() - last.at < 1200) return;
    lastScanRef.current = { code, at: Date.now() };

    const seq = ++scanSeq.current;
    try {
      const res = await fetch(`${api("/api/admin/pos/lookup")}?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (seq !== scanSeq.current) return;
      if (json.ok) {
        const product = json.data.product as ApiProduct;
        const variant = json.data.variant as ApiVariant;
        playPosSound("scan");
        addVariant(product, variant);
        setScanFlash("ok");
        setTimeout(() => setScanFlash(null), 600);
        toast.success(`${product.name} — ${variant.name} added`);
      } else {
        playPosSound("error");
        setScanFlash("err");
        setTimeout(() => setScanFlash(null), 600);
        toast.error(json.error?.message ?? `No product found for "${code}"`);
      }
    } catch {
      playPosSound("error");
      setScanFlash("err");
      setTimeout(() => setScanFlash(null), 600);
      toast.error("Network error while looking up the code");
    }
  }
  const handleScanRef = useRef(handleScan);
  useEffect(() => {
    handleScanRef.current = handleScan;
  });

  /* ------------------------------ drafts / hold ------------------------------ */

  function holdBill() {
    if (bill.length === 0) return;
    const h: HeldBill = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      lines: bill,
      discount,
      customerEmail,
      customerPhone,
      customerName,
      note,
      paymentMethod,
      taxPercent,
      shippingFee,
      couponCode,
      discountMode,
      customerPoints,
    };
    setHeld([h, ...held].slice(0, 12));
    playPosSound("click");
    resetBill();
    toast.success("Bill held — ready for the next customer");
  }

  function resumeBill(h: HeldBill) {
    setBill(h.lines);
    setDiscount(h.discount);
    setCustomerEmail(h.customerEmail);
    setCustomerPhone(h.customerPhone ?? "");
    setNote(h.note);
    setPaymentMethod(h.paymentMethod);
    setTaxPercent(h.taxPercent ?? "");
    setShippingFee(h.shippingFee ?? "");
    setAppliedCoupon(null);
    setCouponCode(h.couponCode ?? "");
    setCustomerName(h.customerName ?? null);
    setDiscountMode(h.discountMode === "pct" ? "pct" : "flat");
    setCustomerPoints(typeof h.customerPoints === "number" ? h.customerPoints : null);
    setHeld(held.filter((x) => x.id !== h.id));
    playPosSound("click");
    setHeldOpen(false);
    toast.success("Held bill restored");
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setPosSoundEnabled(next);
    if (next) playPosSound("test");
  }

  function changeVolume(v: number) {
    setVolume(v);
    setPosVolume(v);
  }

  function resetBill() {
    setBill([]);
    setDiscount("");
    setDiscountMode("flat");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerName(null);
    setCustomerPoints(null);
    setNote("");
    setTaxPercent("");
    setShippingFee("");
    setAppliedCoupon(null);
    setCouponCode("");
    setNoteEdit(null);
  }

  function clearBill() {
    if (bill.length === 0) return;
    playPosSound("remove");
    resetBill();
    toast.info("Cart cleared");
  }

  /* --------------------------- discount helpers --------------------------- */

  function switchDiscountMode(mode: "flat" | "pct") {
    if (mode === discountMode) return;
    const cur = Math.max(Number(discount) || 0, 0);
    if (mode === "pct") {
      const pct = subtotal > 0 ? Math.round((cur / subtotal) * 1000) / 10 : 0;
      setDiscount(String(Math.min(pct, 100)));
    } else {
      const flat = (Math.min(cur, 100) / 100) * subtotal;
      setDiscount(String(r2(flat)));
    }
    setDiscountMode(mode);
  }

  /* ------------------------------ cash register ------------------------------ */

  async function openRegister() {
    if (regBusy) return;
    setRegBusy(true);
    try {
      const res = await fetch(`${api("/api/admin/pos/register/open")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terminalId,
          openingBalance: Number(regOpeningBalance) || 0,
          note: regOpeningNote.trim(),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success("Register opened — good selling!");
        playPosSound("success");
        setRegOpenOpen(false);
        setRegOpeningBalance("");
        setRegOpeningNote("");
        await refreshRegister(terminalId);
      } else {
        toast.error(json.error?.message ?? "Could not open the register");
      }
    } catch {
      toast.error("Network error — register not opened");
    } finally {
      setRegBusy(false);
    }
  }

  async function closeRegister() {
    if (regBusy) return;
    setRegBusy(true);
    try {
      const res = await fetch(`${api("/api/admin/pos/register/close")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terminalId,
          countedBalance: Number(regCounted) || 0,
          note: regClosingNote.trim(),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        const s = json.data.summary as { expectedCash: number; counted: number; variance: number };
        const v = s.variance;
        toast.success(
          v === 0
            ? "Register closed — drawer matches exactly. Perfect day!"
            : `Register closed — variance ${v > 0 ? "+" : ""}${formatINR(v)} vs expected ${formatINR(s.expectedCash)}`
        );
        playPosSound("success");
        setRegCloseOpen(false);
        setRegCounted("");
        setRegClosingNote("");
        await refreshRegister(terminalId);
      } else {
        toast.error(json.error?.message ?? "Could not close the register");
      }
    } catch {
      toast.error("Network error — register not closed");
    } finally {
      setRegBusy(false);
    }
  }

  /* ------------------------------- checkout ------------------------------- */

  async function charge(withTenders: Tender[]) {
    if (busy) return;
    if (bill.length === 0) {
      toast.error("Bill is empty — add products first");
      return;
    }
    if (discountInvalid) {
      toast.error("Discount cannot exceed the subtotal");
      return;
    }
    if (grandTotal <= 0) {
      toast.error("Bill total must be greater than zero");
      return;
    }
    if (emailReceipt && !customerEmail.trim()) {
      toast.error("Email receipt needs a customer email — add one or untick the box");
      return;
    }
    const cleaned = withTenders
      .map((t) => ({ method: t.method, amount: Math.round(Number(t.amount) * 100) / 100 }))
      .filter((t) => t.amount > 0);
    const tenderSum = Math.round(cleaned.reduce((n, t) => n + t.amount, 0) * 100) / 100;
    if (cleaned.length === 0) {
      toast.error("Enter the amounts being paid");
      return;
    }
    if (tenderSum + 0.011 < grandTotal) {
      toast.error(`Tenders add up to ${formatINR(tenderSum)} but the total is ${formatINR(grandTotal)}`);
      return;
    }
    setBusy(true);
    try {
      /* Line notes ride along in the single order note the backend accepts. */
      const lineNotes = bill
        .filter((l) => l.note && l.note.trim())
        .map((l) => `${l.productName}: ${l.note!.trim()}`);
      const mergedNote = [note.trim(), saleNote.trim(), ...lineNotes].filter(Boolean).join(" · ");
      const res = await fetch(`${api("/api/admin/pos/orders")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: bill.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          payments: cleaned,
          ...(billDiscount > 0 ? { discountAmount: billDiscount } : {}),
          ...(taxNum > 0 ? { taxPercent: taxNum } : {}),
          ...(shippingNum > 0 ? { shippingFee: shippingNum } : {}),
          ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
          ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
          ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
          ...(mergedNote ? { note: mergedNote.slice(0, 300) } : {}),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        const order = json.data.order as PosOrder;
        const pointsEarned = Number(json.data.pointsEarned ?? 0);
        const changeDue = Number(json.data.changeDue ?? 0);
        playPosSound("success");
        toast.success(
          changeDue > 0
            ? `Order ${order.orderNumber} billed — give ${formatINR(changeDue)} change`
            : `Order ${order.orderNumber} billed — ${formatINR(order.grandTotal)}`
        );
        setReceipt({
          order,
          pointsEarned,
          method: cleaned[0].method,
          changeDue,
          taxPercent: taxNum,
          paidAmount: Math.min(tenderSum, grandTotal),
        });
        setReceiptIsReprint(false);
        setPayOpen(false);
        setPayNote("");
        setSaleNote("");
        setEmailReceipt(false);
        setCashBuf("");
        resetBill();
        void fetchProducts(page, query, catFilter);
        void refreshRegister(terminalId);
      } else {
        playPosSound("error");
        toast.error(json.error?.message ?? "Could not complete the sale");
      }
    } catch {
      playPosSound("error");
      toast.error("Network error — sale was not completed");
    } finally {
      setBusy(false);
    }
  }

  /* Payment dialog helpers */

  function openPaymentDialog() {
    if (!registerSession) {
      toast.error("The register is closed — open it before taking payments");
      setRegOpenOpen(true);
      return;
    }
    if (bill.length === 0) {
      toast.error("Bill is empty — add products first");
      return;
    }
    if (discountInvalid) {
      toast.error("Discount cannot exceed the subtotal");
      return;
    }
    if (grandTotal <= 0) {
      toast.error("Bill total must be greater than zero");
      return;
    }
    setTenders([{ method: paymentMethod, amount: grandTotal }]);
    setCashBuf(grandTotal ? String(grandTotal) : "");
    setSaleNote(note);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    playPosSound("click");
    setPayOpen(true);
  }

  const tenderSum = r2(tenders.reduce((n, t) => n + (Number(t.amount) || 0), 0));
  const balanceDue = r2(Math.max(grandTotal - tenderSum, 0));
  const changeForCustomer = r2(Math.max(tenderSum - grandTotal, 0));

  function updateTender(idx: number, patch: Partial<Tender>) {
    setTenders((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function addTender() {
    if (tenders.length >= 4) return;
    setTenders((prev) => [
      ...prev,
      { method: "CASH", amount: r2(Math.max(grandTotal - prev.reduce((n, t) => n + (Number(t.amount) || 0), 0), 0)) },
    ]);
    playPosSound("click");
  }

  function removeTender(idx: number) {
    if (tenders.length === 1) return;
    setTenders((prev) => prev.filter((_, i) => i !== idx));
  }

  function setTenderExact(idx: number) {
    updateTender(idx, { amount: grandTotal });
    if (idx === 0) setCashBuf(String(grandTotal));
  }

  /* Numpad entry edits the amount as a plain rupee string (00 = two zeros). */
  function numpadPress(key: (typeof NUMPAD_KEYS)[number]) {
    let buf = cashBuf;
    if (key === "back") {
      buf = buf.slice(0, -1);
    } else if (buf.length >= 9) {
      return;
    } else if (buf === "0") {
      buf = key === "00" ? "0" : key;
    } else {
      buf += key;
    }
    setCashBuf(buf);
    const num = Number(buf);
    updateTender(0, { amount: Number.isFinite(num) && num > 0 ? num : 0 });
  }

  function setTenderFromInput(idx: number, raw: string) {
    const num = Number(raw);
    updateTender(idx, { amount: Number.isFinite(num) && num > 0 ? num : 0 });
    if (idx === 0) setCashBuf(raw.replace(/[^\d.]/g, ""));
  }

  /* New customer at the counter — just a name and mobile. Backend creates the
     account (random unusable password) and returns the picker-shaped hit. */
  async function quickCreateCustomer() {
    if (custNewBusy) return;
    const name = custNewName.trim();
    const phone = custNewPhone.replace(/\D/g, "");
    if (name.length < 2) {
      toast.error("Enter the customer's name");
      return;
    }
    if (phone.length !== 10) {
      toast.error("Enter a 10-digit mobile number");
      return;
    }
    setCustNewBusy(true);
    try {
      const res = await fetch(`${api("/api/admin/pos/customers")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          ...(custNewEmail.trim() ? { email: custNewEmail.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        const c = json.data.customer as CustomerHit;
        setCustomerEmail(c.email ?? "");
        setCustomerPhone(c.phone ?? "");
        setCustomerName(c.name);
        setCustomerPoints(Number(c.points ?? 0));
        setCustCreateOpen(false);
        setCustOpen(false);
        setCustNewName("");
        setCustNewPhone("");
        setCustNewEmail("");
        playPosSound("success");
        toast.success(`${c.name} added — the sale attaches to this number`);
      } else {
        toast.error(json.error?.message ?? "Could not add the customer");
      }
    } catch {
      toast.error("Network error — could not add the customer");
    } finally {
      setCustNewBusy(false);
    }
  }

  function openCustPicker() {
    playPosSound("click");
    setCustQuery("");
    setCustHits(null);
    setCustOpen(true);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        toast.error("Fullscreen is blocked by the browser");
      });
    }
  }

  /* USB barcode scanners are keyboard-wedge devices: they type the code and
     press Enter. Capture those keystrokes even when no input is focused. */
  useEffect(() => {
    let buf = "";
    let last = 0;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      ) {
        return; // normal typing in fields — the scan input has its own handler
      }
      const now = Date.now();
      if (now - last > 150) buf = "";
      last = now;
      if (e.key === "Enter") {
        const code = buf;
        buf = "";
        if (code.trim().length >= 4) void handleScanRef.current(code.trim());
        return;
      }
      if (e.key.length === 1) buf += e.key;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Keyboard shortcuts: F2 search, F4 pay, F7 hold, F8 held bills, F9 refresh,
     "?" help. Refs keep the listener stable across renders. */
  const kbActionsRef = useRef({
    focusSearch: () => {},
    pay: () => {},
    hold: () => {},
    held: () => {},
    refresh: () => {},
    shortcuts: () => {},
  });
  useEffect(() => {
    kbActionsRef.current = {
      focusSearch: () => scanRef.current?.focus(),
      pay: () => openPaymentDialog(),
      hold: () => holdBill(),
      held: () => setHeldOpen(true),
      refresh: () => {
        void fetchProducts(page, query, catFilter);
        void applyLiveFeed();
        toast.info("Stock and day summary refreshed");
      },
      shortcuts: () => setShortcutsOpen(true),
    };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, keyof typeof kbActionsRef.current> = {
        F2: "focusSearch",
        F4: "pay",
        F7: "hold",
        F8: "held",
        F9: "refresh",
      };
      const t = e.target as HTMLElement | null;
      if (e.key === "?") {
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
          return;
        }
        e.preventDefault();
        kbActionsRef.current.shortcuts();
        return;
      }
      const action = map[e.key];
      if (!action) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
        if (action !== "focusSearch" && (t as HTMLInputElement).type === "text") return;
      }
      e.preventDefault();
      kbActionsRef.current[action]();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Camera scanning via the native BarcodeDetector API (Chrome/Edge).
     Graceful fallback: browsers without it just show a hint. */
  useEffect(() => {
    if (!camOpen) return;
    let cancelled = false;
    interface DetectedCode {
      rawValue: string;
    }
    interface DetectorLike {
      detect: (src: HTMLVideoElement) => Promise<DetectedCode[]>;
    }
    const BD = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => DetectorLike;
      }
    ).BarcodeDetector;
    if (!BD) {
      setCamSupported(false);
      return;
    }

    setCamSupported(true);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const detector = new BD({
          formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"],
        });
        const timer = window.setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0 && codes[0].rawValue) {
              void handleScanRef.current(codes[0].rawValue);
            }
          } catch {
            /* transient decode errors are normal — keep polling */
          }
        }, 350);
        camTimerRef.current = timer;
      } catch {
        if (!cancelled) setCamSupported(false);
      }
    })();
    return () => {
      cancelled = true;
      if (camTimerRef.current !== null) {
        window.clearInterval(camTimerRef.current);
        camTimerRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [camOpen]);

  /* Numbered pagination window — max 7 buttons. */
  const pageWindow = useMemo(() => {
    const win: (number | "…")[] = [];
    const push = (n: number | "…") => win.push(n);
    if (pages <= 7) {
      for (let i = 1; i <= pages; i += 1) push(i);
      return win;
    }
    push(1);
    if (page > 3) push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i += 1) push(i);
    if (page < pages - 2) push("…");
    push(pages);
    return win;
  }, [page, pages]);

  /* =============================== render =============================== */

  const railBadge = (n: number) =>
    n > 0 ? (
      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-b from-[#e8bd68] to-[#b57e26] px-1 text-[9.5px] font-black text-[#221a08] shadow">
        {n}
      </span>
    ) : null;

  const railBtn = (
    active: boolean,
    label: string,
    Icon: typeof ShoppingBasket,
    onClick: () => void,
    badge?: React.ReactNode,
    title?: string
  ) => (
    <button
      key={label}
      type="button"
      onClick={() => {
        playPosSound("click");
        onClick();
      }}
      title={title ?? label}
      className={cn(
        "group relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-2xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/40",
        active
          ? "border-[#d9a441]/35 bg-gradient-to-b from-[#d9a441]/18 to-[#d9a441]/5 text-[#e8bd68] shadow-[inset_0_1px_0_rgba(232,189,104,0.15)]"
          : "border-transparent text-[#7d7362] hover:bg-[#1c1710] hover:text-[#d8cdb9]"
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.9} />
      <span className="text-[8.5px] font-bold uppercase tracking-[0.14em]">{label}</span>
      {badge}
    </button>
  );

  const stockTone = (n: number) =>
    n <= 0
      ? { dot: "bg-[#e5484d]", text: "text-[#f27f82]", label: "Out of stock" }
      : n <= 3
        ? { dot: "bg-[#f5a623]", text: "text-[#f5b93e]", label: `Only ${n} left` }
        : { dot: "bg-[#3dd68c]", text: "text-[#5cd69c]", label: `In stock · ${n}` };

  return (
    <div
      className="flex h-dvh overflow-hidden text-[#f2ecdf]"
      style={{
        background:
          "radial-gradient(1100px 460px at 72% -8%, rgba(217,164,65,0.075), transparent 62%), radial-gradient(900px 420px at -10% 110%, rgba(217,164,65,0.05), transparent 55%), #0e0c09",
      }}
    >
      {/* print: only the receipt is visible on paper + tiny page-local motion */}
      <style>{`@media print{body *{visibility:hidden}.pos-receipt,.pos-receipt *{visibility:visible}.pos-receipt{position:absolute;inset:0;background:#fff;color:#000}}
@keyframes posPulse{0%{opacity:.35}100%{opacity:1}}.pos-pulse{animation:posPulse .9s ease-out both}
@keyframes posPop{0%{transform:scale(.55);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}.pos-pop{animation:posPop .38s cubic-bezier(.2,1.4,.4,1) both}
@keyframes posSlide{0%{transform:translateY(10px);opacity:0}100%{transform:translateY(0);opacity:1}}.pos-slide{animation:posSlide .3s ease-out both}
@keyframes posGlow{0%,100%{box-shadow:0 0 0 0 rgba(217,164,65,0)}50%{box-shadow:0 0 34px -6px rgba(217,164,65,.45)}}`}</style>

      {/* ══════════════════ LEFT GOLD RAIL ══════════════════ */}
      <nav className="hidden w-[84px] shrink-0 flex-col items-center gap-1.5 border-r border-[#241e13] bg-[#100d09]/90 py-4 lg:flex">
        {/* brand — back to admin */}
        <button
          type="button"
          onClick={() => router.push("/admin")}
          title="Back to admin dashboard"
          className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-[#e8bd68] via-[#d9a441] to-[#b57e26] font-serif text-xl font-black text-[#241a06] shadow-[0_10px_26px_-10px_rgba(217,164,65,0.55)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/40"
        >
          S
        </button>
        <span className="mb-1 h-px w-8 bg-[#2b2418]" />

        {railBtn(true, "Sell", ShoppingBasket, () => {}, undefined, "Selling screen")}
        {railBtn(
          false,
          "Held",
          Pause,
          () => setHeldOpen(true),
          railBadge(held.length),
          held.length > 0 ? `${held.length} held bill(s)` : "Held bills"
        )}
        {railBtn(false, "Sales", History, () => setRecentOpen(true), undefined, "Recent sales")}
        {railBtn(false, "Day", ChartColumn, () => setDayOpen(true), undefined, "Today's summary")}
        {railBtn(false, "Keys", Keyboard, () => setShortcutsOpen(true), undefined, "Keyboard shortcuts")}

        <span className="my-1 h-px w-8 bg-[#2b2418]" />

        {/* sound: toggle + inline volume popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              playPosSound("click");
              setVolOpen((o) => !o);
            }}
            title="Sounds & volume"
            className={cn(ghostIcon, "h-12 w-12 flex-col gap-0.5 rounded-2xl")}
          >
            {soundOn ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
            <span className="text-[8.5px] font-bold uppercase tracking-[0.14em]">{soundOn ? "On" : "Off"}</span>
          </button>
          {volOpen && (
            <div className="pos-slide absolute bottom-0 left-full z-40 ml-2 w-56 rounded-2xl border border-[#2b2418] bg-[#171310] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a19681]">Register sounds</span>
                <button
                  type="button"
                  onClick={toggleSound}
                  className={cn(
                    "relative h-5.5 w-10 rounded-full transition",
                    soundOn ? "bg-gradient-to-r from-[#d9a441] to-[#b57e26]" : "bg-[#2b2418]"
                  )}
                  aria-label="Toggle sounds"
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all",
                      soundOn ? "left-[22px]" : "left-0.5"
                    )}
                  />
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(e) => changeVolume(Number(e.target.value) / 100)}
                className="w-full accent-[#d9a441]"
                aria-label="Sound volume"
              />
              <button
                type="button"
                onClick={() => testPosSound()}
                className="mt-3 w-full rounded-lg border border-[#2b2418] py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#a19681] transition hover:border-[#d9a441]/40 hover:text-[#e8bd68]"
              >
                Test sound
              </button>
            </div>
          )}
        </div>

        <button type="button" onClick={toggleFullscreen} title="Fullscreen" className={cn(ghostIcon, "h-12 w-12 rounded-2xl flex-col gap-0.5")}>
          <Maximize2 className="h-[18px] w-[18px]" />
          <span className="text-[8.5px] font-bold uppercase tracking-[0.14em]">Full</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin")}
          title="Exit to admin"
          className={cn(ghostIcon, "mt-auto h-12 w-12 flex-col gap-0.5 rounded-2xl hover:bg-[#3a1a1a] hover:text-[#f2a0a0]")}
        >
          <Home className="h-[18px] w-[18px]" />
          <span className="text-[8.5px] font-bold uppercase tracking-[0.14em]">Exit</span>
        </button>
      </nav>

      {/* ══════════════════ MAIN COLUMN ══════════════════ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ─────────── top bar: scan, register, day pulse ─────────── */}
        <header className="flex h-[74px] shrink-0 items-center gap-3 border-b border-[#241e13] bg-[#100d09]/60 px-4 backdrop-blur lg:px-6">
          {/* scan / search */}
          <div className="relative min-w-0 flex-1 max-w-2xl">
            <ScanLine
              className={cn(
                "pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 transition-colors",
                scanFlash === "ok" ? "text-[#3dd68c]" : scanFlash === "err" ? "text-[#e5484d]" : "text-[#6b6252]"
              )}
            />
            <input
              ref={scanRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim().length >= 4) {
                  void handleScan(query.trim());
                  setQuery("");
                }
              }}
              placeholder="Scan a barcode / SKU, or search products…"
              aria-label="Scan barcode or search products"
              className={cn(
                fieldCls,
                "h-12 rounded-2xl pl-11 pr-16 text-[14.5px] transition-all focus:shadow-[0_0_0_1px_rgba(217,164,65,0.25),0_10px_30px_-14px_rgba(217,164,65,0.35)]",
                scanFlash === "ok" && "border-[#3dd68c]/60",
                scanFlash === "err" && "border-[#e5484d]/60"
              )}
            />
            <kbd className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md border border-[#2b2418] bg-[#1a1610] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-[#6b6252]">
              F2
            </kbd>
          </div>

          {/* register chip */}
          <button
            type="button"
            onClick={() => {
              playPosSound("click");
              if (registerSession) {
                setRegCounted("");
                setRegClosingNote("");
                setRegCloseOpen(true);
              } else {
                setRegOpenOpen(true);
              }
            }}
            title={
              registerSession
                ? `Register OPEN since ${formatDateTime(registerSession.openedAt)} — click to count and close`
                : "Register CLOSED — click to open with an opening float"
            }
            className={cn(
              "hidden h-12 shrink-0 items-center gap-2.5 rounded-2xl border px-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/30 sm:flex",
              registerSession
                ? "border-[#3dd68c]/25 bg-[#3dd68c]/8 hover:bg-[#3dd68c]/15"
                : "border-[#e5484d]/30 bg-[#e5484d]/8 hover:bg-[#e5484d]/15"
            )}
          >
            {registerSession ? (
              <LockOpen className="h-4.5 w-4.5 text-[#5cd69c]" />
            ) : (
              <LockKeyhole className="h-4.5 w-4.5 text-[#f27f82]" />
            )}
            <span className="text-left leading-tight">
              <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-[#8b8170]">
                Register · T-{terminalId || "—"}
              </span>
              <span className={cn("block text-[13px] font-bold", registerSession ? "text-[#5cd69c]" : "text-[#f27f82]")}>
                {registerSession ? "OPEN" : "CLOSED"}
                {registerSession && registerLive && (
                  <span className="tnum ml-2 text-[12px] font-semibold text-[#a19681]">
                    Drawer {formatINR(registerLive.expectedCash)}
                  </span>
                )}
              </span>
            </span>
          </button>

          {/* today pulse */}
          {today && (
            <button
              type="button"
              onClick={() => setDayOpen(true)}
              title="Today's business (IST) — click for the full summary"
              className="hidden h-12 shrink-0 items-center gap-4 rounded-2xl border border-[#2b2418] bg-[#16130e] px-4 transition hover:border-[#d9a441]/30 md:flex"
            >
              {[
                { k: "Bills", v: String(today.orders), gold: false },
                { k: "Sales", v: formatINR(today.revenue), gold: true },
                { k: "Items", v: String(today.itemsSold), gold: false },
              ].map((s, i) => (
                <span key={s.k} className={cn("flex flex-col items-start leading-tight", i > 0 && "border-l border-[#2b2418] pl-4")}>
                  <span className="text-[8.5px] font-black uppercase tracking-[0.16em] text-[#6b6252]">{s.k}</span>
                  <span
                    key={`${s.k}-${s.v}`}
                    className={cn("pos-pulse tnum text-[13.5px] font-bold", s.gold && "text-[#e8bd68]")}
                  >
                    {s.v}
                  </span>
                </span>
              ))}
            </button>
          )}

          {/* cashier */}
          {sellerName && (
            <div className="hidden h-12 shrink-0 items-center gap-2.5 rounded-2xl border border-[#2b2418] bg-[#16130e] px-3.5 xl:flex" title="Signed-in cashier">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-[#e8bd68] to-[#b57e26] text-[11px] font-black text-[#241a06]">
                {sellerName.trim().charAt(0).toUpperCase()}
              </span>
              <span className="leading-tight">
                <span className="block text-[8.5px] font-black uppercase tracking-[0.16em] text-[#6b6252]">Cashier</span>
                <span className="block max-w-24 truncate text-[12px] font-bold">{sellerName}</span>
              </span>
            </div>
          )}
        </header>

        {/* ─────────── categories + filters ─────────── */}
        <div className="flex shrink-0 items-center gap-2.5 overflow-x-auto border-b border-[#241e13] px-4 py-3 lg:px-6 stellora-scroll">
          <button
            type="button"
            onClick={() => setCatFilter("")}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/30",
              !catFilter
                ? "bg-gradient-to-b from-[#e8bd68] to-[#c08a2e] text-[#241a06] shadow-[0_8px_20px_-8px_rgba(217,164,65,0.5)]"
                : "border border-[#2b2418] bg-[#16130e] text-[#a19681] hover:border-[#453a24] hover:text-[#f2ecdf]"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCatFilter(cFilter => (cFilter === c.slug ? "" : c.slug))}
              className={cn(
                "flex h-9 shrink-0 items-center rounded-full px-4 text-[12.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/30",
                catFilter === c.slug
                  ? "bg-gradient-to-b from-[#e8bd68] to-[#c08a2e] text-[#241a06] shadow-[0_8px_20px_-8px_rgba(217,164,65,0.5)]"
                  : "border border-[#2b2418] bg-[#16130e] text-[#a19681] hover:border-[#453a24] hover:text-[#f2ecdf]"
              )}
            >
              {c.name}
            </button>
          ))}
          <span className="mx-1 hidden h-6 w-px shrink-0 bg-[#2b2418] sm:block" />
          {/* stock filter + sort */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setInStockOnly((v) => !v);
                setOutOnly(false);
              }}
              className={cn(
                "hidden h-9 items-center rounded-full border px-3.5 text-[11.5px] font-bold transition sm:flex",
                inStockOnly
                  ? "border-[#3dd68c]/40 bg-[#3dd68c]/10 text-[#5cd69c]"
                  : "border-[#2b2418] bg-[#16130e] text-[#8b8170] hover:text-[#f2ecdf]"
              )}
            >
              In stock
            </button>
            <button
              type="button"
              onClick={() => {
                setOutOnly((v) => !v);
                setInStockOnly(false);
              }}
              className={cn(
                "hidden h-9 items-center rounded-full border px-3.5 text-[11.5px] font-bold transition sm:flex",
                outOnly
                  ? "border-[#e5484d]/40 bg-[#e5484d]/10 text-[#f27f82]"
                  : "border-[#2b2418] bg-[#16130e] text-[#8b8170] hover:text-[#f2ecdf]"
              )}
            >
              Out
            </button>
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b6252]" />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                aria-label="Sort products"
                className="h-9 appearance-none rounded-full border border-[#2b2418] bg-[#16130e] pl-8 pr-3 text-[11.5px] font-bold text-[#a19681] outline-none transition hover:text-[#f2ecdf] focus:border-[#d9a441]/50"
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
                <option value="stock">Stock</option>
              </select>
            </div>
          </div>
        </div>

        {/* ─────────── catalog grid ─────────── */}
        <main
          className={cn(
            "stellora-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-5 lg:px-6 lg:pb-8",
            mobileTab !== "browse" && "hidden lg:block"
          )}
        >
          {visibleProducts === null ? (
            /* skeleton cards */
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-[#241e13] bg-[#14110d]">
                  <div className="aspect-[4/3] animate-pulse bg-[#1c1710]" />
                  <div className="space-y-2 p-3.5">
                    <div className="h-3.5 w-3/4 animate-pulse rounded bg-[#1c1710]" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-[#1c1710]" />
                    <div className="h-4 w-1/3 animate-pulse rounded bg-[#1c1710]" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl border border-[#2b2418] bg-[#16130e]">
                <PackageOpen className="h-7 w-7 text-[#6b6252]" />
              </span>
              {prodFailed ? (
                <>
                  <p className="text-[15px] font-bold">Catalog failed to load</p>
                  <button
                    type="button"
                    onClick={() => void fetchProducts(1, query, catFilter)}
                    className="mt-1 inline-flex items-center gap-2 rounded-xl border border-[#d9a441]/40 px-4 py-2 text-[12px] font-bold text-[#e8bd68] transition hover:bg-[#d9a441]/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Retry
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-bold">No products match</p>
                  <p className="max-w-60 text-[12.5px] text-[#8b8170]">
                    Try another search term, category or filter — scanned codes also work.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleProducts.map((p) => {
                const stock = stockOf(p);
                const tone = stockTone(stock);
                const price = minPriceOf(p);
                const compare = p.variants.find((v) => v.isActive && Number(v.compareAtPrice) > Number(v.price))?.compareAtPrice;
                const offPct =
                  compare && Number(compare) > price && price > 0
                    ? Math.round(((Number(compare) - price) / Number(compare)) * 100)
                    : 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProductClick(p)}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#241e13] bg-[#15120d] text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#d9a441]/45 hover:shadow-[0_22px_44px_-22px_rgba(217,164,65,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/40"
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden bg-[#0b0a08]">
                      {p.images[0]?.url ? (
                        <Image
                          src={p.images[0].url}
                          alt={p.images[0].alt ?? p.name}
                          fill
                          sizes="(max-width:640px) 45vw, (max-width:1280px) 30vw, 22vw"
                          className="object-cover transition duration-500 group-hover:scale-[1.06]"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center">
                          <ShoppingBasket className="h-8 w-8 text-[#2b2418]" />
                        </span>
                      )}
                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0a08]/70 via-transparent to-transparent" />
                      {offPct > 0 && (
                        <span className="absolute left-3 top-3 rounded-lg bg-[#e5484d] px-2 py-0.5 text-[10px] font-black tracking-wide text-white shadow">
                          −{offPct}%
                        </span>
                      )}
                      {stock <= 0 && (
                        <span className="absolute inset-0 flex items-center justify-center bg-[#0b0a08]/72 backdrop-blur-[2px]">
                          <span className="rounded-lg border border-[#e5484d]/40 bg-[#e5484d]/15 px-3 py-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-[#f27f82]">
                            Out of stock
                          </span>
                        </span>
                      )}
                      <span className="absolute bottom-3 right-3 flex h-9 w-9 translate-y-1.5 items-center justify-center rounded-full bg-gradient-to-b from-[#e8bd68] to-[#c08a2e] text-[#241a06] opacity-90 shadow-[0_10px_24px_-8px_rgba(217,164,65,0.6)] transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 max-lg:translate-y-0 max-lg:opacity-100">
                        <Plus className="h-4.5 w-4.5" strokeWidth={2.6} />
                      </span>
                    </span>
                    <span className="flex flex-1 flex-col gap-1 p-3.5">
                      <span className="truncate text-[13.5px] font-bold leading-snug text-[#f2ecdf]">{p.name}</span>
                      <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#6b6252]">
                        {p.variants.find((v) => v.isActive)?.sku ?? p.category?.name ?? ""}
                      </span>
                      <span className="mt-auto flex items-end justify-between pt-1.5">
                        <span className="leading-none">
                          <span className="tnum text-[15.5px] font-black text-[#e8bd68]">
                            ₹{price.toLocaleString("en-IN")}
                          </span>
                          {compare && Number(compare) > price && (
                            <span className="tnum ml-1.5 text-[10.5px] font-semibold text-[#6b6252] line-through">
                              ₹{Number(compare).toLocaleString("en-IN")}
                            </span>
                          )}
                        </span>
                        <span className={cn("flex items-center gap-1.5 text-[10px] font-bold", tone.text)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                          {stock > 0 ? `${tone.label.split("· ")[1] ?? tone.label}` : "Out"}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* pagination */}
          {visibleProducts !== null && visibleProducts.length > 0 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-[11.5px] font-semibold text-[#6b6252]">
                Page <span className="text-[#a19681]">{page}</span> of {pages} · {total} products
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => void fetchProducts(page - 1, query, catFilter)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#2b2418] text-[#a19681] transition hover:border-[#d9a441]/40 hover:text-[#e8bd68] disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageWindow.map((n, i) =>
                  n === "…" ? (
                    <span key={`gap-${i}`} className="px-1 text-[11px] text-[#6b6252]">
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      onClick={() => void fetchProducts(n, query, catFilter)}
                      className={cn(
                        "tnum flex h-9 min-w-9 items-center justify-center rounded-xl px-2 text-[12px] font-bold transition",
                        n === page
                          ? "bg-gradient-to-b from-[#e8bd68] to-[#c08a2e] text-[#241a06] shadow"
                          : "border border-[#2b2418] text-[#a19681] hover:border-[#453a24] hover:text-[#f2ecdf]"
                      )}
                    >
                      {n}
                    </button>
                  )
                )}
                <button
                  type="button"
                  disabled={page >= pages}
                  onClick={() => void fetchProducts(page + 1, query, catFilter)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#2b2418] text-[#a19681] transition hover:border-[#d9a441]/40 hover:text-[#e8bd68] disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </main>

        {/* ─────────── mobile bottom tabs ─────────── */}
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-[#241e13] bg-[#100d09]/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("browse")}
            className={cn(
              "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[12px] font-bold transition",
              mobileTab === "browse" ? "bg-[#d9a441]/15 text-[#e8bd68]" : "text-[#8b8170]"
            )}
          >
            <ShoppingBasket className="h-4.5 w-4.5" /> Browse
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("cart")}
            className={cn(
              "relative flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[12px] font-bold transition",
              mobileTab === "cart" ? "bg-[#d9a441]/15 text-[#e8bd68]" : "text-[#8b8170]"
            )}
          >
            <ReceiptText className="h-4.5 w-4.5" /> Bill
            {billCount > 0 && (
              <span className="tnum absolute right-3 top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gradient-to-b from-[#e8bd68] to-[#b57e26] px-1 text-[9.5px] font-black text-[#241a06]">
                {billCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ══════════════════ BILL PANEL ══════════════════ */}
      <aside
        className={cn(
          "stellora-scroll z-20 flex w-full shrink-0 flex-col border-l border-[#241e13] bg-[#12100c] pb-[76px] lg:w-[400px] lg:pb-0 xl:w-[432px]",
          mobileTab !== "cart" && "hidden lg:flex"
        )}
      >
        {/* panel header */}
        <div className="flex h-[74px] shrink-0 items-center justify-between gap-2 border-b border-[#241e13] px-5">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-serif text-[19px] font-bold tracking-tight text-[#f2ecdf]">Current Bill</h2>
            <Pill className="border-[#d9a441]/25 bg-[#d9a441]/8 text-[#e8bd68]">T-{terminalId || "—"}</Pill>
          </div>
          <div className="flex items-center gap-1">
            {bill.length > 0 && (
              <button type="button" onClick={clearBill} title="Clear the bill" className={ghostIcon}>
                <Trash2 className="h-4.5 w-4.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                playPosSound("click");
                setMobileTab("browse");
              }}
              title="Back to catalog"
              className={cn(ghostIcon, "lg:hidden")}
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* customer strip */}
        <div className="shrink-0 px-5 pt-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[#241e13] bg-[#17130d] p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d9a441]/30 bg-[#d9a441]/10 text-[15px] font-black text-[#e8bd68]">
              {customerName ? customerName.trim().charAt(0).toUpperCase() : <UserRound className="h-4.5 w-4.5 text-[#8b8170]" />}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13.5px] font-bold">{customerName ?? "Walk-in customer"}</p>
              <p className="truncate text-[11px] text-[#8b8170]">
                {customerPhone || customerEmail || "Tap to attach for loyalty points"}
                {customerPoints !== null && customerPoints > 0 && (
                  <span className="tnum ml-2 rounded-md bg-[#d9a441]/12 px-1.5 py-0.5 text-[10px] font-bold text-[#e8bd68]">
                    ★ {customerPoints.toLocaleString("en-IN")} pts
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={openCustPicker}
              title="Attach a customer"
              className={ghostIcon}
            >
              <UserRound className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={() => setCustCreateOpen(true)}
              title="New customer"
              className={ghostIcon}
            >
              <UserRoundPlus className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* lines */}
        <div className="stellora-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {bill.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 pb-16 text-center">
              <span className="pos-pop flex h-20 w-20 items-center justify-center rounded-[28px] border border-dashed border-[#3a3122] bg-[#17130d]">
                <HandCoins className="h-8 w-8 text-[#4a4132]" />
              </span>
              <p className="mt-1 font-serif text-[16px] font-bold text-[#d8cdb9]">The counter is clear</p>
              <p className="max-w-56 text-[12px] leading-relaxed text-[#8b8170]">
                Tap a product, scan a barcode, or resume a held bill to start billing.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {bill.map((l) => (
                <li
                  key={l.variantId}
                  className="pos-slide rounded-2xl border border-[#262017] bg-[#17130d] p-3 transition hover:border-[#3a3122]"
                >
                  <div className="flex gap-3">
                    {/* thumb */}
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[#241e13] bg-[#0b0a08]">
                      {l.image ? (
                        <Image src={l.image} alt={l.productName} fill sizes="56px" className="object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center">
                          <ShoppingBasket className="h-5 w-5 text-[#2b2418]" />
                        </span>
                      )}
                    </span>
                    {/* name + meta */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold leading-snug">{l.productName}</p>
                      <p className="truncate text-[10.5px] text-[#8b8170]">
                        {l.variantName} · <span className="font-mono uppercase">{l.sku}</span>
                      </p>
                      {/* qty stepper + unit price */}
                      <div className="mt-2 flex items-center gap-2.5">
                        <span className="flex items-center rounded-lg border border-[#2b2418] bg-[#100e0a]">
                          <button
                            type="button"
                            onClick={() => changeQty(l.variantId, -1)}
                            disabled={l.quantity <= 1}
                            className="flex h-7.5 w-7 items-center justify-center text-[#a19681] transition hover:text-[#f2ecdf] disabled:opacity-30"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="tnum w-6 text-center text-[12.5px] font-black">{l.quantity}</span>
                          <button
                            type="button"
                            onClick={() => changeQty(l.variantId, 1)}
                            disabled={l.quantity >= l.stock}
                            className="flex h-7.5 w-7 items-center justify-center text-[#a19681] transition hover:text-[#e8bd68] disabled:opacity-30"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-[#8b8170]">
                          @
                          <input
                            value={l.unitPrice}
                            onChange={(e) => editLinePrice(l.variantId, Number(e.target.value))}
                            inputMode="decimal"
                            aria-label={`Unit price for ${l.productName}`}
                            className="tnum w-16 rounded-md border border-transparent bg-[#100e0a] px-1.5 py-1 text-right text-[11.5px] font-bold text-[#d8cdb9] outline-none transition hover:border-[#2b2418] focus:border-[#d9a441]/50"
                          />
                        </span>
                        {l.stock <= 3 && (
                          <span className="rounded-md bg-[#f5a623]/12 px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wide text-[#f5b93e]">
                            {l.stock} left
                          </span>
                        )}
                      </div>
                    </div>
                    {/* total + remove */}
                    <div className="flex shrink-0 flex-col items-end justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          playPosSound("remove");
                          setBill(bill.filter((x) => x.variantId !== l.variantId));
                        }}
                        title="Remove line"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b6252] transition hover:bg-[#3a1a1a] hover:text-[#f27f82]"
                        aria-label={`Remove ${l.productName}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <span className="tnum text-[14.5px] font-black text-[#e8bd68]">
                        ₹{(l.unitPrice * l.quantity).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* note chip / editor */}
                  {noteEdit?.variantId === l.variantId ? (
                    <div className="mt-2.5 flex gap-2">
                      <input
                        value={noteEdit.draft}
                        autoFocus
                        onChange={(e) => setNoteEdit({ variantId: l.variantId, draft: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setLineNote(l.variantId, noteEdit.draft);
                            setNoteEdit(null);
                          }
                          if (e.key === "Escape") setNoteEdit(null);
                        }}
                        placeholder="Note for this line — engraving, gift wrap…"
                        className={cn(fieldCls, "h-9 flex-1 rounded-lg text-[12px]")}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setLineNote(l.variantId, noteEdit.draft);
                          setNoteEdit(null);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-b from-[#e8bd68] to-[#c08a2e] text-[#241a06]"
                        aria-label="Save note"
                      >
                        <Check className="h-4 w-4" strokeWidth={2.6} />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setNoteEdit({ variantId: l.variantId, draft: l.note ?? "" })}
                        className={cn(
                          "rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition",
                          l.note
                            ? "border-[#d9a441]/35 bg-[#d9a441]/10 text-[#e8bd68]"
                            : "border-[#2b2418] text-[#6b6252] hover:border-[#453a24] hover:text-[#a19681]"
                        )}
                      >
                        {l.note ? `✎ ${l.note.slice(0, 26)}` : "+ Note"}
                      </button>
                      {l.variants && l.variants.length > 1 && (
                        <span className="stellora-scroll flex max-w-full items-center gap-1 overflow-x-auto">
                          {l.variants.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => swapVariant(l.variantId, opt)}
                              disabled={opt.id === l.variantId || opt.stock <= 0}
                              title={`${opt.name} · ₹${opt.price.toLocaleString("en-IN")} · ${opt.stock} in stock`}
                              className={cn(
                                "shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold transition",
                                opt.id === l.variantId
                                  ? "border-[#d9a441]/50 bg-[#d9a441]/15 text-[#e8bd68]"
                                  : opt.stock <= 0
                                    ? "border-[#2b2418] text-[#4a4132] line-through"
                                    : "border-[#2b2418] text-[#8b8170] hover:border-[#453a24] hover:text-[#f2ecdf]"
                              )}
                            >
                              {opt.name}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* adjustments + totals */}
        <div className="shrink-0 border-t border-[#241e13] bg-[#14110c] px-5 py-4">
          {/* discount / tax / shipping / coupon — compact row controls */}
          <details className="group/adj">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[10.5px] font-black uppercase tracking-[0.16em] text-[#8b8170] transition hover:text-[#d8cdb9]">
              <span className="flex items-center gap-1.5">
                <Tags className="h-3.5 w-3.5" /> Adjustments
                {(appliedDiscount > 0 || taxNum > 0 || shippingNum > 0) && (
                  <span className="rounded-md bg-[#d9a441]/15 px-1.5 py-0.5 text-[9px] font-black text-[#e8bd68]">
                    {[
                      appliedDiscount > 0 ? "DISC" : "",
                      taxNum > 0 ? "TAX" : "",
                      shippingNum > 0 ? "SHIP" : "",
                    ]
                      .filter(Boolean)
                      .join("+")}
                  </span>
                )}
              </span>
              <ChevronRight className="h-4 w-4 transition-transform group-open/adj:rotate-90" />
            </summary>
            <div className="mt-3 space-y-2.5">
              {/* discount */}
              <div className="flex items-center gap-2">
                <div className="flex overflow-hidden rounded-xl border border-[#2b2418]">
                  <button
                    type="button"
                    onClick={() => switchDiscountMode("flat")}
                    className={cn(
                      "px-2.5 py-2 text-[11px] font-black transition",
                      discountMode === "flat" ? "bg-[#d9a441]/20 text-[#e8bd68]" : "bg-[#100e0a] text-[#6b6252] hover:text-[#a19681]"
                    )}
                  >
                    ₹
                  </button>
                  <button
                    type="button"
                    onClick={() => switchDiscountMode("pct")}
                    className={cn(
                      "px-2.5 py-2 text-[11px] font-black transition",
                      discountMode === "pct" ? "bg-[#d9a441]/20 text-[#e8bd68]" : "bg-[#100e0a] text-[#6b6252] hover:text-[#a19681]"
                    )}
                  >
                    %
                  </button>
                </div>
                <input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="Discount"
                  inputMode="decimal"
                  aria-label="Bill discount"
                  className={cn(fieldCls, "tnum h-10 flex-1 rounded-xl text-right font-bold", discountInvalid && "border-[#e5484d]/60")}
                />
                <div className="flex gap-1">
                  {(discountMode === "pct" ? [5, 10] : [100, 500]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setDiscount(String(q))}
                      className="tnum h-10 rounded-xl border border-[#2b2418] px-2.5 text-[11px] font-bold text-[#8b8170] transition hover:border-[#d9a441]/40 hover:text-[#e8bd68]"
                    >
                      {discountMode === "pct" ? `${q}%` : `₹${q}`}
                    </button>
                  ))}
                </div>
              </div>
              {/* tax + shipping */}
              <div className="grid grid-cols-2 gap-2.5">
                <label className="relative block">
                  <Percent className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b6252]" />
                  <input
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="Tax %"
                    inputMode="decimal"
                    aria-label="Tax percent"
                    className={cn(fieldCls, "tnum h-10 pl-8 text-right font-bold")}
                  />
                </label>
                <label className="relative block">
                  <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b6252]" />
                  <input
                    value={shippingFee}
                    onChange={(e) => setShippingFee(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="Shipping ₹"
                    inputMode="decimal"
                    aria-label="Shipping fee"
                    className={cn(fieldCls, "tnum h-10 pl-8 text-right font-bold")}
                  />
                </label>
              </div>
              {/* coupon */}
              {appliedCoupon ? (
                <div className="flex items-center justify-between rounded-xl border border-[#3dd68c]/30 bg-[#3dd68c]/8 px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-[12px] font-bold text-[#5cd69c]">
                    <Ticket className="h-4 w-4" /> {appliedCoupon.code} · −{formatINR(appliedCoupon.discount)}
                  </span>
                  <button type="button" onClick={removeCoupon} className="text-[#8b8170] transition hover:text-[#f27f82]" aria-label="Remove coupon">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && void applyCoupon()}
                    placeholder="Promo code"
                    aria-label="Promo code"
                    className={cn(fieldCls, "h-10 flex-1 font-bold uppercase tracking-wide")}
                  />
                  <button
                    type="button"
                    onClick={() => void applyCoupon()}
                    disabled={couponBusy || bill.length === 0}
                    className="h-10 rounded-xl border border-[#d9a441]/35 px-4 text-[11.5px] font-black uppercase tracking-wide text-[#e8bd68] transition hover:bg-[#d9a441]/10 disabled:opacity-40"
                  >
                    {couponBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </button>
                </div>
              )}
              {/* bill note */}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Bill note (optional)"
                aria-label="Bill note"
                className={cn(fieldCls, "h-10 text-[12.5px]")}
              />
            </div>
          </details>

          {/* totals */}
          <dl className="mt-3.5 space-y-1.5 border-t border-dashed border-[#2b2418] pt-3.5 text-[12.5px]">
            <div className="flex justify-between">
              <dt className="text-[#8b8170]">Subtotal · {billCount} item{billCount === 1 ? "" : "s"}</dt>
              <dd className="tnum font-bold text-[#d8cdb9]">{formatINR(subtotal)}</dd>
            </div>
            {appliedDiscount > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#8b8170]">Discount{appliedCoupon ? ` · ${appliedCoupon.code}` : ""}</dt>
                <dd className="tnum font-bold text-[#5cd69c]">−{formatINR(appliedDiscount)}</dd>
              </div>
            )}
            {taxTotal > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#8b8170]">Tax · {taxNum}%</dt>
                <dd className="tnum font-bold text-[#d8cdb9]">{formatINR(taxTotal)}</dd>
              </div>
            )}
            {shippingNum > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#8b8170]">Shipping</dt>
                <dd className="tnum font-bold text-[#d8cdb9]">{formatINR(shippingNum)}</dd>
              </div>
            )}
            <div className="flex items-end justify-between pt-1.5">
              <dt className="text-[10.5px] font-black uppercase tracking-[0.18em] text-[#a19681]">Total payable</dt>
              <dd key={grandTotal} className="pos-pulse tnum font-serif text-[26px] font-black leading-none text-[#e8bd68]">
                ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </dd>
            </div>
          </dl>

          {/* actions */}
          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              onClick={holdBill}
              disabled={bill.length === 0}
              title="Hold this bill (F7)"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#2b2418] text-[#a19681] transition hover:border-[#d9a441]/40 hover:text-[#e8bd68] disabled:opacity-30"
            >
              <Pause className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={openPaymentDialog}
              disabled={bill.length === 0 || discountInvalid || grandTotal <= 0}
              title="Charge the bill (F4)"
              className="group relative flex h-14 flex-1 items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-b from-[#e8bd68] via-[#d9a441] to-[#b57e26] text-[15.5px] font-black tracking-wide text-[#241a06] shadow-[0_16px_36px_-14px_rgba(217,164,65,0.55)] transition-all hover:brightness-105 active:scale-[0.99] disabled:from-[#2b2418] disabled:via-[#2b2418] disabled:to-[#2b2418] disabled:text-[#6b6252] disabled:shadow-none"
            >
              <Banknote className="h-5 w-5" strokeWidth={2.4} />
              Charge ₹{grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              <span className="rounded-lg bg-[#241a06]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                {billCount} item{billCount === 1 ? "" : "s"} · F4
              </span>
            </button>
          </div>
          <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-[#6b6252]">
            <span className={cn("h-1.5 w-1.5 rounded-full", registerSession ? "bg-[#3dd68c]" : "bg-[#e5484d]")} />
            {registerSession ? `Register open · drawer ${formatINR(registerLive?.expectedCash ?? 0)}` : "Register closed — open it to accept payments"}
          </p>
        </div>
      </aside>

      {/* ══════════════════ DIALOGS ══════════════════ */}

      {/* variant picker */}
      <AurumModal
        open={!!variantPicker}
        onClose={() => setVariantPickerId(null)}
        title={variantPicker?.name ?? ""}
        subtitle="Pick the variant to bill"
        wide
      >
        <div className="space-y-2">
          {variantPicker?.variants
            .filter((v) => v.isActive)
            .map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  addVariant(variantPicker, v);
                  setVariantPickerId(null);
                }}
                disabled={v.stock <= 0}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-2xl border p-3 text-left transition",
                  v.stock <= 0
                    ? "border-[#241e13] opacity-45"
                    : "border-[#2b2418] bg-[#16130e] hover:border-[#d9a441]/50 hover:bg-[#1c1710]"
                )}
              >
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[#241e13] bg-[#0b0a08]">
                  {variantPicker.images[0]?.url ? (
                    <Image src={variantPicker.images[0].url} alt={variantPicker.name} fill sizes="56px" className="object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold">{v.name}</span>
                  <span className="block font-mono text-[10px] uppercase text-[#6b6252]">{v.sku}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-[14.5px] font-black text-[#e8bd68]">₹{Number(v.price).toLocaleString("en-IN")}</span>
                  <span className={cn("block text-[10px] font-bold", v.stock <= 0 ? "text-[#f27f82]" : "text-[#5cd69c]")}>
                    {v.stock <= 0 ? "Out of stock" : `${v.stock} in stock`}
                  </span>
                </span>
              </button>
            ))}
        </div>
      </AurumModal>

      {/* camera scanner */}
      <AurumModal open={camOpen} onClose={() => setCamOpen(false)} title="Scan a barcode" subtitle="Hold the code inside the frame">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[#2b2418] bg-[#0b0a08]">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          {/* gold corner frame */}
          <span className="pointer-events-none absolute inset-10">
            {["left-0 top-0 border-l-2 border-t-2 rounded-tl-xl", "right-0 top-0 border-r-2 border-t-2 rounded-tr-xl", "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl", "bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl"].map(
              (c) => (
                <span key={c} className={cn("absolute h-10 w-10 border-[#d9a441]", c)} />
              )
            )}
          </span>
          {!camSupported && (
            <span className="absolute inset-0 flex items-center justify-center bg-[#0b0a08]/85 p-6 text-center">
              <span className="text-[12.5px] leading-relaxed text-[#a19681]">
                This browser doesn't support camera scanning. USB barcode scanners and typed SKUs work everywhere — just
                type the code in the search bar and press Enter.
              </span>
            </span>
          )}
        </div>
      </AurumModal>

      {/* held bills drawer */}
      <AurumSheet open={heldOpen} onClose={() => setHeldOpen(false)} title="Held bills" subtitle={`${held.length} parked at this terminal`}>
        {held.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#2b2418] p-6 text-center text-[12.5px] text-[#8b8170]">
            Nothing on hold. Hold a bill with the pause button or F7 when a customer steps away.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {held.map((h) => {
              const hTotal = r2(h.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
              return (
                <li key={h.id} className="rounded-2xl border border-[#262017] bg-[#16130e] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold">
                        {h.customerName ?? "Walk-in customer"} · {h.lines.length} line{h.lines.length === 1 ? "" : "s"}
                      </p>
                      <p className="text-[10.5px] text-[#6b6252]">
                        Held {formatDateTime(new Date(h.at).toISOString())}
                      </p>
                    </div>
                    <span className="tnum shrink-0 text-[14px] font-black text-[#e8bd68]">₹{hTotal.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => resumeBill(h)}
                      className="h-9 flex-1 rounded-xl bg-gradient-to-b from-[#e8bd68] to-[#c08a2e] text-[11.5px] font-black uppercase tracking-wide text-[#241a06] transition hover:brightness-105"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeld(held.filter((x) => x.id !== h.id))}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#2b2418] text-[#8b8170] transition hover:border-[#e5484d]/40 hover:text-[#f27f82]"
                      aria-label="Discard held bill"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AurumSheet>

      {/* recent sales drawer */}
      <AurumSheet open={recentOpen} onClose={() => setRecentOpen(false)} title="Recent sales" subtitle="Last 8 bills across the store">
        {recentBusy ? (
          <p className="py-8 text-center text-[12.5px] text-[#8b8170]">Loading…</p>
        ) : recentErr ? (
          <p className="rounded-2xl border border-dashed border-[#e5484d]/30 p-6 text-center text-[12.5px] text-[#f27f82]">
            Could not load recent sales — try again in a moment.
          </p>
        ) : !recentOrders || recentOrders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#2b2418] p-6 text-center text-[12.5px] text-[#8b8170]">
            No sales yet today. Charged bills appear here instantly.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {recentOrders.map((o) => {
              const pm = o.payments?.[0]?.method ?? o.paymentMethod;
              return (
                <li key={o.id} className="rounded-2xl border border-[#262017] bg-[#16130e] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="tnum truncate text-[13px] font-bold text-[#e8bd68]">{o.orderNumber}</p>
                      <p className="truncate text-[10.5px] text-[#6b6252]">
                        {formatDateTime(o.createdAt)}
                        {o.user ? ` · ${o.user.name}` : " · Walk-in"}
                        {o.source ? ` · ${o.source === "POS" ? "counter" : "web"}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum text-[14px] font-black">₹{Number(o.grandTotal).toLocaleString("en-IN")}</p>
                      {pm && <Pill className="mt-0.5">{methodLabel(pm)}</Pill>}
                    </div>
                  </div>
                  <p className="mt-1.5 truncate text-[11px] text-[#8b8170]">
                    {o.items.map((i) => `${i.productName} ×${i.quantity}`).join(", ")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setReceipt(receiptFromOrder(o));
                      setReceiptIsReprint(true);
                    }}
                    className="mt-2.5 inline-flex h-9 items-center gap-2 rounded-xl border border-[#2b2418] px-3.5 text-[11px] font-black uppercase tracking-wide text-[#a19681] transition hover:border-[#d9a441]/40 hover:text-[#e8bd68]"
                  >
                    <Printer className="h-3.5 w-3.5" /> Reprint receipt
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </AurumSheet>

      {/* day summary drawer */}
      <AurumSheet open={dayOpen} onClose={() => setDayOpen(false)} title="Today at the counter" subtitle="IST business day — live">
        {!today ? (
          <p className="py-8 text-center text-[12.5px] text-[#8b8170]">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { k: "Bills", v: String(today.orders), gold: false },
                { k: "Revenue", v: formatINR(today.revenue), gold: true },
                { k: "Cash sales", v: formatINR(today.cashSales), gold: false },
                { k: "Digital", v: formatINR(today.nonCashSales), gold: false },
                { k: "Items sold", v: String(today.itemsSold), gold: false },
                { k: "Counter bills", v: String(today.posOrders), gold: false },
              ].map((s) => (
                <div key={s.k} className="rounded-2xl border border-[#262017] bg-[#16130e] p-3.5">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#6b6252]">{s.k}</p>
                  <p className={cn("tnum mt-1 text-[17px] font-black", s.gold && "text-[#e8bd68]")}>{s.v}</p>
                </div>
              ))}
            </div>
            {today.hourly && today.hourly.some((h) => h.revenue > 0) && (
              <div className="rounded-2xl border border-[#262017] bg-[#16130e] p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#8b8170]">Hourly revenue</p>
                <div className="flex h-28 items-end gap-1.5">
                  {today.hourly
                    .filter((h) => h.hour >= 7 && h.hour <= 23)
                    .map((h) => {
                      const max = Math.max(...today.hourly!.filter((x) => x.hour >= 7 && x.hour <= 23).map((x) => x.revenue), 1);
                      return (
                        <div key={h.hour} className="group flex flex-1 flex-col items-center gap-1" title={`${h.hour}:00 — ${formatINR(h.revenue)} · ${h.orders} bills`}>
                          <span
                            className={cn(
                              "w-full rounded-t-md transition-all",
                              h.revenue > 0 ? "bg-gradient-to-t from-[#8a6420] to-[#e8bd68]" : "bg-[#241e13]"
                            )}
                            style={{ height: `${Math.max((h.revenue / max) * 100, h.revenue > 0 ? 8 : 3)}%` }}
                          />
                          <span className="text-[8.5px] font-bold text-[#6b6252]">{h.hour > 12 ? h.hour - 12 : h.hour || 12}{h.hour >= 12 ? "p" : "a"}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-[#262017] bg-[#16130e] p-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#8b8170]">Cash drawer</p>
              {registerSession ? (
                <div className="space-y-1.5 text-[12.5px]">
                  <p className="flex justify-between"><span className="text-[#8b8170]">Expected in drawer</span><span className="tnum font-black text-[#5cd69c]">{formatINR(registerLive?.expectedCash ?? 0)}</span></p>
                  <p className="flex justify-between"><span className="text-[#8b8170]">Cash in (sales)</span><span className="tnum font-bold">{formatINR(registerLive?.cashIn ?? 0)}</span></p>
                  <p className="flex justify-between"><span className="text-[#8b8170]">Change given</span><span className="tnum font-bold">−{formatINR(registerLive?.change ?? 0)}</span></p>
                  <p className="flex justify-between"><span className="text-[#8b8170]">Digital collected</span><span className="tnum font-bold">{formatINR(registerLive?.nonCash ?? 0)}</span></p>
                  <p className="pt-1.5 text-[10.5px] text-[#6b6252]">Opened by {registerSession.openedByName ?? "—"} at {formatDateTime(registerSession.openedAt)}</p>
                </div>
              ) : (
                <p className="text-[12px] text-[#8b8170]">Register is closed. Open it from the register chip to start the day.</p>
              )}
            </div>
          </div>
        )}
      </AurumSheet>

      {/* customer picker */}
      <AurumModal open={custOpen} onClose={() => setCustOpen(false)} title="Attach customer" subtitle="Search by name, mobile or email">
        <input
          value={custQuery}
          onChange={(e) => setCustQuery(e.target.value)}
          placeholder="Search customers…"
          autoFocus
          aria-label="Search customers"
          className={cn(fieldCls, "h-11 rounded-xl")}
        />
        <div className="stellora-scroll mt-3 max-h-72 space-y-1.5 overflow-y-auto">
          {custHits === null ? (
            <p className="py-6 text-center text-[12.5px] text-[#8b8170]">Loading…</p>
          ) : custHits.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#2b2418] p-5 text-center text-[12.5px] text-[#8b8170]">
              No match. Add a new customer instantly below.
            </p>
          ) : (
            custHits.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCustomerEmail(c.email ?? "");
                  setCustomerPhone(c.phone ?? "");
                  setCustomerName(c.name);
                  setCustomerPoints(Number(c.points ?? 0));
                  setCustOpen(false);
                  playPosSound("success");
                  toast.success(`${c.name} attached to the bill`);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-[#262017] bg-[#16130e] p-3 text-left transition hover:border-[#d9a441]/45"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d9a441]/30 bg-[#d9a441]/10 text-[12.5px] font-black text-[#e8bd68]">
                  {c.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{c.name}</span>
                  <span className="block truncate text-[11px] text-[#8b8170]">{c.phone ?? c.email ?? "—"}</span>
                </span>
                {Number(c.points) > 0 && (
                  <span className="tnum shrink-0 rounded-md bg-[#d9a441]/12 px-2 py-0.5 text-[10.5px] font-bold text-[#e8bd68]">
                    ★ {Number(c.points).toLocaleString("en-IN")}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setCustCreateOpen(true);
          }}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d9a441]/35 text-[12px] font-black uppercase tracking-wide text-[#e8bd68] transition hover:bg-[#d9a441]/10"
        >
          <UserRoundPlus className="h-4 w-4" /> New customer
        </button>
      </AurumModal>

      {/* customer quick-create */}
      <AurumModal
        open={custCreateOpen}
        onClose={() => setCustCreateOpen(false)}
        title="New customer"
        subtitle="Name and mobile — the account is created instantly"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[#8b8170]">Name</span>
            <input
              value={custNewName}
              onChange={(e) => setCustNewName(e.target.value)}
              placeholder="e.g. Meera Kapoor"
              autoFocus
              aria-label="Customer name"
              className={cn(fieldCls, "h-11 rounded-xl")}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[#8b8170]">Mobile (10 digits)</span>
            <input
              value={custNewPhone}
              onChange={(e) => setCustNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="98xxxxxx01"
              inputMode="numeric"
              aria-label="Customer mobile"
              className={cn(fieldCls, "tnum h-11 rounded-xl")}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[#8b8170]">Email (optional)</span>
            <input
              value={custNewEmail}
              onChange={(e) => setCustNewEmail(e.target.value)}
              placeholder="meera@example.com"
              type="email"
              aria-label="Customer email"
              className={cn(fieldCls, "h-11 rounded-xl")}
            />
          </label>
          <button
            type="button"
            onClick={() => void quickCreateCustomer()}
            disabled={custNewBusy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e8bd68] via-[#d9a441] to-[#b57e26] text-[13px] font-black uppercase tracking-wide text-[#241a06] transition hover:brightness-105 disabled:opacity-50"
          >
            {custNewBusy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <UserRoundPlus className="h-4.5 w-4.5" />}
            Create & attach
          </button>
        </div>
      </AurumModal>

      {/* ────────── PAYMENT CHECKOUT — the showpiece ────────── */}
      <AurumModal open={payOpen} onClose={() => !busy && setPayOpen(false)} title="Take payment" subtitle={paymentDate} wide>
        {/* amount due band */}
        <div className="mb-4 flex items-end justify-between rounded-2xl border border-[#d9a441]/25 bg-gradient-to-br from-[#d9a441]/12 via-[#d9a441]/5 to-transparent p-4">
          <div>
            <p className="text-[9.5px] font-black uppercase tracking-[0.18em] text-[#a19681]">Amount due</p>
            <p className="tnum font-serif text-[34px] font-black leading-none text-[#e8bd68]">
              ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            {balanceDue > 0 ? (
              <p className="tnum text-[13px] font-black text-[#f5b93e]">Balance {formatINR(balanceDue)}</p>
            ) : changeForCustomer > 0 ? (
              <p className="tnum text-[13px] font-black text-[#5cd69c]">Change {formatINR(changeForCustomer)}</p>
            ) : (
              <p className="flex items-center gap-1.5 text-[13px] font-black text-[#5cd69c]">
                <CircleCheck className="h-4 w-4" /> Fully tendered
              </p>
            )}
            <p className="tnum mt-0.5 text-[10.5px] font-semibold text-[#6b6252]">Tendered {formatINR(tenderSum)}</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
          {/* tenders */}
          <div>
            <div className="space-y-2.5">
              {tenders.map((t, idx) => (
                <div key={idx} className="rounded-2xl border border-[#262017] bg-[#16130e] p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#d9a441]/12 text-[#e8bd68]">
                      {(() => {
                        const M = PAYMENT_METHODS.find((m) => m.value === t.method)?.icon ?? Banknote;
                        return <M className="h-4 w-4" />;
                      })()}
                    </span>
                    <select
                      value={t.method}
                      onChange={(e) => updateTender(idx, { method: e.target.value as PaymentMethod })}
                      aria-label={`Payment method ${idx + 1}`}
                      className="h-10 flex-1 appearance-none rounded-xl border border-[#2b2418] bg-[#100e0a] px-3 text-[12.5px] font-bold text-[#f2ecdf] outline-none transition focus:border-[#d9a441]/55"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={t.amount || ""}
                      onChange={(e) => setTenderFromInput(idx, e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="0"
                      inputMode="decimal"
                      aria-label={`Amount for method ${idx + 1}`}
                      className="tnum h-10 w-24 rounded-xl border border-[#2b2418] bg-[#100e0a] px-3 text-right text-[13.5px] font-black text-[#e8bd68] outline-none transition focus:border-[#d9a441]/55"
                    />
                    <button
                      type="button"
                      onClick={() => setTenderExact(idx)}
                      title="Fill the full balance"
                      className="h-10 shrink-0 rounded-xl border border-[#2b2418] px-2.5 text-[10px] font-black uppercase tracking-wide text-[#8b8170] transition hover:border-[#d9a441]/40 hover:text-[#e8bd68]"
                    >
                      Exact
                    </button>
                    {tenders.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTender(idx)}
                        className="flex h-10 w-9 shrink-0 items-center justify-center rounded-xl text-[#6b6252] transition hover:bg-[#3a1a1a] hover:text-[#f27f82]"
                        aria-label="Remove tender"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {tenders.length < 4 && (
              <button
                type="button"
                onClick={addTender}
                className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#2b2418] text-[11px] font-black uppercase tracking-[0.14em] text-[#8b8170] transition hover:border-[#d9a441]/40 hover:text-[#e8bd68]"
              >
                <Plus className="h-4 w-4" /> Split payment
              </button>
            )}

            {/* options */}
            <label className="mt-3.5 flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#262017] bg-[#16130e] px-3.5 py-3">
              <input
                type="checkbox"
                checked={emailReceipt}
                onChange={(e) => setEmailReceipt(e.target.checked)}
                className="h-4 w-4 accent-[#d9a441]"
              />
              <span className="text-[12px] font-bold">Email the receipt</span>
              <span className="truncate text-[11px] text-[#6b6252]">{customerEmail || "(attach a customer with an email first)"}</span>
            </label>
            <input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Payment note (optional)"
              aria-label="Payment note"
              className={cn(fieldCls, "mt-2.5 h-10 rounded-xl text-[12.5px]")}
            />
          </div>

          {/* numpad + quick cash */}
          <div>
            <div className="grid grid-cols-3 gap-1.5">
              {NUMPAD_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => numpadPress(k)}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-xl border text-[15px] font-black transition active:scale-95",
                    k === "back"
                      ? "border-[#2b2418] text-[#a19681] hover:border-[#e5484d]/40 hover:text-[#f27f82]"
                      : "border-[#2b2418] bg-[#16130e] text-[#f2ecdf] hover:border-[#d9a441]/45 hover:bg-[#1c1710]"
                  )}
                >
                  {k === "back" ? <Delete className="h-4.5 w-4.5" /> : k}
                </button>
              ))}
            </div>
            <p className="mb-1.5 mt-3.5 text-[9.5px] font-black uppercase tracking-[0.16em] text-[#6b6252]">Quick cash</p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_NOTES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setCashBuf(String(n));
                    updateTender(0, { amount: n });
                  }}
                  className="tnum h-9 rounded-xl border border-[#2b2418] bg-[#16130e] text-[12px] font-black text-[#d8cdb9] transition hover:border-[#d9a441]/45 hover:text-[#e8bd68]"
                >
                  ₹{n.toLocaleString("en-IN")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="mt-5 flex gap-2.5 border-t border-dashed border-[#2b2418] pt-4">
          <button
            type="button"
            onClick={() => !busy && setPayOpen(false)}
            className="h-13 shrink-0 rounded-2xl border border-[#2b2418] px-5 text-[12px] font-black uppercase tracking-wide text-[#8b8170] transition hover:text-[#f2ecdf]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void charge(tenders)}
            disabled={busy || balanceDue > 0 || tenderSum <= 0}
            className="flex h-13 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-[#e8bd68] via-[#d9a441] to-[#b57e26] text-[14.5px] font-black uppercase tracking-wide text-[#241a06] shadow-[0_16px_36px_-14px_rgba(217,164,65,0.55)] transition hover:brightness-105 active:scale-[0.99] disabled:from-[#2b2418] disabled:via-[#2b2418] disabled:to-[#2b2418] disabled:text-[#6b6252] disabled:shadow-none"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CircleCheck className="h-5 w-5" strokeWidth={2.4} />}
            {busy ? "Billing…" : `Complete sale · ${formatINR(grandTotal)}`}
          </button>
        </div>
      </AurumModal>

      {/* register: open */}
      <AurumModal open={regOpenOpen} onClose={() => setRegOpenOpen(false)} title="Open the register" subtitle={`Terminal T-${terminalId || "—"} · count the opening float`}>
        <div className="space-y-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[#8b8170]">Opening cash in drawer</span>
            <input
              value={regOpeningBalance}
              onChange={(e) => setRegOpeningBalance(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0"
              inputMode="decimal"
              autoFocus
              aria-label="Opening balance"
              className={cn(fieldCls, "tnum h-14 rounded-2xl text-right text-[24px] font-black text-[#e8bd68]")}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[#8b8170]">Note (optional)</span>
            <input
              value={regOpeningNote}
              onChange={(e) => setRegOpeningNote(e.target.value)}
              placeholder="e.g. Morning shift — Meera"
              aria-label="Opening note"
              className={cn(fieldCls, "h-11 rounded-xl text-[12.5px]")}
            />
          </label>
          <button
            type="button"
            onClick={() => void openRegister()}
            disabled={regBusy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e8bd68] via-[#d9a441] to-[#b57e26] text-[13px] font-black uppercase tracking-wide text-[#241a06] transition hover:brightness-105 disabled:opacity-50"
          >
            {regBusy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <LockOpen className="h-4.5 w-4.5" />}
            Open register
          </button>
        </div>
      </AurumModal>

      {/* register: close */}
      <AurumModal
        open={regCloseOpen}
        onClose={() => setRegCloseOpen(false)}
        title="Count & close"
        subtitle={`Expected in drawer: ${formatINR(registerLive?.expectedCash ?? 0)}`}
      >
        <div className="space-y-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[#8b8170]">Counted cash</span>
            <input
              value={regCounted}
              onChange={(e) => setRegCounted(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0"
              inputMode="decimal"
              autoFocus
              aria-label="Counted balance"
              className={cn(fieldCls, "tnum h-14 rounded-2xl text-right text-[24px] font-black text-[#e8bd68]")}
            />
          </label>
          {regCounted !== "" && registerLive && (
            <p
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] font-bold",
                Math.abs(Number(regCounted) - (registerLive.expectedCash ?? 0)) < 0.01
                  ? "border-[#3dd68c]/30 bg-[#3dd68c]/8 text-[#5cd69c]"
                  : "border-[#f5a623]/30 bg-[#f5a623]/8 text-[#f5b93e]"
              )}
            >
              Variance {formatINR(Number(regCounted) - (registerLive.expectedCash ?? 0))}
            </p>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-[#8b8170]">Closing note (optional)</span>
            <input
              value={regClosingNote}
              onChange={(e) => setRegClosingNote(e.target.value)}
              placeholder="e.g. Evening close"
              aria-label="Closing note"
              className={cn(fieldCls, "h-11 rounded-xl text-[12.5px]")}
            />
          </label>
          <button
            type="button"
            onClick={() => void closeRegister()}
            disabled={regBusy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#e5484d]/40 bg-[#e5484d]/10 text-[13px] font-black uppercase tracking-wide text-[#f27f82] transition hover:bg-[#e5484d]/20 disabled:opacity-50"
          >
            {regBusy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <LockKeyhole className="h-4.5 w-4.5" />}
            Close register
          </button>
        </div>
      </AurumModal>

      {/* thermal receipt */}
      <AurumModal
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title={receiptIsReprint ? "Receipt reprint" : "Sale complete"}
        subtitle={receipt ? receipt.order.orderNumber : ""}
        wide
      >
        {receipt && (
          <div className="flex flex-col items-center gap-4">
            {!receiptIsReprint && (
              <span className="pos-pop flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-[#e8bd68] to-[#b57e26] text-[#241a06]">
                <Check className="h-7 w-7" strokeWidth={3} />
              </span>
            )}
            <ReceiptCard
              receipt={receipt}
              footer={receiptFooter}
              seller={sellerName}
              qr={qrDataUrl}
              reprint={receiptIsReprint}
            />
            <div className="flex w-full gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[#2b2418] text-[12px] font-black uppercase tracking-wide text-[#d8cdb9] transition hover:border-[#d9a441]/40 hover:text-[#e8bd68]"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              {receipt.order && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(receipt.order.orderNumber).then(() => toast.success("Order number copied"));
                  }}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#2b2418] text-[#a19681] transition hover:text-[#f2ecdf]"
                  title="Copy order number"
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setReceipt(null);
                  playPosSound("click");
                }}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e8bd68] via-[#d9a441] to-[#b57e26] text-[12px] font-black uppercase tracking-wide text-[#241a06] transition hover:brightness-105"
              >
                <ShoppingBasket className="h-4 w-4" /> New sale
              </button>
            </div>
          </div>
        )}
      </AurumModal>

      {/* shortcuts */}
      <AurumSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" subtitle="Speed keys for the counter">
        <ul className="space-y-1.5">
          {SHORTCUT_LIST.map((s) => (
            <li key={s.keys} className="flex items-center justify-between rounded-xl border border-[#262017] bg-[#16130e] px-3.5 py-2.5">
              <span className="text-[12.5px] text-[#d8cdb9]">{s.label}</span>
              <kbd className="shrink-0 rounded-md border border-[#2b2418] bg-[#100e0a] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[#e8bd68]">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </AurumSheet>
    </div>
  );
}

/* ══════════════════════ Aurum primitives ══════════════════════ */

function AurumModal({
  open,
  onClose,
  title,
  subtitle,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#070604]/80 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
      <div
        className={cn(
          "pos-slide relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-3xl border border-[#2b2418] bg-[#14110c] shadow-[0_50px_110px_-30px_rgba(0,0,0,0.85)]",
          wide ? "max-w-3xl" : "max-w-md"
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#241e13] px-6 py-4.5">
          <div>
            <h3 className="font-serif text-[18px] font-bold leading-tight text-[#f2ecdf]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[11px] font-semibold text-[#8b8170]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={ghostIcon}
            aria-label="Close dialog"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </header>
        <div className="stellora-scroll min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function AurumSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#070604]/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div className="pos-slide absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-[#2b2418] bg-[#14110c] shadow-[-40px_0_90px_-40px_rgba(0,0,0,0.8)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#241e13] px-5 py-4.5">
          <div>
            <h3 className="font-serif text-[18px] font-bold leading-tight text-[#f2ecdf]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[11px] font-semibold text-[#8b8170]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className={ghostIcon} aria-label="Close drawer">
            <X className="h-4.5 w-4.5" />
          </button>
        </header>
        <div className="stellora-scroll min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/* ══════════════════════ Thermal receipt (white, printable) ══════════════════════ */

function ReceiptCard({
  receipt,
  footer,
  seller,
  qr,
  reprint,
}: {
  receipt: ReceiptData;
  footer: string;
  seller: string;
  qr: string;
  reprint: boolean;
}) {
  const o = receipt.order;
  const taxAmt = taxAmountOf(o);
  const items = o.items ?? [];
  return (
    <div className="pos-receipt w-full max-w-[340px] rounded-2xl bg-white px-6 py-7 font-mono text-[11.5px] leading-relaxed text-black shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
      <div className="text-center">
        <p className="font-serif text-[22px] font-black tracking-wide">STELLORA</p>
        <p className="mt-0.5 text-[9px] uppercase tracking-[0.3em]">Fine Jewellery & Lifestyle</p>
        <p className="mt-2 text-[10px] uppercase tracking-widest text-neutral-500">
          {reprint ? "— Reprint —" : "Counter Sale"}
        </p>
      </div>
      <div className="my-3 border-t border-dashed border-neutral-300" />
      <div className="space-y-0.5 text-[10.5px]">
        <p className="flex justify-between"><span>Bill</span><span className="font-bold">{o.orderNumber}</span></p>
        <p className="flex justify-between"><span>Date</span><span>{formatDateTime(o.createdAt)}</span></p>
        {seller && <p className="flex justify-between"><span>Served by</span><span>{seller}</span></p>}
      </div>
      <div className="my-3 border-t border-dashed border-neutral-300" />
      <table className="w-full text-[10.5px]">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-wider text-neutral-500">
            <th className="pb-1">Item</th>
            <th className="pb-1 text-center">Qty</th>
            <th className="pb-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="align-top">
              <td className="py-1 pr-2">
                {it.productName}
                <span className="block text-[9px] text-neutral-500">
                  {it.variantName} · {it.sku}
                </span>
              </td>
              <td className="py-1 text-center">{it.quantity}</td>
              <td className="py-1 text-right">₹{Number(it.lineTotal).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="my-3 border-t border-dashed border-neutral-300" />
      <div className="space-y-0.5 text-[10.5px]">
        <p className="flex justify-between"><span>Subtotal</span><span>₹{Number(o.subtotal).toFixed(2)}</span></p>
        {Number(o.discountTotal) > 0 && (
          <p className="flex justify-between"><span>Discount</span><span>−₹{Number(o.discountTotal).toFixed(2)}</span></p>
        )}
        {taxAmt > 0 && (
          <p className="flex justify-between">
            <span>Tax{receipt.taxPercent ? ` @ ${receipt.taxPercent}%` : ""}</span>
            <span>₹{taxAmt.toFixed(2)}</span>
          </p>
        )}
        {Number(o.shippingFee) > 0 && (
          <p className="flex justify-between"><span>Shipping</span><span>₹{Number(o.shippingFee).toFixed(2)}</span></p>
        )}
        <p className="mt-1.5 flex justify-between border-t border-neutral-300 pt-1.5 text-[13px] font-black">
          <span>TOTAL</span>
          <span>₹{Number(o.grandTotal).toFixed(2)}</span>
        </p>
        <p className="flex justify-between"><span>Paid ({methodLabel(receipt.method)})</span><span>₹{receipt.paidAmount.toFixed(2)}</span></p>
        {receipt.changeDue > 0 && (
          <p className="flex justify-between font-bold"><span>Change due</span><span>₹{receipt.changeDue.toFixed(2)}</span></p>
        )}
        {receipt.pointsEarned > 0 && (
          <p className="flex justify-between text-[10px]"><span>Loyalty points earned</span><span>★ {receipt.pointsEarned}</span></p>
        )}
      </div>
      {qr && (
        <div className="mt-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Invoice QR" className="mx-auto h-24 w-24" />
          <p className="mt-1 text-[8px] uppercase tracking-[0.28em] text-neutral-500">Invoice QR</p>
        </div>
      )}
      <div className="mt-3 border-t border-dashed border-neutral-300 pt-2 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em]">Thank you · Visit again</p>
        {footer && <p className="mt-1 whitespace-pre-line text-[9px] leading-snug text-neutral-600">{footer}</p>}
      </div>
    </div>
  );
}
