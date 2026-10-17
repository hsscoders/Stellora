"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  Banknote,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
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
  Pencil,
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
  Ticket,
  Trash2,
  Truck,
  UserRound,
  UserRoundPlus,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";
import { playPosSound, posSoundEnabled, setPosSoundEnabled, unlockAudio, getPosVolume, setPosVolume } from "@/lib/pos-sound";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { formatDateTime, formatINR } from "@/lib/utils";

/* ------------------------------ API shapes ------------------------------ */

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

interface BillLine {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  stock: number;
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
  email: string;
  phone: string | null;
  points: number;
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
  customerName: string | null;
  note: string;
  paymentMethod: PaymentMethod;
  taxPercent: string;
  shippingFee: string;
  couponCode: string;
}

/* POS register UI constants — tile grid, quick-tender notes. */

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

/* All admin XHRs go through the app's basePath so the terminal works BOTH when
   served from the storefront proxy (:3000/admin-console/…) and directly on the
   admin origin (:3001/admin-console/…) — Next only maps /admin-console/api/*. */
const api = (path: string) => `/admin-console${path}`;

const BRAND = {
  solid: "bg-primary hover:bg-primary/90 text-white",
  soft: "bg-accent text-accent-foreground",
  ring: "focus-visible:ring-primary/30",
};

export default function AdminPosPage() {
  const router = useRouter();
  /* catalog */
  const [products, setProducts] = useState<ApiProduct[] | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const seqRef = useRef(0);

  /* bill */
  const [bill, setBill] = useState<BillLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [customerEmail, setCustomerEmail] = useState("");
  const [note, setNote] = useState("");
  /* Stocky-style bill extras: tax %, flat shipping, coupon */
  const [taxPercent, setTaxPercent] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  /* cash register (Stocky-style sessions) */
  const [registerSession, setRegisterSession] = useState<RegisterSession | null>(null);
  const [registerLive, setRegisterLive] = useState<RegisterLive | null>(null);
  const [regOpen, setRegOpen] = useState(false);
  const [regClose, setRegClose] = useState(false);
  const [regOpeningBalance, setRegOpeningBalance] = useState("");
  const [regOpeningNote, setRegOpeningNote] = useState("");
  const [regCounted, setRegCounted] = useState("");
  const [regClosingNote, setRegClosingNote] = useState("");
  const [regBusy, setRegBusy] = useState(false);

  /* Stocky-style payment checkout dialog */
  const [payOpen, setPayOpen] = useState(false);
  const [tenders, setTenders] = useState<Tender[]>([{ method: "CASH", amount: 0 }]);
  const [saleNote, setSaleNote] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [emailReceipt, setEmailReceipt] = useState(false);

  /* customer quick-picker dialog */
  const [custOpen, setCustOpen] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [custHits, setCustHits] = useState<CustomerHit[] | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);

  /* catalog category filter */
  const [categories, setCategories] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [catFilter, setCatFilter] = useState(""); // category slug

  /* dialogs */
  const [variantPicker, setVariantPicker] = useState<ApiProduct | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [receiptFooter, setReceiptFooter] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  /* scanner + terminal + sounds + held bills */
  const [terminalId, setTerminalId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [scanFlash, setScanFlash] = useState<"ok" | "err" | null>(null);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [camSupported, setCamSupported] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(0.9);
  const scanRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camTimerRef = useRef<number | null>(null);
  const scanSeq = useRef(0);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

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
      } else {
        setProducts([]);
        toast.error(json.error?.message ?? "Could not load products");
      }
    } catch {
      if (seq === seqRef.current) {
        setProducts([]);
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

  /* Categories for the catalog filter dropdown (Stocky "All Categories") */
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
     side by side without overwriting each other. */
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
          setNote(typeof p.note === "string" ? p.note : "");
          if (typeof p.paymentMethod === "string") setPaymentMethod(p.paymentMethod as PaymentMethod);
          if (typeof p.taxPercent === "string") setTaxPercent(p.taxPercent);
          if (typeof p.shippingFee === "string") setShippingFee(p.shippingFee);
          if (typeof p.couponCode === "string") setCouponCode(p.couponCode);
          if (p.customerName) setCustomerName(p.customerName);
        }
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
        JSON.stringify({ lines: bill, discount, customerEmail, customerName, note, paymentMethod, taxPercent, shippingFee, couponCode })
      );
    } catch {}
  }, [bill, discount, customerEmail, customerName, note, paymentMethod, taxPercent, shippingFee, couponCode, hydrated, terminalId]);

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

  /* Keyboard shortcuts (Stocky-style): F2 search, F4 pay, F7 hold, F8 held
     bills. Refs keep the listener stable across renders. */
  const kbActionsRef = useRef({
    focusSearch: () => {},
    pay: () => {},
    hold: () => {},
    held: () => {},
  });
  useEffect(() => {
    kbActionsRef.current = {
      focusSearch: () => scanRef.current?.focus(),
      pay: () => openPaymentDialog(),
      hold: () => holdBill(),
      held: () => setHeldOpen(true),
    };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, keyof typeof kbActionsRef.current> = {
        F2: "focusSearch",
        F4: "pay",
        F7: "hold",
        F8: "held",
      };
      const action = map[e.key];
      if (!action) return;
      const t = e.target as HTMLElement | null;
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

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        toast.error("Fullscreen is blocked by the browser");
      });
    }
  }

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

  /* ------------------------------ bill logic ------------------------------ */

  const subtotal = useMemo(
    () => bill.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [bill]
  );
  const discountNum = Math.round(Math.max(Number(discount) || 0, 0) * 100) / 100;
  const couponDiscount = appliedCoupon ? Math.min(appliedCoupon.discount, subtotal) : 0;
  const appliedDiscount = Math.min(discountNum + couponDiscount, subtotal);
  const discountInvalid = discountNum + couponDiscount > subtotal;
  const payableSubtotal = Math.max(subtotal - appliedDiscount, 0);
  const taxNum = Math.max(Math.min(Number(taxPercent) || 0, 100), 0);
  const taxTotal = Math.round(payableSubtotal * taxNum) / 100;
  const shippingNum = Math.max(Number(shippingFee) || 0, 0);
  const grandTotal = Math.max(Math.round((payableSubtotal + taxTotal + shippingNum) * 100) / 100, 0);
  const billCount = bill.reduce((n, l) => n + l.quantity, 0);

  function editLinePrice(variantId: string, price: number) {
    const line = bill.find((l) => l.variantId === variantId);
    if (!line) return;
    if (!Number.isFinite(price) || price < 0) return;
    const clamped = Math.min(price, 999999);
    setBill(bill.map((l) => (l.variantId === variantId ? { ...l, unitPrice: clamped } : l)));
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
      setVariantPicker(p);
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

  function holdBill() {
    if (bill.length === 0) return;
    const h: HeldBill = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      lines: bill,
      discount,
      customerEmail,
      customerName,
      note,
      paymentMethod,
      taxPercent,
      shippingFee,
      couponCode,
    };
    setHeld([h, ...held].slice(0, 12));
    playPosSound("click");
    resetBill();
    toast.success("Bill held — start the next customer");
  }

  function resumeBill(h: HeldBill) {
    setBill(h.lines);
    setDiscount(h.discount);
    setCustomerEmail(h.customerEmail);
    setNote(h.note);
    setPaymentMethod(h.paymentMethod);
    setTaxPercent(h.taxPercent ?? "");
    setShippingFee(h.shippingFee ?? "");
    setAppliedCoupon(null);
    setCouponCode(h.couponCode ?? "");
    setCustomerName(h.customerName ?? null);
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
    setCustomerEmail("");
    setCustomerName(null);
    setNote("");
    setTaxPercent("");
    setShippingFee("");
    setAppliedCoupon(null);
    setCouponCode("");
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
        setRegOpen(false);
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
        setRegClose(false);
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
      const res = await fetch(`${api("/api/admin/pos/orders")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: bill.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          payments: cleaned,
          ...(discountNum > 0 ? { discountAmount: discountNum } : {}),
          ...(taxNum > 0 ? { taxPercent: taxNum } : {}),
          ...(shippingNum > 0 ? { shippingFee: shippingNum } : {}),
          ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
          ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
          ...((note.trim() || saleNote.trim()) ? { note: [note.trim(), saleNote.trim()].filter(Boolean).join(" · ") } : {}),
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
        setPayOpen(false);
        setBillOpen(false);
        setPayNote("");
        setSaleNote("");
        setEmailReceipt(false);
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
    if (bill.length === 0) {
      toast.error("Bill is empty — add products first");
      return;
    }
    if (discountInvalid) {
      toast.error("Discount cannot exceed the subtotal");
      return;
    }
    setTenders([{ method: paymentMethod, amount: grandTotal }]);
    setSaleNote(note);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    playPosSound("click");
    setPayOpen(true);
  }

  const tenderSum = Math.round(tenders.reduce((n, t) => n + (Number(t.amount) || 0), 0) * 100) / 100;
  const balanceDue = Math.round(Math.max(grandTotal - tenderSum, 0) * 100) / 100;
  const changeForCustomer = Math.round(Math.max(tenderSum - grandTotal, 0) * 100) / 100;

  function updateTender(idx: number, patch: Partial<Tender>) {
    setTenders(tenders.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function addTender() {
    if (tenders.length >= 4) return;
    setTenders([...tenders, { method: "CASH", amount: balanceDue > 0 ? balanceDue : 0 }]);
  }

  function removeTender(idx: number) {
    if (tenders.length === 1) return;
    setTenders(tenders.filter((_, i) => i !== idx));
  }

  function setTenderExact(idx: number) {
    updateTender(idx, { amount: grandTotal });
  }

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

  /* ------------------------------ render ------------------------------ */

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-secondary text-[13px] text-foreground">
      {/* print: only the receipt is visible on paper */}
      <style>{`@media print{body *{visibility:hidden}.pos-receipt,.pos-receipt *{visibility:visible}.pos-receipt{position:absolute;inset:0;background:#fff;color:#000}}`}</style>

      {/* ============ TOP TOOLBAR (Stocky register header) ============ */}
      <header className="flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-3">
        {/* brand tile */}
        <button
          type="button"
          onClick={() => router.push("/admin")}
          title="Back to admin dashboard"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-serif text-lg font-bold text-white shadow-sm transition hover:bg-primary/90"
        >
          S
        </button>

        {/* register + status chip */}
        <button
          type="button"
          onClick={() => {
            playPosSound("click");
            if (registerSession) {
              setRegCounted("");
              setRegClosingNote("");
              setRegClose(true);
            } else {
              setRegOpen(true);
            }
          }}
          className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 font-semibold transition ${
            registerSession
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          }`}
          title={
            registerSession
              ? `Register OPEN since ${formatDateTime(registerSession.openedAt)} — click to count and close`
              : "Register CLOSED — click to open with an opening float"
          }
        >
          <span className="text-[13px] font-semibold">Register</span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              registerSession ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${registerSession ? "bg-emerald-200" : "bg-rose-200"}`} />
            {registerSession ? "OPEN" : "CLOSED"}
          </span>
          {registerSession && registerLive && (
            <span className="tnum rounded-md bg-card/80 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              {formatINR(registerLive.expectedCash)}
            </span>
          )}
        </button>

        {/* outlet / terminal chip (teal, like Stocky's warehouse selector) */}
        <span
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-primary/25 bg-accent px-3 text-accent-foreground"
          title="Selling outlet for this terminal"
        >
          <Store className="h-4 w-4" />
          <span className="leading-tight">
            <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-primary/70">Outlet</span>
            <span className="block text-[11px] font-semibold">Stellora Flagship · T-{terminalId}</span>
          </span>
        </span>

        {/* categories dropdown */}
        <select
          value={catFilter}
          onChange={(e) => {
            setCatFilter(e.target.value);
            playPosSound("click");
          }}
          aria-label="Filter by category"
          className="h-9 max-w-44 shrink-0 rounded-lg border border-border bg-card px-2 text-[12px] font-medium text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>

        <span className="min-w-2 flex-1" />

        {/* customer chip */}
        <button
          type="button"
          onClick={() => {
            playPosSound("click");
            setCustQuery("");
            setCustHits(null);
            setCustOpen(true);
          }}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 transition hover:border-primary/40 hover:bg-accent"
          title="Attach a registered customer"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">
            {(customerName ?? "W").charAt(0).toUpperCase()}
          </span>
          <span className="leading-tight">
            <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-rose-500">Customer</span>
            <span className="block max-w-28 truncate text-[11px] font-semibold">
              {customerName ?? "walk-in-customer"}
            </span>
          </span>
        </button>

        {/* currency chip */}
        <span className="hidden h-9 shrink-0 items-center rounded-lg border border-border bg-muted px-2.5 text-[11px] font-bold text-foreground/80 sm:inline-flex">
          INR ₹
        </span>

        {/* utility icons — Stocky's right-side cluster */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" className={iconBtn} title="Shortcuts: F2 search · F4 pay · F7 hold · F8 held" onClick={() => toast.info("Shortcuts — F2: focus scan/search · F4: pay · F7: hold bill · F8: held bills")}>
            <Keyboard className="h-4 w-4" />
          </button>
          <button type="button" className={iconBtn} title="Fullscreen" onClick={toggleFullscreen}>
            <Maximize2 className="h-4 w-4" />
          </button>
          <button type="button" className={iconBtn} title={soundOn ? "Mute sounds" : "Unmute sounds"} onClick={toggleSound}>
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            aria-label="Beep volume"
            title={`Beep volume — ${Math.round(volume * 100)}%`}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="hidden h-1 w-14 shrink-0 cursor-pointer accent-primary xl:block"
          />
          <button type="button" className={iconBtn} title="Open another independent cashier window" onClick={() => window.open(window.location.href, "_blank", "noopener")}>
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Print barcode labels"
            onClick={() => {
              playPosSound("click");
              router.push("/admin/barcodes");
            }}
          >
            <ScanLine className="h-4 w-4" />
          </button>
          <span className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-white" title={sellerName || "Cashier"}>
            {(sellerName || "S").charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      {/* ============ BODY — cart (left) / catalog (right) ============ */}
      <div className="flex min-h-0 flex-1">
        {/* ---------- LEFT: current cart (Stocky cart panel) ---------- */}
        <section className="hidden w-1/2 min-w-0 flex-col border-r border-border bg-card lg:flex">
          <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <ShoppingCart className="h-4.5 w-4.5" />
              </span>
              <span className="leading-tight">
                <span className="block text-[14px] font-bold">Current Cart</span>
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
                aria-label="Clear the cart"
                title="Clear the cart"
                disabled={bill.length === 0}
                onClick={() => {
                  if (bill.length === 0) return;
                  playPosSound("remove");
                  resetBill();
                  toast.info("Cart cleared");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-500 transition hover:bg-rose-100 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* lines / empty state */}
          <div className="stellora-scroll min-h-0 flex-1 overflow-y-auto" aria-live="polite">
            {bill.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <ShoppingBasket className="h-12 w-12 text-foreground/15" strokeWidth={1.5} />
                <p className="text-[13px] font-semibold text-muted-foreground">No items added</p>
                <p className="text-[11px] text-muted-foreground">Select products from the right panel</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 px-4">
                {bill.map((l) => (
                  <li key={l.variantId} className="flex items-start gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Package className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{l.productName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        SKU · {l.sku}
                        {l.variantName ? ` · ${l.variantName}` : ""}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex items-center rounded-lg border border-border">
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded-l-lg text-muted-foreground transition hover:bg-muted disabled:opacity-30"
                            disabled={l.quantity <= 1}
                            aria-label={`Decrease quantity of ${l.productName}`}
                            onClick={() => changeQty(l.variantId, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="tnum w-8 text-center text-[12px] font-bold">{l.quantity}</span>
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded-r-lg text-muted-foreground transition hover:bg-muted disabled:opacity-30"
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
                          className="tnum w-16 rounded-lg border border-transparent bg-muted px-1.5 py-1 text-[11px] transition hover:border-border focus:border-primary/60 focus:bg-card focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Edit price of ${l.productName}`}
                          title="Edit unit price"
                          className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          onClick={() => {
                            const el = document.querySelector<HTMLInputElement>(
                              `input[aria-label="Unit price of ${CSS.escape(l.productName)}"]`
                            );
                            el?.focus();
                            el?.select();
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${l.productName} from bill`}
                          className="rounded-md p-1 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => {
                            playPosSound("remove");
                            setBill(bill.filter((x) => x.variantId !== l.variantId));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="tnum text-[13px] font-bold">{formatINR(l.unitPrice * l.quantity)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* adjustments — Tax % / Discount / Shipping, then summary + promo */}
          <div className="shrink-0 space-y-2 border-t border-border/60 bg-muted/60 px-4 py-3">
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
              <div className="space-y-1">
                <Label htmlFor="pos-discount" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Discount
                </Label>
                <Input
                  id="pos-discount"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="₹ 0"
                  className="h-9 rounded-lg border-border bg-card text-[12px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pos-ship" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Shipping
                </Label>
                <Input
                  id="pos-ship"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                  placeholder="₹ 0"
                  className="h-9 rounded-lg border-border bg-card text-[12px]"
                />
              </div>
            </div>
            {discountInvalid && (
              <p className="text-[11px] font-medium text-rose-600">
                Discount cannot exceed the subtotal ({formatINR(subtotal)}).
              </p>
            )}
            <div className="space-y-1 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tnum font-semibold">{formatINR(subtotal)}</span>
              </div>
              {appliedDiscount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Discount{appliedCoupon ? ` (${appliedCoupon.code})` : ""}</span>
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
                className="h-9 flex-1 rounded-lg border-border bg-card text-[11px] uppercase tracking-wide placeholder:text-muted-foreground/70"
              />
              {appliedCoupon ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 rounded-lg border-rose-200 px-4 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  onClick={removeCoupon}
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={couponBusy || bill.length === 0 || !couponCode.trim()}
                  className={`h-9 shrink-0 rounded-lg px-5 text-[12px] font-semibold ${BRAND.solid}`}
                  onClick={() => void applyCoupon()}
                >
                  {couponBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                </Button>
              )}
            </div>
            {appliedCoupon && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
                <Ticket className="mr-1 inline h-3.5 w-3.5" />
                {appliedCoupon.code} saves {formatINR(couponDiscount)}
              </p>
            )}
          </div>

          {/* footer bar — Online · synced | actions | TOTAL PAYABLE + Pay Now */}
          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-3 py-2.5">
            <span className="hidden items-center gap-1.5 text-[11px] font-semibold text-emerald-600 xl:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online · synced
            </span>
            <div className="flex items-center gap-1">
              <button type="button" className={iconBtn} title="Admin home" onClick={() => router.push("/admin")}>
                <Home className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={iconBtn}
                title="Reset this bill"
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
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground/80 transition hover:border-primary/40 hover:text-primary ${
                  held.length === 0 ? "opacity-60" : ""
                }`}
                disabled={held.length === 0}
                onClick={() => {
                  playPosSound("click");
                  setHeldOpen(true);
                }}
              >
                <History className="h-3.5 w-3.5" /> Recent Drafts ({held.length})
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground/80 transition hover:border-primary/40 hover:text-primary disabled:opacity-40"
                disabled={bill.length === 0}
                onClick={holdBill}
              >
                <Pause className="h-3.5 w-3.5" /> Hold
              </button>
            </div>
            <span className="min-w-1 flex-1" />
            <span className="text-right leading-tight">
              <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Total Payable</span>
              <span className="tnum block text-[17px] font-extrabold">{formatINR(grandTotal)}</span>
            </span>
            <Button
              type="button"
              disabled={busy || bill.length === 0 || discountInvalid}
              onClick={openPaymentDialog}
              className={`h-11 rounded-xl px-6 text-[14px] font-bold shadow-md shadow-primary/20 ${BRAND.solid}`}
            >
              <Check className="h-5 w-5" strokeWidth={3} /> Pay Now
            </Button>
          </div>
        </section>

        {/* ---------- RIGHT: catalog (Stocky product grid) ---------- */}
        <section className="flex min-w-0 flex-1 flex-col bg-background lg:w-1/2 lg:flex-none">
          {/* scan / search bar — one field, Stocky-style: typing filters the
              grid live; a scanner's Enter (or the Scan button) bills the code */}
          <div
            className={`flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2 transition-colors ${
              scanFlash === "err" ? "bg-rose-50" : scanFlash === "ok" ? "bg-emerald-50" : ""
            }`}
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
                placeholder="Scan / Search Product by Code Or Name"
                aria-label="Barcode scanner and product search"
                autoComplete="off"
                className="h-9 rounded-lg border-border bg-muted pl-9 pr-9 text-[12px] focus-visible:border-primary/60 focus-visible:bg-card"
              />
              {refreshing && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 rounded-lg border-border px-3 text-[12px] font-semibold text-foreground/80 hover:border-primary/40 hover:text-primary"
              onClick={() => {
                playPosSound("click");
                setCamOpen(true);
              }}
              title="Scan with the camera"
            >
              <ScanLine className="h-4 w-4" /> Scan
            </Button>
          </div>

          {/* product grid */}
          <div className="stellora-scroll min-h-0 flex-1 overflow-y-auto p-3">
            {products === null ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-2.5">
                    <Skeleton className="mb-2 h-24 w-full rounded-lg" />
                    <Skeleton className="mb-1.5 h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <PackageOpen className="h-12 w-12 text-foreground/15" strokeWidth={1.5} />
                <p className="text-[13px] font-semibold text-muted-foreground">No products found</p>
                <p className="text-[11px] text-muted-foreground">Try a different search term.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                {products.map((p) => {
                  const active = p.variants.filter((v) => v.isActive);
                  const stock = active.reduce((s, v) => s + v.stock, 0);
                  const price = active.length
                    ? Math.min(...active.map((v) => Number(v.price)))
                    : 0;
                  // Discount badge — highest % off among variants with a compare-at price
                  const dealPct = active.reduce((best, v) => {
                    const cp = v.compareAtPrice == null ? null : Number(v.compareAtPrice);
                    if (!cp || cp <= Number(v.price)) return best;
                    const pct = Math.round(((cp - Number(v.price)) / cp) * 100);
                    return Math.max(best, pct);
                  }, 0);
                  const out = stock === 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out}
                      onClick={() => handleProductClick(p)}
                      aria-label={`Add ${p.name} to bill`}
                      className={`group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md hover:shadow-primary/5 ${
                        out ? "cursor-not-allowed opacity-45" : ""
                      }`}
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
                          SKU {active[0]?.sku ?? "—"} · {stock} pc
                        </p>
                        <div className="mt-auto flex items-center justify-between pt-1">
                          <span className="tnum text-[13.5px] font-extrabold text-primary">
                            {formatINR(price)}
                          </span>
                          <span
                            aria-hidden
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground transition group-hover:bg-primary group-hover:text-white"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                          </span>
                        </div>
                        {active.length > 1 && (
                          <span className="text-[10px] text-muted-foreground">{active.length} variants</span>
                        )}
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
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-30"
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
                    className={`tnum flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-[12px] font-bold transition ${
                      pw === page
                        ? "bg-primary text-white shadow-sm shadow-primary/30"
                        : "border border-border text-foreground/80 hover:border-primary/40 hover:text-primary"
                    }`}
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
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* mobile floating bill bar */}
          {bill.length > 0 && (
            <div className="fixed inset-x-4 bottom-4 z-40 lg:hidden">
              <Button
                size="lg"
                onClick={() => setBillOpen(true)}
                className={`w-full rounded-xl text-base shadow-xl ${BRAND.solid}`}
              >
                <ShoppingBasket className="h-5 w-5" />
                View bill ({billCount}) — {formatINR(grandTotal)}
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* mobile bill sheet */}
      <Sheet open={billOpen} onOpenChange={setBillOpen}>
        <SheetContent side="bottom" className="stellora-scroll max-h-[88vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-serif">Current bill</SheetTitle>
            <SheetDescription>Review items and charge the customer.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            {bill.map((l) => (
              <div key={l.variantId} className="flex items-center gap-3 border-b border-border/60 pb-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.productName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {l.quantity} × {formatINR(l.unitPrice)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={l.quantity <= 1} onClick={() => changeQty(l.variantId, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="tnum w-7 text-center text-sm font-bold">{l.quantity}</span>
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={l.quantity >= l.stock} onClick={() => changeQty(l.variantId, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <p className="tnum w-20 text-right text-sm font-bold">{formatINR(l.unitPrice * l.quantity)}</p>
                </div>
              </div>
            ))}
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Payable</span>
              <span className="tnum text-xl font-extrabold">{formatINR(grandTotal)}</span>
            </div>
            <Button
              type="button"
              disabled={busy || discountInvalid}
              onClick={openPaymentDialog}
              className={`h-11 w-full rounded-xl text-[14px] font-bold ${BRAND.solid}`}
            >
              <Check className="h-5 w-5" strokeWidth={3} /> Pay Now
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* variant picker */}
      <Dialog open={!!variantPicker} onOpenChange={(o) => !o && setVariantPicker(null)}>
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
                    setVariantPicker(null);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition ${
                    v.stock <= 0
                      ? "cursor-not-allowed opacity-40"
                      : "hover:border-primary/60 hover:bg-accent"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{v.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{v.sku}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tnum block font-bold text-primary">{formatINR(Number(v.price))}</span>
                    <span className={`tnum block text-[11px] ${v.stock <= 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                      {v.stock <= 0 ? "Out of stock" : `${v.stock} in stock`}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* camera scanner dialog */}
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

      {/* held bills dialog — Stocky "Recent drafts" */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Held bills
            </DialogTitle>
            <DialogDescription>
              Paused customers wait here — resume any bill to continue billing.
            </DialogDescription>
          </DialogHeader>
          {held.length === 0 ? (
            <p className="rounded-lg border border-dashed border-input p-4 text-center text-sm text-muted-foreground">
              No bills on hold.
            </p>
          ) : (
            <div className="stellora-scroll max-h-80 space-y-1.5 overflow-y-auto">
              {held.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {h.lines.length} item{h.lines.length === 1 ? "" : "s"} ·{" "}
                      {formatINR(h.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Held at {new Date(h.at).toLocaleTimeString()}
                      {h.note ? ` · ${h.note}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" size="sm" className={`h-7 rounded-lg text-xs ${BRAND.solid}`} onClick={() => resumeBill(h)}>
                      Resume
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-lg"
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
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* customer quick-picker */}
      <Dialog open={custOpen} onOpenChange={setCustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4" /> Attach customer
            </DialogTitle>
            <DialogDescription>
              Registered customers earn Stellora points on every counter sale.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <UserRoundPlus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={custQuery}
              onChange={(e) => setCustQuery(e.target.value)}
              placeholder="Search by name, email or phone…"
              className="rounded-lg pl-9"
              autoFocus
            />
          </div>
          <div className="stellora-scroll max-h-64 space-y-1.5 overflow-y-auto">
            {custHits === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : custHits.length === 0 ? (
              <p className="rounded-lg border border-dashed border-input p-4 text-center text-sm text-muted-foreground">
                No customers match. You can still bill walk-ins without an email.
              </p>
            ) : (
              custHits.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCustomerEmail(c.email);
                    setCustomerName(c.name);
                    setCustOpen(false);
                    playPosSound("click");
                    toast.success(`${c.name} attached — ${c.points} points`);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition hover:border-primary/60 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </span>
                  </span>
                  <span className="tnum shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    {c.points} pts
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Stocky-style Payment Checkout — gradient header, breakdown
             sidebar, method tile grid, quick-tender chips ===== */}
      <Dialog open={payOpen} onOpenChange={(o) => !o && !busy && setPayOpen(false)}>
        <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-3xl">
          <DialogHeader className="space-y-0 border-b border-primary/30 brand-gradient px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2.5 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-card/20">
                <Wallet className="h-5 w-5" />
              </span>
              <span className="text-[17px] font-bold tracking-wide">Payment Checkout</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Take cash, card and UPI in any combination — change is calculated automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[70dvh] gap-4 overflow-y-auto p-5 sm:grid-cols-[240px_1fr]">
            {/* LEFT — transaction summary + payment breakdown */}
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/60 p-3.5 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                  <CalendarDays className="h-3 w-3" /> Transaction Summary
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Total Amount</p>
                <p className="tnum text-[26px] font-extrabold leading-tight text-primary">
                  {formatINR(grandTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/60 p-3.5">
                <p className="text-[12px] font-extrabold uppercase tracking-wide text-foreground">
                  Payment Breakdown
                </p>
                <div className="mt-2.5 space-y-2">
                  <div className="flex items-center gap-2.5 rounded-lg bg-card px-2.5 py-2 shadow-sm">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                    <span className="leading-tight">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Paying</span>
                      <span className="tnum block text-[14px] font-extrabold text-emerald-600">{formatINR(Math.min(tenderSum, grandTotal))}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-lg bg-card px-2.5 py-2 shadow-sm">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <Wallet className="h-4 w-4" />
                    </span>
                    <span className="leading-tight">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Balance</span>
                      <span className={`tnum block text-[14px] font-extrabold ${balanceDue > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {formatINR(balanceDue)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-lg bg-card px-2.5 py-2 shadow-sm">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                      <HandCoins className="h-4 w-4" />
                    </span>
                    <span className="leading-tight">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Change</span>
                      <span className="tnum block text-[14px] font-extrabold text-sky-600">{formatINR(changeForCustomer)}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT — tender cards */}
            <div className="min-w-0 space-y-3">
              {tenders.map((t, idx) => (
                <div key={idx} className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
                  <div className="mb-2.5 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-[13px] font-bold">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                        {idx + 1}
                      </span>
                      Payment #{idx + 1}
                    </p>
                    {tenders.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove payment ${idx + 1}`}
                        className="rounded-md p-1 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => removeTender(idx)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <Label htmlFor={`tender-amount-${idx}`} className="text-[11px] font-semibold text-muted-foreground">
                        Amount
                      </Label>
                      <Input
                        id={`tender-amount-${idx}`}
                        type="number"
                        min={0}
                        step={1}
                        inputMode="decimal"
                        value={t.amount || ""}
                        onChange={(e) => updateTender(idx, { amount: Number(e.target.value) })}
                        placeholder="0"
                        aria-label={`Amount for payment ${idx + 1}`}
                        className="tnum h-9 rounded-lg text-[14px] font-bold"
                      />
                    </div>
                    {/* method tile grid — 4 columns, Stocky style */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-muted-foreground">Account</Label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => {
                          const on = t.method === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={on}
                              onClick={() => {
                                updateTender(idx, { method: value });
                                playPosSound("click");
                              }}
                              className={`relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[10.5px] font-semibold transition ${
                                on
                                  ? "border-primary bg-accent text-primary shadow-sm"
                                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted"
                              }`}
                            >
                              <span
                                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                  on ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                                }`}
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
                    </div>
                    {/* quick tender chips */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTenderExact(idx)}
                        className="tnum rounded-lg border border-primary/30 bg-accent px-2.5 py-1 text-[11px] font-bold text-primary transition hover:bg-accent"
                      >
                        Exact {formatINR(grandTotal)}
                      </button>
                      {QUICK_NOTES.map((noteAmt) => (
                        <button
                          key={noteAmt}
                          type="button"
                          onClick={() => updateTender(idx, { amount: (Number(t.amount) || 0) + noteAmt })}
                          className="tnum rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                        >
                          +{noteAmt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {/* add payment method — Stocky's dashed splitter */}
              <button
                type="button"
                disabled={tenders.length >= 4}
                onClick={addTender}
                className="w-full rounded-xl border-2 border-dashed border-primary/40 py-2.5 text-[12.5px] font-bold text-primary transition hover:bg-accent disabled:opacity-40"
              >
                + Add Payment Method (split)
              </button>

              {/* meta rows */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="pay-date" className="text-[11px] font-semibold text-muted-foreground">
                    Payment Date
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
                    placeholder="Add Payment Note"
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
                    placeholder="Add Sale Note"
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
                  Send Email Receipt
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
          </div>

          {/* footer — Cancel + green Complete Payment (Stocky) */}
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
                  <Check className="h-4 w-4" strokeWidth={3} /> Complete Payment
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== register: open ===== */}
      <Dialog open={regOpen} onOpenChange={setRegOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="h-4 w-4 text-emerald-600" /> Open Register
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
              <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => setRegOpen(false)}>
                Cancel
              </Button>
              <Button
                className="h-10 flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-600/90"
                disabled={regBusy}
                onClick={() => void openRegister()}
              >
                {regBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open Register"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== register: close (count + variance) ===== */}
      <Dialog open={regClose} onOpenChange={setRegClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-amber-600" /> Close Register
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
                  <p className="tnum font-bold text-emerald-600">
                    {formatINR(registerLive?.expectedCash ?? registerSession.openingBalance)}
                  </p>
                  {registerLive && (
                    <p className="mt-0.5 tnum text-[10px] text-muted-foreground">
                      cash +{formatINR(registerLive.cashIn)} · change −{formatINR(registerLive.change)}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-counted">Counted cash (₹)</Label>
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
                    className={`tnum text-xs font-semibold ${
                      Number(regCounted) - (registerLive.expectedCash ?? 0) === 0
                        ? "text-emerald-600"
                        : Number(regCounted) > (registerLive.expectedCash ?? 0)
                          ? "text-sky-600"
                          : "text-rose-600"
                    }`}
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
                <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => setRegClose(false)}>
                  Cancel
                </Button>
                <Button className="h-10 flex-1 rounded-xl" disabled={regBusy} onClick={() => void closeRegister()}>
                  {regBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close Register"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== thermal receipt — Stocky style: centered header, reference,
             seller, Paid/Due, Paid-By table, thank-you, INVOICE QR ===== */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-emerald-600" /> Sale complete
            </DialogTitle>
            <DialogDescription>
              {receipt
                ? `Order ${receipt.order.orderNumber} has been billed and marked paid.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {receipt && (
            <div className="pos-receipt stellora-scroll max-h-[55vh] overflow-y-auto rounded-xl border border-border bg-card p-5 font-mono text-[11px] leading-relaxed text-black">
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
                <p className="text-[10px]">Outlet : Stellora Flagship</p>
              </div>

              <div className="my-2.5 border-t border-dashed border-slate-400" />

              {/* items — "1.00 Pc X 429.00" like Stocky */}
              <div className="space-y-1.5">
                {receipt.order.items.map((it, idx) => (
                  <div key={`${it.sku}-${idx}`}>
                    <p className="leading-tight">{it.productName}{it.variantName ? ` — ${it.variantName}` : ""}</p>
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
                    INR {taxAmountOf(receipt).toFixed(2)}
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
                <p className="mt-2 whitespace-pre-line text-center text-[9px] leading-relaxed text-muted-foreground">
                  {receiptFooter}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button className={`h-10 flex-1 rounded-xl ${BRAND.solid}`} onClick={() => setReceipt(null)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* Receipt helper — the order tax implied by the bill math
   (total − (subtotal − discount + shipping)); zero when percentages weren't used. */
function taxAmountOf(receipt: ReceiptData): number {
  const sub = Number(receipt.order.subtotal);
  const disc = Number(receipt.order.discountTotal);
  const ship = Number(receipt.order.shippingFee);
  const total = Number(receipt.order.grandTotal);
  return Math.max(Math.round((total - (sub - disc + ship)) * 100) / 100, 0);
}

function methodLabel(m: string): string {
  const found = PAYMENT_METHODS.find((p) => p.value === m.toUpperCase());
  return found?.label ?? m;
}
