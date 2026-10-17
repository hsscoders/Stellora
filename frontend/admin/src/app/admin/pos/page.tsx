"use client";

/**
 * Stellora Point of Sale — premium register (Stocky / Shopify POS grade).
 *
 * Layout: full-screen kiosk (AdminShell steps aside for /admin/pos).
 *   ┌──────────────────────── register bar: outlet, live day strip, utilities
 *   ├───────────────┬─────────────────────────────────────────────
 *   │  CART (42%)   │  CATALOG (search, category chips, grid, pager)
 *   └───────────────┴─────────────────────────────────────────────
 * Mobile (<lg): bottom tab bar [Browse | Cart(n)] + sticky pay button.
 *
 * Every wire payload below is copied verbatim from the previous POS build
 * (same paths, same field names, same localStorage/sessionStorage formats)
 * so existing held bills, drafts and terminal ids keep working.
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowUpDown,
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  CreditCard,
  Delete,
  HandCoins,
  History,
  Home,
  Keyboard,
  Landmark,
  Loader2,
  LockKeyhole,
  LockOpen,
  Maximize2,
  Minus,
  Package,
  PackageOpen,
  Pause,
  Percent,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  ScanLine,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  { value: "CARD", label: "Credit Card", icon: CreditCard },
  { value: "UPI", label: "UPI", icon: Smartphone },
  { value: "BANK", label: "Bank Transfer", icon: Landmark },
  { value: "WALLET", label: "Wallet", icon: Wallet },
  { value: "CHEQUE", label: "Cheque", icon: ReceiptText },
  { value: "OTHER", label: "Other", icon: CircleAlert },
];

const QUICK_NOTES = [10, 20, 50, 100, 200, 500, 2000];

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

const BRAND = {
  solid: "bg-primary hover:bg-primary/90 text-white",
  soft: "bg-accent text-accent-foreground",
  ring: "focus-visible:ring-primary/30",
};

const iconBtn =
  "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

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
  const [dense, setDense] = useState(false);

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

  /* Signed-in cashier name for the receipt's "Seller" line (Stocky parity). */
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
      // sessionStorage reads are effect-only by definition; batched state
      // updates here restore the per-window bill exactly once on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // refreshRegister resolves async; the rule can't see through it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hydrated && terminalId) void refreshRegister(terminalId);
  }, [hydrated, terminalId, refreshRegister]);

  /* ---------------------- live feed — real-time updates ----------------------
     Polls /admin/pos/live every few seconds while the tab is visible. One
     call carries: changed variant stocks (from StockMovement), today's
     business strip, and the live cash-register state. Stock drops made by
     the website, another counter, or an inventory adjust land here within
     seconds — catalog tiles, the open bill and the register chip all follow. */
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
    // fetchRecent resolves async; the rule can't see through it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (recentOpen) void fetchRecent();
  }, [recentOpen, fetchRecent]);

  /* Invoice QR for the thermal receipt (Stocky prints one under "INVOICE QR"). */
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

  /* Payment dialog helpers — Stocky-style checkout */

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
     press Enter. Capture those keystrokes even when no input is focused, so
     the cashier can keep working without clicking back into a field. */
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
        // still allow the shortcuts from fields except while typing text
        if (action !== "focusSearch" && (t as HTMLInputElement).type === "text") return;
      }
      e.preventDefault();
      kbActionsRef.current[action]();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Camera scanning via the native BarcodeDetector API (Chrome/Edge).
     Graceful fallback: browsers without it just show a hint — USB scanners
     and typed SKUs work everywhere. The stream is fully released on close. */
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  /* Numbered pagination window (Stocky-style page chips) — max 7 buttons. */
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-[13px] text-foreground">
      {/* print: only the receipt is visible on paper + tiny page-local motion */}
      <style>{`@media print{body *{visibility:hidden}.pos-receipt,.pos-receipt *{visibility:visible}.pos-receipt{position:absolute;inset:0;background:#fff;color:#000}}
@keyframes posPulse{0%{opacity:.3}100%{opacity:1}}.pos-pulse{animation:posPulse .9s ease-out both}
@keyframes posPop{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}.pos-pop{animation:posPop .35s cubic-bezier(.2,1.4,.4,1) both}`}</style>

      {/* ============ TOP REGISTER BAR ============ */}
      <header className="stellora-scroll flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-3">
        {/* brand tile — back to admin */}
        <button
          type="button"
          onClick={() => router.push("/admin")}
          title="Back to admin dashboard"
          aria-label="Back to admin dashboard"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary font-serif text-lg font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          S
        </button>

        {/* register status pill — OPEN (count + close) / CLOSED (open with float) */}
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
          aria-label={
            registerSession ? "Register is open — count and close" : "Register is closed — open the register"
          }
          className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            registerSession
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
              : "border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
          }`}
          title={
            registerSession
              ? `Register OPEN since ${formatDateTime(registerSession.openedAt)} — click to count and close`
              : "Register CLOSED — click to open with an opening float"
          }
        >
          <span className="text-[12.5px] font-semibold">Register</span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
              registerSession ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", registerSession ? "bg-emerald-200" : "bg-rose-200")} />
            {registerSession ? "OPEN" : "CLOSED"}
          </span>
          {registerSession && registerLive && (
            <span className="tnum rounded-md bg-card/80 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              {formatINR(registerLive.expectedCash)}
            </span>
          )}
        </button>

        {/* outlet / terminal chip */}
        <span
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-primary/25 bg-accent px-3 text-accent-foreground"
          title="Selling outlet for this terminal"
        >
          <Store className="h-4 w-4" />
          <span className="leading-tight">
            <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-primary/70">Outlet</span>
            <span className="block text-[11px] font-semibold">Stellora Flagship · T-{terminalId}</span>
          </span>
        </span>

        {/* TODAY strip — live business pulse (IST day, refreshes with the feed) */}
        {today && (
          <span
            className="hidden h-10 shrink-0 items-center gap-3 rounded-lg border border-border bg-card px-3 md:inline-flex"
            title="Today's business (IST) — updates live"
          >
            <span className="leading-tight">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Today · Bills</span>
              <span key={`b-${today.orders}`} className="pos-pulse tnum block text-[11px] font-bold">
                {today.orders}
              </span>
            </span>
            <span className="h-5 w-px bg-border" />
            <span className="leading-tight">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Sales</span>
              <span key={`r-${today.revenue}`} className="pos-pulse tnum block text-[11px] font-bold text-primary">
                {formatINR(today.revenue)}
              </span>
            </span>
            <span className="h-5 w-px bg-border" />
            <span className="leading-tight">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Items</span>
              <span key={`i-${today.itemsSold}`} className="pos-pulse tnum block text-[11px] font-bold">
                {today.itemsSold}
              </span>
            </span>
            {registerSession && registerLive && (
              <>
                <span className="h-5 w-px bg-border" />
                <span className="leading-tight">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Expected cash</span>
                  <span key={`c-${registerLive.expectedCash}`} className="pos-pulse tnum block text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    {formatINR(registerLive.expectedCash)}
                  </span>
                </span>
              </>
            )}
          </span>
        )}
        {!today && (
          <span className="hidden h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 md:inline-flex">
            <Skeleton className="h-3 w-40" />
          </span>
        )}

        <span className="min-w-2 flex-1" />

        {/* customer chip — mobile-first: phone leads */}
        <button
          type="button"
          onClick={openCustPicker}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 transition hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          title="Attach customer — by mobile number"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            {(customerName ?? "W").charAt(0).toUpperCase()}
          </span>
          <span className="leading-tight">
            <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-rose-500 dark:text-rose-400">Customer</span>
            <span className="block max-w-28 truncate text-[11px] font-semibold">
              {customerName ?? "walk-in-customer"}
            </span>
          </span>
          {customerPhone && (
            <span className="tnum rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground/70">
              {customerPhone}
            </span>
          )}
        </button>

        {/* currency chip */}
        <span className="hidden h-10 shrink-0 items-center rounded-lg border border-border bg-muted px-2.5 text-[11px] font-bold text-foreground/80 sm:inline-flex">
          INR ₹
        </span>

        {/* utility cluster */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={iconBtn}
            title="Shortcuts: F2 search · F4 pay · F7 hold · F8 held · F9 refresh"
            aria-label="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            <Keyboard className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Recent sales"
            aria-label="Recent sales"
            onClick={() => {
              playPosSound("click");
              setRecentOpen(true);
            }}
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Print barcode labels"
            aria-label="Print barcode labels"
            onClick={() => {
              playPosSound("click");
              router.push("/admin/barcodes");
            }}
          >
            <Tags className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Open another independent cashier window"
            aria-label="Open another cashier window"
            onClick={() => window.open(window.location.href, "_blank", "noopener")}
          >
            <Plus className="h-4 w-4" />
          </button>

          {/* mute / volume popover — fixed panel escapes the scrolling header */}
          <div className="relative shrink-0">
            <button
              type="button"
              className={iconBtn}
              title={soundOn ? "Mute sounds" : "Unmute sounds"}
              aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
              aria-expanded={volOpen}
              onClick={() => setVolOpen((v) => !v)}
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {volOpen && (
              <>
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setVolOpen(false)}
                />
                <div className="fixed right-2 top-[60px] z-50 w-60 rounded-xl border border-border bg-card p-3 shadow-xl">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Register sounds
                  </p>
                  <label className="mb-3 flex cursor-pointer items-center justify-between text-[12.5px] font-semibold">
                    Beep on actions
                    <input
                      type="checkbox"
                      checked={soundOn}
                      onChange={toggleSound}
                      className="h-4 w-4 accent-primary"
                      aria-label="Enable sounds"
                    />
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    aria-label="Beep volume"
                    onChange={(e) => changeVolume(Number(e.target.value))}
                    className="w-full cursor-pointer accent-primary"
                  />
                  <p className="tnum mt-1 text-[11px] text-muted-foreground">Volume — {Math.round(volume * 100)}%</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2.5 h-8 w-full rounded-lg text-[12px] font-semibold"
                    onClick={() => testPosSound()}
                  >
                    Test sound
                  </Button>
                </div>
              </>
            )}
          </div>

          <button type="button" className={iconBtn} title="Fullscreen" aria-label="Toggle fullscreen" onClick={toggleFullscreen}>
            <Maximize2 className="h-4 w-4" />
          </button>
          <span
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground"
            title={sellerName || "Cashier"}
          >
            {(sellerName || "S").charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      {/* register gate — billing stays visible, charging locks until OPEN */}
      {hydrated && !registerSession && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-800 dark:text-amber-200">
          <LockKeyhole className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 text-[12px] font-semibold">
            Register is closed — open it with today&apos;s float to start billing.
          </p>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-lg bg-emerald-600 px-3 text-[12px] font-bold text-white hover:bg-emerald-600/90"
            onClick={() => setRegOpenOpen(true)}
          >
            <LockOpen className="h-3.5 w-3.5" /> Open register
          </Button>
        </div>
      )}
      {/* ============ BODY — cart (left) / catalog (right) ============ */}
      <div className="flex min-h-0 flex-1">
        {/* ---------- LEFT: current bill ---------- */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col border-border bg-card lg:flex lg:w-[42%] lg:min-w-[380px] lg:max-w-[620px] lg:flex-none lg:border-r",
            mobileTab === "cart" ? "flex" : "hidden"
          )}
        >
          {/* bill header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <span className="leading-tight">
                <span className="block text-[14px] font-bold">Current Bill</span>
                <span className="block text-[11px] text-muted-foreground">
                  {billCount} item{billCount === 1 ? "" : "s"}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-right leading-tight">
                <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Total</span>
                <span className="tnum block text-[15px] font-bold">{formatINR(grandTotal)}</span>
              </span>
              <button
                type="button"
                aria-label="Clear the bill"
                title="Clear the bill"
                disabled={bill.length === 0}
                onClick={clearBill}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 transition hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* lines / empty state */}
          <div className="stellora-scroll min-h-0 flex-1 overflow-y-auto" aria-live="polite">
            {bill.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <ShoppingBasket className="h-8 w-8 text-foreground/25" strokeWidth={1.5} />
                </span>
                <p className="mt-1 text-[14px] font-bold">Scan or tap a product to begin</p>
                <p className="max-w-56 text-[12px] text-muted-foreground">
                  Barcode scanners work anywhere on this screen — or pick items from the catalog.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 px-4">
                {bill.map((l) => (
                  <li key={l.variantId} className="py-3">
                    <div className="flex items-start gap-3">
                      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted">
                        {l.image ? (
                          <Image src={l.image} alt="" width={44} height={44} className="h-full w-full object-contain" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold" title={l.productName}>
                              {l.productName}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              SKU · {l.sku}
                              {l.variantName ? ` · ${l.variantName}` : ""}
                            </p>
                          </div>
                          <p className="tnum shrink-0 text-[13px] font-bold">{formatINR(l.unitPrice * l.quantity)}</p>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <div className="flex items-center rounded-lg border border-border">
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-foreground transition hover:bg-muted disabled:opacity-30"
                              disabled={l.quantity <= 1}
                              aria-label={`Decrease quantity of ${l.productName}`}
                              onClick={() => changeQty(l.variantId, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="tnum w-8 text-center text-[12px] font-bold">{l.quantity}</span>
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted-foreground transition hover:bg-muted disabled:opacity-30"
                              disabled={l.quantity >= l.stock}
                              aria-label={`Increase quantity of ${l.productName}`}
                              onClick={() => changeQty(l.variantId, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="text-[11px] text-muted-foreground">×</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="decimal"
                            value={l.unitPrice}
                            aria-label={`Unit price of ${l.productName}`}
                            onChange={(e) => editLinePrice(l.variantId, Number(e.target.value))}
                            className="tnum h-8 w-16 rounded-lg border border-transparent bg-muted px-1.5 text-[11.5px] transition hover:border-border focus:border-primary/60 focus:bg-card focus:outline-none"
                          />
                          {l.variants && l.variants.length > 1 && (
                            <select
                              aria-label={`Switch variant of ${l.productName}`}
                              value={l.variantId}
                              onChange={(e) => {
                                const opt = l.variants?.find((v) => v.id === e.target.value);
                                if (opt) swapVariant(l.variantId, opt);
                              }}
                              className="h-8 max-w-36 rounded-lg border border-border bg-muted px-1.5 text-[11px] font-medium outline-none transition focus:border-primary/60"
                            >
                              {l.variants.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name} · {formatINR(v.price)}
                                </option>
                              ))}
                            </select>
                          )}
                          <span className="min-w-2 flex-1" />
                          <button
                            type="button"
                            aria-label={`Add a note to ${l.productName}`}
                            title="Line note"
                            onClick={() =>
                              setNoteEdit(
                                noteEdit?.variantId === l.variantId
                                  ? null
                                  : { variantId: l.variantId, draft: l.note ?? "" }
                              )
                            }
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-lg transition",
                              noteEdit?.variantId === l.variantId || l.note
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <ReceiptText className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${l.productName} from bill`}
                            title="Remove line"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                            onClick={() => {
                              playPosSound("remove");
                              setBill(bill.filter((x) => x.variantId !== l.variantId));
                            }}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {l.note && noteEdit?.variantId !== l.variantId && (
                          <p className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-300">
                            <span className="font-bold uppercase tracking-wide">Note</span>
                            <span className="truncate">{l.note}</span>
                          </p>
                        )}
                        {noteEdit?.variantId === l.variantId && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <Input
                              value={noteEdit.draft}
                              onChange={(e) => setNoteEdit({ variantId: l.variantId, draft: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  setLineNote(l.variantId, noteEdit.draft);
                                  setNoteEdit(null);
                                }
                              }}
                              placeholder="Line note — gift wrap, engraving, size remark…"
                              aria-label={`Note for ${l.productName}`}
                              autoFocus
                              className="h-8 rounded-lg text-[12px]"
                            />
                            <Button
                              type="button"
                              size="sm"
                              className={cn("h-8 shrink-0 rounded-lg px-3 text-[11.5px] font-semibold", BRAND.solid)}
                              onClick={() => {
                                setLineNote(l.variantId, noteEdit.draft);
                                setNoteEdit(null);
                              }}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0 rounded-lg px-3 text-[11.5px] font-semibold"
                              onClick={() => setNoteEdit(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* adjustments — Tax % / Discount / Shipping, summary, coupon, grand total */}
          <div className="stellora-scroll max-h-[42vh] shrink-0 space-y-2.5 overflow-y-auto border-t border-border/60 bg-muted/60 px-4 py-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="pos-tax" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tax %
                </Label>
                <div className="relative">
                  <Input
                    id="pos-tax"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    inputMode="decimal"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                    placeholder="0"
                    className="h-9 rounded-lg border-border bg-card pr-7 text-[12px]"
                  />
                  <Percent className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                </div>
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="pos-discount" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Bill discount
                </Label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => switchDiscountMode(discountMode === "flat" ? "pct" : "flat")}
                    aria-label={discountMode === "flat" ? "Switch discount to percent" : "Switch discount to flat amount"}
                    title={discountMode === "flat" ? "Flat ₹ — switch to %" : "Percent — switch to flat ₹"}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-[13px] font-bold text-primary transition hover:border-primary/50"
                  >
                    {discountMode === "flat" ? "₹" : "%"}
                  </button>
                  <Input
                    id="pos-discount"
                    type="number"
                    min={0}
                    max={discountMode === "pct" ? 100 : undefined}
                    step={discountMode === "pct" ? 0.5 : 1}
                    inputMode="decimal"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder={discountMode === "pct" ? "0%" : "₹ 0"}
                    className="h-9 min-w-0 flex-1 rounded-lg border-border bg-card text-[12px]"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Quick</span>
              <button
                type="button"
                onClick={() => {
                  switchDiscountMode("pct");
                  setDiscount("5");
                }}
                className="tnum rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                5%
              </button>
              <button
                type="button"
                onClick={() => {
                  switchDiscountMode("pct");
                  setDiscount("10");
                }}
                className="tnum rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                10%
              </button>
              <button
                type="button"
                onClick={() => {
                  switchDiscountMode("flat");
                  setDiscount("100");
                }}
                className="tnum rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                ₹100
              </button>
              <button
                type="button"
                onClick={() => {
                  switchDiscountMode("flat");
                  setDiscount("500");
                }}
                className="tnum rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                ₹500
              </button>
            </div>
            {discountInvalid && (
              <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                Discount cannot exceed the subtotal ({formatINR(subtotal)}).
              </p>
            )}
            <div className="space-y-1 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tnum font-semibold">{formatINR(subtotal)}</span>
              </div>
              {appliedDiscount > 0 && (
                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                  <span>
                    Discount
                    {discountMode === "pct" && billDiscount > 0 ? ` (${discount}%)` : ""}
                    {appliedCoupon ? ` · ${appliedCoupon.code}` : ""}
                  </span>
                  <span className="tnum font-semibold">−{formatINR(appliedDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tnum font-semibold">{formatINR(taxTotal)}</span>
              </div>
              {shippingNum > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="tnum font-semibold">{formatINR(shippingNum)}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyCoupon();
                  }
                }}
                placeholder={appliedCoupon ? appliedCoupon.code : "PROMO CODE"}
                aria-label="Promo code"
                disabled={bill.length === 0}
                className="h-9 min-w-0 flex-1 rounded-lg border-border bg-card text-[11px] uppercase tracking-wide placeholder:text-muted-foreground/70"
              />
              {appliedCoupon ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 rounded-lg border-rose-500/40 px-4 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                  onClick={removeCoupon}
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={couponBusy || bill.length === 0 || !couponCode.trim()}
                  className={cn("h-9 shrink-0 rounded-lg px-5 text-[12px] font-semibold", BRAND.solid)}
                  onClick={() => void applyCoupon()}
                >
                  {couponBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                </Button>
              )}
            </div>
            {appliedCoupon && (
              <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <Ticket className="h-3.5 w-3.5 shrink-0" />
                {appliedCoupon.code} saves {formatINR(couponDiscount)}
              </p>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Total Payable</span>
              <span className="tnum text-[22px] font-extrabold leading-none">{formatINR(grandTotal)}</span>
            </div>
          </div>

          {/* actions row — sync chip, home, reset, hold, held bills */}
          <div className="flex shrink-0 items-center gap-1.5 border-t border-border/60 px-3 py-2">
            <span className="hidden items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 xl:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online · synced
            </span>
            <button
              type="button"
              className={cn(iconBtn, "h-9 w-9")}
              title="Admin home"
              aria-label="Admin home"
              onClick={() => router.push("/admin")}
            >
              <Home className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(iconBtn, "h-9 w-9")}
              title="Reset this bill"
              aria-label="Reset this bill"
              disabled={bill.length === 0}
              onClick={() => {
                if (bill.length === 0) return;
                playPosSound("remove");
                resetBill();
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground/80 transition hover:border-primary/40 hover:text-primary disabled:opacity-40"
              disabled={bill.length === 0}
              onClick={holdBill}
              title="Hold bill (F7)"
            >
              <Pause className="h-3.5 w-3.5" /> Hold
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground/80 transition hover:border-primary/40 hover:text-primary"
              onClick={() => {
                playPosSound("click");
                setHeldOpen(true);
              }}
              title="Held bills (F8)"
            >
              <History className="h-3.5 w-3.5" /> Held
              <span
                className={cn(
                  "tnum inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                  held.length > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {held.length}
              </span>
            </button>
          </div>

          {/* sticky bottom — customer selector + huge pay button */}
          <div className="shrink-0 space-y-2 border-t border-border bg-card px-3 pb-2 pt-2.5">
            <button
              type="button"
              onClick={openCustPicker}
              className="flex w-full items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-left transition hover:border-primary/40 hover:bg-accent"
              title="Attach customer — search by mobile number or create instantly"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                {(customerName ?? "W").charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Customer{customerPoints !== null && customerPoints > 0 ? " · loyalty" : ""}
                </span>
                <span className="block truncate text-[12.5px] font-semibold">{customerName ?? "Walk-in customer"}</span>
              </span>
              {customerPhone && (
                <span className="tnum shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground/70">
                  {customerPhone}
                </span>
              )}
              {customerPoints !== null && customerPoints > 0 && (
                <span className="tnum shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
                  {customerPoints} pts
                </span>
              )}
              <UserRoundPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            <Button
              type="button"
              disabled={busy || bill.length === 0 || discountInvalid || !registerSession}
              onClick={openPaymentDialog}
              title={!registerSession ? "Open the register first" : "Charge the bill (F4)"}
              className={cn("h-12 w-full rounded-xl text-[15px] font-bold shadow-md shadow-primary/20", BRAND.solid)}
            >
              <Check className="h-5 w-5" strokeWidth={3} />
              Pay {formatINR(grandTotal)} · {billCount} item{billCount === 1 ? "" : "s"}
            </Button>
          </div>
        </section>

        {/* ---------- RIGHT: catalog ---------- */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col bg-background lg:flex",
            mobileTab === "browse" ? "flex" : "hidden"
          )}
        >
          {/* scan / search bar — one field: typing filters the grid live; a
              scanner's Enter (or the Scan button) bills the code */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2 transition-colors",
              scanFlash === "err" && "bg-rose-500/10",
              scanFlash === "ok" && "bg-emerald-500/10"
            )}
          >
            <div className="relative min-w-0 flex-1">
              <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={scanRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = query;
                    if (!v.trim()) return;
                    setQuery("");
                    void handleScan(v);
                  }
                }}
                placeholder="Scan or search — code, SKU or product name"
                aria-label="Barcode scanner and product search"
                autoComplete="off"
                autoFocus
                className="h-10 rounded-lg border-border bg-muted pl-9 pr-9 text-[12.5px] focus-visible:border-primary/60 focus-visible:bg-card"
              />
              {refreshing && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 rounded-lg border-border px-3 text-[12px] font-semibold text-foreground/80 hover:border-primary/40 hover:text-primary"
              onClick={() => {
                playPosSound("click");
                setCamOpen(true);
              }}
              title="Scan with the camera"
            >
              <ScanLine className="h-4 w-4" /> Scan
            </Button>
          </div>

          {/* category chips — horizontal scroll */}
          <div className="stellora-scroll flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border/60 px-3 py-2">
            <button
              type="button"
              aria-pressed={catFilter === ""}
              onClick={() => {
                setCatFilter("");
                playPosSound("click");
              }}
              className={cn(
                "h-8 shrink-0 rounded-full px-3.5 text-[12px] font-semibold transition",
                catFilter === ""
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
              )}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={catFilter === c.slug}
                onClick={() => {
                  setCatFilter(c.slug);
                  playPosSound("click");
                }}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3.5 text-[12px] font-semibold transition",
                  catFilter === c.slug
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* filter + sort row */}
          <div className="flex shrink-0 items-center gap-1.5 px-3 py-2">
            <button
              type="button"
              aria-pressed={inStockOnly}
              onClick={() => {
                setInStockOnly((v) => !v);
                setOutOnly(false);
              }}
              className={cn(
                "h-8 rounded-full px-3 text-[11.5px] font-semibold transition",
                inStockOnly
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-300"
              )}
            >
              In stock
            </button>
            <button
              type="button"
              aria-pressed={outOnly}
              onClick={() => {
                setOutOnly((v) => !v);
                setInStockOnly(false);
              }}
              className={cn(
                "h-8 rounded-full px-3 text-[11.5px] font-semibold transition",
                outOnly
                  ? "bg-rose-600 text-white shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
              )}
            >
              Out
            </button>
            <span className="min-w-2 flex-1" />
            <span className="hidden items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 sm:flex" title="Toggle grid density">
              <button
                type="button"
                aria-pressed={!dense}
                aria-label="Comfortable grid (3 columns)"
                onClick={() => setDense(false)}
                className={cn(
                  "tnum flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold transition",
                  !dense ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                3
              </button>
              <button
                type="button"
                aria-pressed={dense}
                aria-label="Dense grid (4 columns)"
                onClick={() => setDense(true)}
                className={cn(
                  "tnum flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold transition",
                  dense ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                4
              </button>
            </span>
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                aria-label="Sort products"
                className="h-8 max-w-36 rounded-lg border border-border bg-card pl-8 pr-2 text-[11.5px] font-medium text-foreground outline-none transition focus:border-primary/60"
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="stock">Stock: high first</option>
              </select>
            </div>
          </div>

          {/* product grid */}
          <div className="stellora-scroll min-h-0 flex-1 overflow-y-auto p-3">
            {products === null ? (
              <div className={cn("grid grid-cols-2 gap-3", dense ? "md:grid-cols-4 2xl:grid-cols-5" : "md:grid-cols-3 2xl:grid-cols-4")}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-2.5">
                    <Skeleton className="mb-2 h-24 w-full rounded-lg" />
                    <Skeleton className="mb-1.5 h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : prodFailed ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <PackageOpen className="h-12 w-12 text-foreground/15" strokeWidth={1.5} />
                <p className="text-[13px] font-semibold text-muted-foreground">Could not load products</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-lg text-[12px] font-semibold"
                  onClick={() => void fetchProducts(1, query, catFilter)}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : !visibleProducts || visibleProducts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <PackageOpen className="h-12 w-12 text-foreground/15" strokeWidth={1.5} />
                <p className="text-[13px] font-semibold text-muted-foreground">No products found</p>
                <p className="text-[11px] text-muted-foreground">Try a different search term or category.</p>
              </div>
            ) : (
              <div className={cn("grid grid-cols-2 gap-3", dense ? "md:grid-cols-4 2xl:grid-cols-5" : "md:grid-cols-3 2xl:grid-cols-4")}>
                {visibleProducts.map((p) => {
                  const active = p.variants.filter((v) => v.isActive);
                  const stock = active.reduce((s, v) => s + v.stock, 0);
                  const lowest = active.reduce<ApiVariant | null>(
                    (m, v) => (!m || Number(v.price) < Number(m.price) ? v : m),
                    null
                  );
                  const price = lowest ? Number(lowest.price) : 0;
                  const compareAt = lowest?.compareAtPrice != null ? Number(lowest.compareAtPrice) : 0;
                  const dealPct = compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : 0;
                  const out = stock === 0;
                  const low = !out && stock <= 3;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out}
                      onClick={() => handleProductClick(p)}
                      aria-label={out ? `${p.name} — out of stock` : `Add ${p.name} to bill`}
                      className={cn(
                        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        out && "cursor-not-allowed opacity-45"
                      )}
                    >
                      <div className="relative flex h-24 items-center justify-center overflow-hidden bg-muted p-2">
                        <Image
                          src={p.images[0]?.url ?? "/images/placeholder.svg"}
                          alt=""
                          fill
                          sizes="(max-width: 768px) 45vw, 220px"
                          className="object-contain transition duration-300 group-hover:scale-105"
                        />
                        {dealPct > 0 && (
                          <span className="tnum absolute left-1.5 top-1.5 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                            −{dealPct}%
                          </span>
                        )}
                        {out && (
                          <span className="absolute inset-0 flex items-center justify-center bg-card/60 text-[11px] font-bold uppercase tracking-wide text-rose-600">
                            Out of stock
                          </span>
                        )}
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-0.5 p-2.5">
                        <p className="line-clamp-1 text-[12.5px] font-semibold" title={p.name}>
                          {p.name}
                        </p>
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          SKU {active[0]?.sku ?? "—"}
                        </p>
                        <div className="mt-auto flex items-center justify-between pt-1">
                          <span className="tnum text-[13.5px] font-extrabold text-primary">
                            {formatINR(price)}
                          </span>
                          {compareAt > price && (
                            <span className="tnum text-[10.5px] text-muted-foreground line-through">
                              {formatINR(compareAt)}
                            </span>
                          )}
                          <span
                            aria-hidden
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground transition group-hover:bg-primary group-hover:text-primary-foreground"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <span
                            className={cn(
                              "tnum inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                              out
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
                                : low
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            )}
                          >
                            {out ? "Out of stock" : low ? `${stock} left` : `In stock · ${stock}`}
                          </span>
                          {active.length > 1 && (
                            <span className="text-[10px] text-muted-foreground">{active.length} variants</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* pagination footer — Page N / M products + numbered chips */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
            <p className="text-center text-[11px] leading-tight text-muted-foreground">
              <span className="block font-semibold text-foreground">Page {page}</span>
              <span className="tnum">{total} products</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => void fetchProducts(page - 1, query, catFilter)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pageWindow.map((pw, i) =>
                pw === "…" ? (
                  <span key={`e-${i}`} className="px-1 text-[11px] text-muted-foreground">
                    …
                  </span>
                ) : (
                  <button
                    key={pw}
                    type="button"
                    aria-current={pw === page ? "page" : undefined}
                    onClick={() => void fetchProducts(pw, query, catFilter)}
                    className={cn(
                      "tnum flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-[12px] font-bold transition",
                      pw === page
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                        : "border border-border text-foreground/80 hover:border-primary/40 hover:text-primary"
                    )}
                  >
                    {pw}
                  </button>
                )
              )}
              <button
                type="button"
                aria-label="Next page"
                disabled={page >= pages}
                onClick={() => void fetchProducts(page + 1, query, catFilter)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* mobile bottom bar — tab switcher + sticky pay on the cart tab */}
      <nav
        className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
        aria-label="POS sections"
      >
        <button
          type="button"
          aria-pressed={mobileTab === "browse"}
          onClick={() => {
            setMobileTab("browse");
            playPosSound("click");
          }}
          className={cn(
            "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold transition",
            mobileTab === "browse"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border text-muted-foreground"
          )}
        >
          <ScanLine className="h-4 w-4" /> Browse
        </button>
        <button
          type="button"
          aria-pressed={mobileTab === "cart"}
          onClick={() => {
            setMobileTab("cart");
            playPosSound("click");
          }}
          className={cn(
            "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold transition",
            mobileTab === "cart"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border text-muted-foreground"
          )}
        >
          <ShoppingCart className="h-4 w-4" /> Cart
          <span
            className={cn(
              "tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10.5px] font-bold",
              billCount > 0
                ? mobileTab === "cart"
                  ? "bg-primary-foreground/20"
                  : "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {billCount}
          </span>
        </button>
        {mobileTab === "cart" && (
          <Button
            type="button"
            disabled={busy || bill.length === 0 || discountInvalid || !registerSession}
            onClick={openPaymentDialog}
            title={!registerSession ? "Open the register first" : "Charge the bill (F4)"}
            className={cn("h-11 flex-[1.4] rounded-xl text-[13.5px] font-bold", BRAND.solid)}
          >
            <Check className="h-4 w-4" strokeWidth={3} /> Pay {formatINR(grandTotal)}
          </Button>
        )}
      </nav>
      {/* ---------- variant quick-pick (multi-variant products) ---------- */}
      <Dialog open={!!variantPicker} onOpenChange={(o) => !o && setVariantPickerId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{variantPicker?.name}</DialogTitle>
            <DialogDescription>Tap a variant to add it to the bill.</DialogDescription>
          </DialogHeader>
          <div className="stellora-scroll max-h-80 space-y-1.5 overflow-y-auto">
            {variantPicker?.variants
              .filter((v) => v.isActive)
              .map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={v.stock <= 0}
                  onClick={() => {
                    if (variantPicker) addVariant(variantPicker, v);
                    setVariantPickerId(null);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition",
                    v.stock <= 0
                      ? "cursor-not-allowed opacity-40"
                      : "hover:border-primary/60 hover:bg-accent"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{v.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{v.sku}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tnum block font-bold text-primary">{formatINR(Number(v.price))}</span>
                    <span className={cn("tnum block text-[11px]", v.stock <= 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                      {v.stock <= 0 ? "Out of stock" : `${v.stock} in stock`}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- camera scanner ---------- */}
      <Dialog open={camOpen} onOpenChange={setCamOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-4 w-4" /> Camera scanner
            </DialogTitle>
            <DialogDescription>
              Point the camera at a barcode — matched products are added to the bill automatically.
            </DialogDescription>
          </DialogHeader>
          {camSupported ? (
            <div className="overflow-hidden rounded-lg border border-foreground/30 bg-black">
              <video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">
              Camera scanning is not available in this browser (unsupported API or camera permission
              denied). Use a USB barcode scanner or type the SKU instead.
            </p>
          )}
          <Button variant="outline" className="w-full rounded-lg" onClick={() => setCamOpen(false)}>
            Close
          </Button>
        </DialogContent>
      </Dialog>

      {/* ---------- held bills drawer (Stocky "Recent drafts") ---------- */}
      <Sheet open={heldOpen} onOpenChange={setHeldOpen}>
        <SheetContent side="right" className="stellora-scroll w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Held bills
            </SheetTitle>
            <SheetDescription>
              Paused customers wait here — restore any bill to continue billing.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {held.length === 0 ? (
              <p className="rounded-lg border border-dashed border-input p-4 text-center text-sm text-muted-foreground">
                No bills on hold. Press F7 to hold the current bill.
              </p>
            ) : (
              <div className="space-y-1.5">
                {held.map((h) => {
                  const hTotal = h.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
                  return (
                    <div key={h.id} className="rounded-lg border border-border px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold">
                            {h.lines.length} item{h.lines.length === 1 ? "" : "s"} ·{" "}
                            <span className="tnum">{formatINR(hTotal)}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Held at {new Date(h.at).toLocaleTimeString()}
                            {h.customerName ? ` · ${h.customerName}` : ""}
                          </p>
                          {h.note && <p className="truncate text-[11px] text-muted-foreground">{h.note}</p>}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="sm"
                            className={cn("h-8 rounded-lg text-xs", BRAND.solid)}
                            onClick={() => resumeBill(h)}
                          >
                            Restore
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            aria-label="Discard held bill"
                            onClick={() => {
                              playPosSound("remove");
                              setHeld(held.filter((x) => x.id !== h.id));
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ---------- recent sales drawer ---------- */}
      <Sheet open={recentOpen} onOpenChange={setRecentOpen}>
        <SheetContent side="right" className="stellora-scroll w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Recent sales
            </SheetTitle>
            <SheetDescription>Last 8 bills — reprint a receipt or copy its number.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {recentBusy ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <Skeleton className="mb-2 h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : recentErr ? (
              <div className="space-y-3 text-center">
                <p className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">
                  Could not load recent sales.
                </p>
                <Button variant="outline" size="sm" className="h-9 rounded-lg text-[12px] font-semibold" onClick={() => void fetchRecent()}>
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : !recentOrders || recentOrders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-input p-4 text-center text-sm text-muted-foreground">
                No sales yet today — the first bill will appear here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {recentOrders.map((o) => (
                  <div key={o.id} className="rounded-lg border border-border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[13px] font-bold">
                          {o.orderNumber}
                          {o.source === "POS" && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-primary">
                              POS
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {formatDateTime(o.createdAt)} · {o.user?.name ?? "Walk-in customer"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tnum text-[13px] font-bold">{formatINR(Number(o.grandTotal))}</p>
                        <p className="text-[10.5px] text-muted-foreground">
                          {methodLabel(o.payments[0]?.method ?? o.paymentMethod ?? "CASH")}
                          {o.paymentStatus && o.paymentStatus.toUpperCase() !== "PAID" ? ` · ${o.paymentStatus}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 rounded-lg text-[11.5px] font-semibold"
                        onClick={() => {
                          setReceipt(receiptFromOrder(o));
                          setReceiptIsReprint(true);
                          setRecentOpen(false);
                          playPosSound("click");
                        }}
                      >
                        <Printer className="h-3 w-3" /> Reprint
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 rounded-lg text-[11.5px] font-semibold"
                        onClick={() => {
                          const clip = navigator.clipboard;
                          if (clip?.writeText) {
                            clip
                              .writeText(o.orderNumber)
                              .then(() => toast.success("Receipt number copied"))
                              .catch(() => toast.error("Could not copy the receipt number"));
                          } else {
                            toast.error("Clipboard is not available in this browser");
                          }
                        }}
                      >
                        <Copy className="h-3 w-3" /> Copy no.
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ---------- customer quick-picker — mobile-first + counter quick-add ---------- */}
      <Dialog open={custOpen} onOpenChange={setCustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4" /> Attach customer
            </DialogTitle>
            <DialogDescription>
              Search by mobile number — registered customers earn loyalty points.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <UserRoundPlus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={custQuery}
              onChange={(e) => setCustQuery(e.target.value)}
              placeholder="Name, mobile or email…"
              className="rounded-lg pl-9"
              autoFocus
            />
          </div>
          <div className="stellora-scroll max-h-64 space-y-1.5 overflow-y-auto">
            {custHits === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : custHits.length === 0 ? (
              <p className="rounded-lg border border-dashed border-input p-4 text-center text-sm text-muted-foreground">
                No customer found. Add a new customer instantly with the button below.
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
                    playPosSound("click");
                    toast.success(`${c.name} attached — ${c.points} points`);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition hover:border-primary/60 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="tnum block truncate text-[11px] text-muted-foreground">
                      {c.phone ? `+91 ${c.phone}` : c.email || "—"}
                      {c.phone && c.email ? ` · ${c.email}` : ""}
                    </span>
                  </span>
                  <span className="tnum shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                    {c.points} pts
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-[11px] leading-tight text-muted-foreground">
              New customer? Just a name and mobile number — done in 10 seconds.
            </p>
            <Button
              type="button"
              size="sm"
              className={cn("h-9 shrink-0 rounded-lg px-4 text-[12px] font-semibold", BRAND.solid)}
              onClick={() => {
                setCustOpen(false);
                setCustCreateOpen(true);
              }}
            >
              <UserRoundPlus className="h-3.5 w-3.5" /> New customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- quick customer create — name + mobile ---------- */}
      <Dialog open={custCreateOpen} onOpenChange={setCustCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRoundPlus className="h-4 w-4" /> New customer
            </DialogTitle>
            <DialogDescription>
              The account is created instantly — the customer can log in with this mobile number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-new-name">Name</Label>
              <Input
                id="cust-new-name"
                value={custNewName}
                onChange={(e) => setCustNewName(e.target.value)}
                placeholder="Customer's name"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-new-phone">
                Mobile number <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold">
                  +91
                </span>
                <Input
                  id="cust-new-phone"
                  value={custNewPhone}
                  onChange={(e) => setCustNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  placeholder="98765 43210"
                  className="tnum pl-12"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-new-email">
                Email <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="cust-new-email"
                value={custNewEmail}
                onChange={(e) => setCustNewEmail(e.target.value)}
                type="email"
                placeholder="you@example.com"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => setCustCreateOpen(false)}>
                Cancel
              </Button>
              <Button className={cn("h-10 flex-1 rounded-xl", BRAND.solid)} disabled={custNewBusy} onClick={() => void quickCreateCustomer()}>
                {custNewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add customer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Payment checkout — amount-due band, method tiles, cash numpad,
             split tenders, notes, loyalty ===== */}
      <Dialog
        open={payOpen}
        onOpenChange={(o) => {
          if (!o && !busy) setPayOpen(false);
        }}
      >
        <DialogContent className="max-h-[94dvh] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-2xl">
          <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-primary/30 bg-primary px-5 py-4 text-left text-primary-foreground">
            <DialogTitle className="flex items-center gap-2.5 text-[16px] font-bold">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <Wallet className="h-5 w-5" />
              </span>
              Take payment
            </DialogTitle>
            <div className="text-right leading-tight">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-80">Amount due</p>
              <p className="tnum text-[20px] font-extrabold">{formatINR(grandTotal)}</p>
            </div>
            <DialogDescription className="sr-only">
              Take cash, card and UPI in any combination — change is calculated automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="stellora-scroll max-h-[68dvh] space-y-3.5 overflow-y-auto p-5">
            {/* status chips */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-border bg-muted/60 px-2 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Paying</p>
                <p className="tnum text-[14px] font-extrabold text-emerald-700 dark:text-emerald-400">
                  {formatINR(Math.min(tenderSum, grandTotal))}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/60 px-2 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Balance</p>
                <p className={cn("tnum text-[14px] font-extrabold", balanceDue > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                  {formatINR(balanceDue)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/60 px-2 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Change</p>
                <p className="tnum text-[14px] font-extrabold text-sky-600 dark:text-sky-400">
                  {formatINR(changeForCustomer)}
                </p>
              </div>
            </div>

            {/* primary tender — method tiles + amount + cash numpad */}
            <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="flex items-center gap-2 text-[13px] font-bold">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    1
                  </span>
                  {tenders.length > 1 ? "Payment 1" : "Payment"}
                </p>
                {tenders.length > 1 && (
                  <button
                    type="button"
                    aria-label="Remove payment 1"
                    className="rounded-md p-1 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-600"
                    onClick={() => removeTender(0)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* method tiles */}
              <div className="mb-2.5 grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => {
                  const on = tenders[0]?.method === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        updateTender(0, { method: value });
                        setPaymentMethod(value);
                        playPosSound("click");
                      }}
                      className={cn(
                        "relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10.5px] font-semibold transition",
                        on
                          ? "border-primary bg-accent text-primary shadow-sm"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {label}
                      {on && (
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <Check className="h-2.5 w-2.5" strokeWidth={4} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* amount + quick tender chips */}
              <div className="space-y-2">
                <Label htmlFor="tender-amount-0" className="text-[11px] font-semibold text-muted-foreground">
                  Amount tendered
                </Label>
                <Input
                  id="tender-amount-0"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  value={tenders[0]?.amount || ""}
                  onChange={(e) => setTenderFromInput(0, e.target.value)}
                  placeholder="0"
                  aria-label="Amount tendered"
                  className="tnum h-11 rounded-lg text-[18px] font-bold"
                />
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTenderExact(0)}
                    className="tnum rounded-lg border border-primary/30 bg-accent px-2.5 py-1 text-[11px] font-bold text-primary transition"
                  >
                    Exact {formatINR(grandTotal)}
                  </button>
                  {QUICK_NOTES.map((noteAmt) => (
                    <button
                      key={noteAmt}
                      type="button"
                      onClick={() => updateTender(0, { amount: r2((Number(tenders[0]?.amount) || 0) + noteAmt) })}
                      className="tnum rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                    >
                      +{noteAmt}
                    </button>
                  ))}
                </div>

                {/* cash numpad — only for the cash tender */}
                {tenders[0]?.method === "CASH" && (
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {NUMPAD_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-label={k === "back" ? "Delete last digit" : `Type ${k}`}
                        onClick={() => numpadPress(k)}
                        className="tnum flex h-11 items-center justify-center rounded-lg border border-border bg-muted/60 text-[16px] font-bold text-foreground transition hover:border-primary/40 hover:bg-accent active:scale-[0.97]"
                      >
                        {k === "back" ? <Delete className="h-4 w-4" /> : k}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* additional split tenders — compact rows */}
            {tenders.slice(1).map((t, i) => {
              const idx = i + 1;
              return (
                <div key={idx} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-[12.5px] font-bold">
                      <span className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-primary text-[10.5px] font-bold text-primary-foreground">
                        {idx + 1}
                      </span>
                      Payment {idx + 1}
                    </p>
                    <button
                      type="button"
                      aria-label={`Remove payment ${idx + 1}`}
                      className="rounded-md p-1 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-600"
                      onClick={() => removeTender(idx)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={t.method}
                      onChange={(e) => updateTender(idx, { method: e.target.value as PaymentMethod })}
                      aria-label={`Method for payment ${idx + 1}`}
                      className="h-9 w-32 shrink-0 rounded-lg border border-border bg-card px-2 text-[12px] font-medium outline-none focus:border-primary/60"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="decimal"
                      value={t.amount || ""}
                      onChange={(e) => setTenderFromInput(idx, e.target.value)}
                      placeholder="0"
                      aria-label={`Amount for payment ${idx + 1}`}
                      className="tnum h-9 min-w-0 flex-1 rounded-lg text-[13px] font-bold"
                    />
                  </div>
                </div>
              );
            })}

            {/* change hero */}
            {changeForCustomer > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  Change due — return to the customer
                </p>
                <p className="tnum text-[24px] font-extrabold leading-tight text-emerald-700 dark:text-emerald-300">
                  {formatINR(changeForCustomer)}
                </p>
              </div>
            )}
            {balanceDue > 0 && changeForCustomer === 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                {formatINR(balanceDue)} still due — add a split payment or increase the amount.
              </p>
            )}

            {/* add split payment — Stocky's dashed splitter */}
            <button
              type="button"
              disabled={tenders.length >= 4}
              onClick={addTender}
              className="w-full rounded-xl border-2 border-dashed border-primary/40 py-2.5 text-[12.5px] font-bold text-primary transition hover:bg-accent disabled:opacity-40"
            >
              + Add split payment{tenders.length >= 4 ? " (max 4)" : ""}
            </button>

            {/* customer + loyalty */}
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/60 px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                {(customerName ?? "W").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[12.5px] font-semibold">{customerName ?? "Walk-in customer"}</p>
                <p className="truncate text-[10.5px] text-muted-foreground">
                  {customerPoints !== null
                    ? `${customerPoints} loyalty points on this account — this sale earns more`
                    : "Attach a customer by mobile number to earn loyalty points"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-lg text-[11.5px] font-semibold"
                onClick={openCustPicker}
              >
                Change
              </Button>
            </div>

            {/* meta rows */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pay-date" className="text-[11px] font-semibold text-muted-foreground">
                  Payment date
                </Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="tnum h-9 rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pay-notes" className="text-[11px] font-semibold text-muted-foreground">
                  Payment notes
                </Label>
                <Input
                  id="pay-notes"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Add payment note"
                  className="h-9 rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sale-notes" className="text-[11px] font-semibold text-muted-foreground">
                  Sale notes
                </Label>
                <Input
                  id="sale-notes"
                  value={saleNote}
                  onChange={(e) => setSaleNote(e.target.value)}
                  placeholder="Add sale note"
                  className="h-9 rounded-lg"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-border px-3 py-2.5 text-[12px] font-semibold text-foreground/80 transition hover:bg-muted">
                <input
                  type="checkbox"
                  checked={emailReceipt}
                  onChange={(e) => setEmailReceipt(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Send email receipt
                {customerEmail.trim() ? (
                  <span className="ml-auto max-w-24 truncate text-[10px] font-medium text-emerald-600">
                    {customerEmail.trim()}
                  </span>
                ) : (
                  <span className="ml-auto text-[10px] font-medium text-muted-foreground">needs email</span>
                )}
              </label>
            </div>

            <p className="tnum text-right text-[11px] text-muted-foreground">
              Tendered {formatINR(tenderSum)} / {formatINR(grandTotal)}
            </p>
          </div>

          {/* footer */}
          <div className="flex gap-2.5 border-t border-border bg-muted p-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-xl border-input bg-card text-[13px] font-bold text-foreground/80 hover:bg-muted"
              disabled={busy}
              onClick={() => setPayOpen(false)}
            >
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button
              className="h-11 flex-[2] rounded-xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-600/90"
              disabled={busy || balanceDue > 0}
              onClick={() => void charge(tenders)}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Completing…
                </>
              ) : balanceDue > 0 ? (
                `Balance ${formatINR(balanceDue)} left`
              ) : (
                <>
                  <Check className="h-4 w-4" strokeWidth={3} /> Complete payment
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== register: open ===== */}
      <Dialog open={regOpenOpen} onOpenChange={setRegOpenOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="h-4 w-4 text-emerald-600" /> Open register
            </DialogTitle>
            <DialogDescription>
              Terminal T-{terminalId} — count the opening float in the cash drawer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reg-opening">Opening balance (₹)</Label>
              <Input
                id="reg-opening"
                type="number"
                min={0}
                step={1}
                inputMode="decimal"
                value={regOpeningBalance}
                onChange={(e) => setRegOpeningBalance(e.target.value)}
                placeholder="0"
                autoFocus
                className="tnum rounded-lg"
              />
              <div className="flex flex-wrap gap-1.5">
                {[0, 500, 1000, 2000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setRegOpeningBalance(String(amt))}
                    className="tnum rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                  >
                    {amt === 0 ? "No float" : `₹${amt}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-opening-note">Notes (optional)</Label>
              <Input
                id="reg-opening-note"
                value={regOpeningNote}
                onChange={(e) => setRegOpeningNote(e.target.value)}
                placeholder="e.g. morning shift, ₹500 float"
                className="rounded-lg"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => setRegOpenOpen(false)}>
                Cancel
              </Button>
              <Button
                className="h-10 flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-600/90"
                disabled={regBusy}
                onClick={() => void openRegister()}
              >
                {regBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open register"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== register: close (count + variance) ===== */}
      <Dialog open={regCloseOpen} onOpenChange={setRegCloseOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-amber-600" /> Close register
            </DialogTitle>
            <DialogDescription>
              Count the cash in the drawer — the difference is your variance.
            </DialogDescription>
          </DialogHeader>
          {registerSession && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-border bg-muted/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Opening float</p>
                  <p className="tnum font-bold">{formatINR(registerSession.openingBalance)}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatDateTime(registerSession.openedAt)} · {registerSession.openedByName ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Expected in drawer</p>
                  <p className="tnum font-bold text-emerald-600 dark:text-emerald-400">
                    {formatINR(registerLive?.expectedCash ?? registerSession.openingBalance)}
                  </p>
                  {registerLive && (
                    <p className="tnum mt-0.5 text-[10px] text-muted-foreground">
                      cash +{formatINR(registerLive.cashIn)} · change −{formatINR(registerLive.change)}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="reg-counted">Counted cash (₹)</Label>
                  <button
                    type="button"
                    onClick={() => setRegCounted(String(registerLive?.expectedCash ?? ""))}
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-primary transition hover:bg-accent"
                  >
                    Use expected
                  </button>
                </div>
                <Input
                  id="reg-counted"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  value={regCounted}
                  onChange={(e) => setRegCounted(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className="tnum rounded-lg"
                />
                {regCounted !== "" && registerLive && (
                  <p
                    className={cn(
                      "tnum text-xs font-semibold",
                      Number(regCounted) - (registerLive.expectedCash ?? 0) === 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : Number(regCounted) > (registerLive.expectedCash ?? 0)
                          ? "text-sky-600 dark:text-sky-400"
                          : "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    Variance: {Number(regCounted) - (registerLive.expectedCash ?? 0) > 0 ? "+" : ""}
                    {formatINR(Number(regCounted) - (registerLive.expectedCash ?? 0))}
                    {Number(regCounted) - (registerLive.expectedCash ?? 0) === 0 ? " — balanced" : ""}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-close-note">Notes (optional)</Label>
                <Input
                  id="reg-close-note"
                  value={regClosingNote}
                  onChange={(e) => setRegClosingNote(e.target.value)}
                  placeholder="e.g. end of shift"
                  className="rounded-lg"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => setRegCloseOpen(false)}>
                  Cancel
                </Button>
                <Button className="h-10 flex-1 rounded-xl" disabled={regBusy} onClick={() => void closeRegister()}>
                  {regBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close register"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== thermal receipt / sale complete — Stocky style: centered header,
             reference, seller, Paid/Due, Paid-By table, thank-you, INVOICE QR ===== */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="sm:max-w-sm">
          {receipt && !receiptIsReprint && (
            <div className="pos-pop mb-1 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check className="h-5 w-5" strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[14.5px] font-bold text-emerald-800 dark:text-emerald-200">Sale complete</p>
                <p className="truncate text-[11.5px] text-emerald-700/90 dark:text-emerald-300/80">
                  Order {receipt.order.orderNumber} · {methodLabel(receipt.method)}
                  {receipt.pointsEarned > 0 ? ` · +${receipt.pointsEarned} points` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right leading-tight">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-700/80 dark:text-emerald-300/70">
                  {receipt.changeDue > 0 ? "Give change" : "Paid"}
                </p>
                <p className="tnum text-[17px] font-extrabold text-emerald-700 dark:text-emerald-300">
                  {receipt.changeDue > 0 ? formatINR(receipt.changeDue) : formatINR(receipt.paidAmount)}
                </p>
              </div>
            </div>
          )}
          {receipt && receiptIsReprint && (
            <div className="mb-1 flex items-center gap-2.5 rounded-xl border border-border bg-muted/60 px-4 py-2.5">
              <Printer className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-[12.5px] font-semibold text-muted-foreground">
                Receipt preview — reprinting {receipt.order.orderNumber}
              </p>
            </div>
          )}
          <DialogHeader className={cn(receipt && "mt-2 space-y-1")}>
            <DialogTitle className={cn("flex items-center gap-2", receipt && "px-0")}>
              <ReceiptText className="h-4 w-4 text-emerald-600" /> {receiptIsReprint ? "Reprint receipt" : "Receipt"}
            </DialogTitle>
            <DialogDescription>
              {receipt
                ? receiptIsReprint
                  ? "The original bill — print it again any time."
                  : `Order ${receipt.order.orderNumber} has been billed and marked paid.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {receipt && (
            <div className="pos-receipt stellora-scroll max-h-[48vh] overflow-y-auto rounded-xl border border-border bg-white p-5 font-mono text-[11px] leading-relaxed text-black">
              {/* header */}
              <div className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary font-serif text-xl font-bold text-white">
                  S
                </span>
                <p className="mt-1.5 text-[14px] font-bold">Stellora</p>
                <p className="text-[10px]">Reference: {receipt.order.orderNumber}</p>
                <p className="text-[10px]">Date : {formatDateTime(receipt.order.createdAt)}</p>
                {sellerName && <p className="text-[10px]">Seller : {sellerName}</p>}
                <p className="text-[10px]">Customer : {customerName ?? "Walk-In-Customer"}</p>
                {customerPhone && <p className="text-[10px]">Mobile : +91 {customerPhone}</p>}
                <p className="text-[10px]">Outlet : Stellora Flagship</p>
              </div>

              <div className="my-2.5 border-t border-dashed border-slate-400" />

              {/* items — "1.00 Pc X 429.00" like Stocky */}
              <div className="space-y-1.5">
                {receipt.order.items.map((it, idx) => (
                  <div key={`${it.sku}-${idx}`}>
                    <p className="leading-tight">
                      {it.productName}
                      {it.variantName ? ` — ${it.variantName}` : ""}
                    </p>
                    <div className="flex justify-between">
                      <span>
                        {Number(it.quantity).toFixed(2)} Pc X {Number(it.unitPrice).toFixed(2)}
                      </span>
                      <span>{Number(it.lineTotal).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="my-2.5 border-t border-dashed border-slate-400" />

              {/* totals */}
              <div className="space-y-0.5">
                <div className="flex justify-between border-b border-dotted border-slate-400 pb-0.5 font-bold">
                  <span>Subtotal</span>
                  <span>INR {Number(receipt.order.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Order Tax</span>
                  <span>
                    INR {taxAmountOf(receipt.order).toFixed(2)}
                    <span className="block text-right text-[9px]">({receipt.taxPercent.toFixed(2)} %)</span>
                  </span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Discount</span>
                  <span>INR {Number(receipt.order.discountTotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Shipping</span>
                  <span>INR {Number(receipt.order.shippingFee).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-dotted border-slate-400 pb-0.5 font-bold">
                  <span>Total</span>
                  <span>INR {Number(receipt.order.grandTotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Paid</span>
                  <span>INR {receipt.paidAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Due</span>
                  <span>INR {Number(receipt.changeDue).toFixed(2)}</span>
                </div>
              </div>

              {/* paid-by table */}
              <div className="mt-2.5">
                <div className="flex justify-between border-b border-dashed border-slate-400 pb-0.5 font-bold">
                  <span className="w-1/2">Paid By:</span>
                  <span className="w-1/4 text-right">Amount:</span>
                  <span className="w-1/4 text-right">Change:</span>
                </div>
                {receipt.order.payments.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="w-1/2">{i === 0 ? methodLabel(receipt.method) : methodLabel(p.method)}</span>
                    <span className="tnum w-1/4 text-right">{Number(p.amount).toFixed(2)}</span>
                    <span className="tnum w-1/4 text-right">{i === 0 ? receipt.changeDue.toFixed(2) : "0.00"}</span>
                  </div>
                ))}
              </div>

              {receipt.pointsEarned > 0 && (
                <p className="mt-2.5 text-center font-bold text-emerald-700">
                  +{receipt.pointsEarned} Stellora points earned
                </p>
              )}

              <div className="my-2.5 border-t border-dashed border-slate-400" />

              <p className="text-center font-bold">
                Thank You For Shopping With Us .
                <br />
                Please Come Again
              </p>

              {qrDataUrl && (
                <div className="mt-2.5 text-center">
                  <p className="text-[9px] font-bold tracking-widest">INVOICE QR</p>
                  <img src={qrDataUrl} alt="Invoice QR" className="mx-auto mt-1 h-24 w-24" />
                </div>
              )}

              {receiptFooter && (
                <p className="mt-2 whitespace-pre-line text-center text-[9px] leading-relaxed text-slate-500">
                  {receiptFooter}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            {receipt && customerPhone.trim().length === 10 && (
              <Button
                variant="outline"
                className="h-10 flex-1 rounded-xl border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
                title="Send the bill to the customer's WhatsApp"
                onClick={() => {
                  const lines = receipt.order.items
                    .map(
                      (it, i) =>
                        `${i + 1}. ${it.productName}${it.variantName ? ` (${it.variantName})` : ""} — ${Number(it.lineTotal).toFixed(2)}`
                    )
                    .join("\n");
                  const msg = [
                    "*Stellora — Bill*",
                    `Ref: ${receipt.order.orderNumber}`,
                    `Date: ${formatDateTime(receipt.order.createdAt)}`,
                    "",
                    lines,
                    "",
                    `Subtotal: INR ${Number(receipt.order.subtotal).toFixed(2)}`,
                    Number(receipt.order.discountTotal) > 0 ? `Discount: INR ${Number(receipt.order.discountTotal).toFixed(2)}` : "",
                    Number(receipt.order.shippingFee) > 0 ? `Shipping: INR ${Number(receipt.order.shippingFee).toFixed(2)}` : "",
                    `*Total: INR ${Number(receipt.order.grandTotal).toFixed(2)}*`,
                    `Paid via ${methodLabel(receipt.method)}`,
                    receipt.pointsEarned > 0 ? `+${receipt.pointsEarned} Stellora points` : "",
                    "",
                    "Thank you for shopping with Stellora!",
                  ]
                    .filter(Boolean)
                    .join("\n");
                  window.open(`https://wa.me/91${customerPhone.trim()}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
                }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91A9.85 9.85 0 0 0 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.03.24-3.47-.72-2.95-1.16-4.79-4.22-4.94-4.42-.14-.2-1.17-1.56-1.17-2.98 0-1.42.74-2.11 1-2.4.27-.29.58-.37.77-.37.19 0 .39 0 .56.01.19.01.43-.07.67.51.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.19.32-.39.53-.19.22-.29.32-.44.53-.15.19-.31.41-.13.72.19.31.83 1.36 1.77 2.21 1.21 1.08 2.23 1.41 2.55 1.57.31.15.5.13.68-.08.19-.22.8-.93 1.01-1.25.22-.31.43-.26.72-.15.29.1 1.85.87 2.17 1.03.31.15.53.24.6.36.07.15.07.77-.17 1.44Z" />
                </svg>
                WhatsApp
              </Button>
            )}
            <Button
              className={cn("h-10 flex-1 rounded-xl", BRAND.solid)}
              onClick={() => {
                setReceipt(null);
                playPosSound("click");
                scanRef.current?.focus();
                setMobileTab("browse");
              }}
            >
              <Plus className="h-4 w-4" /> New sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- shortcuts help ---------- */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" /> Keyboard shortcuts
            </DialogTitle>
            <DialogDescription>
              Built for the counter — every core action is one key away.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border/60">
            {SHORTCUT_LIST.map((s) => (
              <li key={s.keys} className="flex items-center justify-between gap-3 py-2">
                <span className="text-[12.5px] text-foreground/90">{s.label}</span>
                <kbd className="tnum shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground/80">
                  {s.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
