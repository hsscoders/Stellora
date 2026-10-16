"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CreditCard,
  Info,
  Loader2,
  Minus,
  PackageOpen,
  Plus,
  Printer,
  ReceiptText,
  ScanBarcode,
  Search,
  ShoppingBasket,
  Smartphone,
  Store,
  X,
} from "lucide-react";
import { toast } from "sonner";
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

type PaymentMethod = "CASH" | "CARD" | "UPI";

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
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "CARD", label: "Card", icon: CreditCard },
  { value: "UPI", label: "UPI", icon: Smartphone },
];

export default function AdminPosPage() {
  /* catalog */
  const [products, setProducts] = useState<ApiProduct[] | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const seqRef = useRef(0);

  /* bill */
  const [bill, setBill] = useState<BillLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [customerEmail, setCustomerEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  /* dialogs */
  const [variantPicker, setVariantPicker] = useState<ApiProduct | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [receiptFooter, setReceiptFooter] = useState("");

  const fetchProducts = useCallback(async (targetPage: number, q: string, append: boolean) => {
    const seq = ++seqRef.current;
    if (append) setLoadingMore(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage) });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/products?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (seq !== seqRef.current) return; // a newer request superseded this one
      if (json.ok) {
        const d = json.data as { products: ApiProduct[]; total: number; page: number; pages: number };
        setProducts((prev) => (append && prev ? [...prev, ...d.products] : d.products));
        setPage(d.page);
        setPages(d.pages);
        setTotal(d.total);
      } else {
        setProducts((prev) => (append && prev ? prev : []));
        toast.error(json.error?.message ?? "Could not load products");
      }
    } catch {
      if (seq === seqRef.current) {
        setProducts((prev) => (append && prev ? prev : []));
        toast.error("Network error while loading products");
      }
    } finally {
      if (seq === seqRef.current) {
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  /* Debounced search (250ms) — also covers the initial load with query "" */
  useEffect(() => {
    const t = setTimeout(() => {
      void fetchProducts(1, query, false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, fetchProducts]);

  /* Receipt footer setting (optional, may be empty) */
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/settings", { cache: "no-store" })
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

  /* ------------------------------ bill logic ------------------------------ */

  const subtotal = useMemo(
    () => bill.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [bill]
  );
  const discountNum = Math.round(Math.max(Number(discount) || 0, 0) * 100) / 100;
  const discountInvalid = discountNum > subtotal;
  const appliedDiscount = Math.min(discountNum, subtotal);
  const grandTotal = Math.max(Math.round((subtotal - appliedDiscount) * 100) / 100, 0);
  const billCount = bill.reduce((n, l) => n + l.quantity, 0);

  function addVariant(product: ApiProduct, v: ApiVariant) {
    if (!v.isActive || v.stock <= 0) {
      toast.error(`${product.name} (${v.name}) is out of stock`);
      return;
    }
    const existing = bill.find((l) => l.variantId === v.id);
    if (existing) {
      if (existing.quantity + 1 > v.stock) {
        toast.error(`Only ${v.stock} in stock`);
        return;
      }
      setBill(bill.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l)));
      return;
    }
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
      toast.error(`${p.name} is out of stock`);
    } else {
      setVariantPicker(p);
    }
  }

  function resetBill() {
    setBill([]);
    setDiscount("");
    setCustomerEmail("");
    setNote("");
  }

  async function charge() {
    if (busy) return;
    if (bill.length === 0) {
      toast.error("Bill is empty — add products first");
      return;
    }
    if (discountInvalid) {
      toast.error("Discount cannot exceed the subtotal");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/pos/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: bill.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          paymentMethod,
          ...(discountNum > 0 ? { discountAmount: discountNum } : {}),
          ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        const order = json.data.order as PosOrder;
        const pointsEarned = Number(json.data.pointsEarned ?? 0);
        toast.success(`Order ${order.orderNumber} billed — ${formatINR(order.grandTotal)}`);
        setReceipt({ order, pointsEarned, method: paymentMethod });
        setBillOpen(false);
        resetBill();
        void fetchProducts(1, query, false); // refresh stock badges
      } else {
        toast.error(json.error?.message ?? "Could not complete the sale");
      }
    } catch {
      toast.error("Network error — sale was not completed");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------ bill panel ------------------------------ */

  const billPanel = (idPrefix: string) => (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* lines */}
      <div className="stellora-scroll max-h-72 min-h-0 overflow-y-auto" aria-live="polite">
        {bill.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
            <ScanBarcode className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Tap products to start billing</p>
            <p className="text-xs text-muted-foreground">Search or browse the catalog on the left.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {bill.map((l) => (
              <li key={l.variantId} className="flex items-start gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.productName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {l.variantName} · {l.sku}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      disabled={l.quantity <= 1}
                      aria-label={`Decrease quantity of ${l.productName}`}
                      onClick={() => changeQty(l.variantId, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="tnum w-7 text-center text-sm font-semibold">{l.quantity}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      disabled={l.quantity >= l.stock}
                      aria-label={`Increase quantity of ${l.productName}`}
                      onClick={() => changeQty(l.variantId, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <span className="tnum ml-1 text-[11px] text-muted-foreground">
                      {formatINR(l.unitPrice)} each
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    aria-label={`Remove ${l.productName} from bill`}
                    className="rounded-full p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                    onClick={() => setBill(bill.filter((x) => x.variantId !== l.variantId))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <p className="tnum text-sm font-semibold">{formatINR(l.unitPrice * l.quantity)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* totals */}
      <div className="space-y-1.5 border-t border-border pt-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>
            Subtotal ({billCount} item{billCount === 1 ? "" : "s"})
          </span>
          <span className="tnum">{formatINR(subtotal)}</span>
        </div>
        {appliedDiscount > 0 && (
          <div className="flex justify-between text-rose-600 dark:text-rose-400">
            <span>Discount</span>
            <span className="tnum">−{formatINR(appliedDiscount)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Grand total
          </span>
          <span className="tnum font-serif text-2xl font-semibold">{formatINR(grandTotal)}</span>
        </div>
      </div>

      {/* discount */}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-discount`}>Discount (₹, optional)</Label>
        <Input
          id={`${idPrefix}-discount`}
          type="number"
          min={0}
          step={1}
          inputMode="decimal"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          placeholder="0"
        />
        {discountInvalid && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Discount cannot exceed the subtotal ({formatINR(subtotal)}).
          </p>
        )}
      </div>

      {/* payment method */}
      <div className="space-y-1.5">
        <Label>Payment method</Label>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={paymentMethod === value}
              onClick={() => setPaymentMethod(value)}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-semibold transition ${
                paymentMethod === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* customer + note */}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-email`}>Customer email (optional)</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          placeholder="Registered customer email (optional — earns points)"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-note`}>Note (optional)</Label>
        <Input
          id={`${idPrefix}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. gift-wrapped, regular customer"
        />
      </div>

      <Button
        type="button"
        disabled={busy || bill.length === 0 || discountInvalid}
        onClick={() => void charge()}
        className="h-12 w-full rounded-full bg-primary text-base font-semibold hover:bg-primary/90"
      >
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> Billing…
          </>
        ) : (
          <>Charge {formatINR(grandTotal)}</>
        )}
      </Button>
    </div>
  );

  /* ------------------------------ render ------------------------------ */

  return (
    <div className="space-y-6">
      {/* print: only the receipt is visible on paper */}
      <style>{`@media print{body *{visibility:hidden}.pos-receipt,.pos-receipt *{visibility:visible}.pos-receipt{position:absolute;inset:0;background:#fff;color:#000}}`}</style>

      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Store className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-medium sm:text-3xl">Point of Sale</h1>
          <p className="text-sm text-muted-foreground">
            Counter billing — ring up walk-in sales in seconds.
          </p>
        </div>
        <Button variant="outline" onClick={resetBill} className="ml-auto rounded-full">
          New Bill
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Registered customers earn 1 point per ₹100 — enter their email before charging.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* LEFT — catalog */}
        <section className="min-w-0 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="pl-9 pr-9"
              aria-label="Search products"
            />
            {refreshing && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {products === null ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border/70 bg-card p-2.5">
                  <Skeleton className="mb-2 aspect-square w-full rounded-md" />
                  <Skeleton className="mb-1.5 h-4 w-3/4" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
              <PackageOpen className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No products found</p>
              <p className="text-xs text-muted-foreground">Try a different search term.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {products.map((p) => {
                  const active = p.variants.filter((v) => v.isActive);
                  const stock = active.reduce((s, v) => s + v.stock, 0);
                  const price = active.length
                    ? Math.min(...active.map((v) => Number(v.price)))
                    : 0;
                  const out = stock === 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out}
                      onClick={() => handleProductClick(p)}
                      aria-label={`Add ${p.name} to bill`}
                      className={`group relative flex flex-col rounded-lg border border-border/70 bg-card p-2.5 text-left transition hover:border-primary/60 hover:shadow-sm ${
                        out ? "cursor-not-allowed opacity-40" : ""
                      }`}
                    >
                      <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-md bg-muted">
                        <Image
                          src={p.images[0]?.url ?? "/images/placeholder.svg"}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 45vw, 200px"
                          className="object-cover transition group-hover:scale-105"
                        />
                      </div>
                      <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
                      <div className="mt-1 flex items-baseline justify-between gap-1">
                        <span className="tnum text-sm font-semibold">{formatINR(price)}</span>
                        <span
                          className={`tnum text-[11px] ${
                            out ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {out ? "Out" : `${stock} in stock`}
                        </span>
                      </div>
                      {active.length > 1 && (
                        <span className="mt-0.5 text-[10px] text-muted-foreground">
                          {active.length} variants
                        </span>
                      )}
                      {out && (
                        <Badge className="absolute right-2 top-2 bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                          Out
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
              {page < pages && (
                <Button
                  variant="outline"
                  disabled={loadingMore}
                  onClick={() => void fetchProducts(page + 1, query, true)}
                  className="w-full rounded-full"
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
                  {!loadingMore && ` (${total - products.length} more)`}
                </Button>
              )}
            </>
          )}
        </section>

        {/* RIGHT — the bill (sticky on desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-8 flex max-h-[calc(100vh-6rem)] flex-col rounded-lg border border-border/70 bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg font-medium">Current bill</h2>
              {bill.length > 0 && (
                <Badge variant="secondary" className="tnum">
                  {billCount}
                </Badge>
              )}
            </div>
            {billPanel("d")}
          </div>
        </aside>
      </div>

      {/* mobile floating bill bar */}
      {bill.length > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 lg:hidden">
          <Button
            size="lg"
            onClick={() => setBillOpen(true)}
            className="w-full rounded-full bg-primary text-base shadow-xl hover:bg-primary/90"
          >
            <ShoppingBasket className="h-5 w-5" />
            View bill ({billCount}) — {formatINR(grandTotal)}
          </Button>
        </div>
      )}

      {/* mobile bill sheet */}
      <Sheet open={billOpen} onOpenChange={setBillOpen}>
        <SheetContent side="bottom" className="stellora-scroll max-h-[88vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-serif">Current bill</SheetTitle>
            <SheetDescription>Review items and charge the customer.</SheetDescription>
          </SheetHeader>
          <div className="flex max-h-[70vh] flex-col px-4 pb-6">{billPanel("m")}</div>
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
                  className={`flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-left text-sm transition ${
                    v.stock <= 0
                      ? "cursor-not-allowed opacity-40"
                      : "hover:border-primary/60 hover:bg-accent"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{v.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{v.sku}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tnum block font-semibold">{formatINR(Number(v.price))}</span>
                    <span
                      className={`tnum block text-[11px] ${
                        v.stock <= 0 ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {v.stock <= 0 ? "Out of stock" : `${v.stock} in stock`}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* receipt dialog */}
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
            <div className="pos-receipt stellora-scroll max-h-[55vh] overflow-y-auto rounded-md border border-border bg-card p-4 font-mono text-xs">
              <div className="text-center">
                <p className="font-serif text-lg font-semibold tracking-[0.3em]">STELLORA</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Point of Sale Receipt
                </p>
              </div>

              <div className="my-3 border-t border-dashed border-border" />

              <div className="space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span>Order</span>
                  <span className="font-semibold">{receipt.order.orderNumber}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Billed</span>
                  <span>{formatDateTime(receipt.order.createdAt)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Payment</span>
                  <span>
                    {receipt.method}
                    {receipt.order.payments[0]?.providerRef
                      ? ` · ${receipt.order.payments[0].providerRef}`
                      : ""}
                  </span>
                </div>
              </div>

              <div className="my-3 border-t border-dashed border-border" />

              <div className="space-y-1.5">
                {receipt.order.items.map((it, idx) => (
                  <div key={`${it.sku}-${idx}`}>
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {it.productName} — {it.variantName}
                      </span>
                      <span className="tnum shrink-0">{formatINR(it.lineTotal)}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{it.sku}</span>
                      <span className="tnum shrink-0">
                        {it.quantity} × {formatINR(it.unitPrice)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="my-3 border-t border-dashed border-border" />

              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="tnum">{formatINR(receipt.order.subtotal)}</span>
                </div>
                {Number(receipt.order.discountTotal) > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span className="tnum">−{formatINR(receipt.order.discountTotal)}</span>
                  </div>
                )}
                {Number(receipt.order.shippingFee) > 0 && (
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span className="tnum">{formatINR(receipt.order.shippingFee)}</span>
                  </div>
                )}
                <div className="mt-1.5 flex justify-between border-t border-dashed border-border pt-1.5 text-sm font-bold">
                  <span>TOTAL</span>
                  <span className="tnum">{formatINR(receipt.order.grandTotal)}</span>
                </div>
              </div>

              {receipt.pointsEarned > 0 && (
                <p className="mt-2.5 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                  +{receipt.pointsEarned} Stellora points earned
                </p>
              )}

              {receiptFooter && (
                <>
                  <div className="my-3 border-t border-dashed border-border" />
                  <p className="whitespace-pre-line text-center text-[10px] leading-relaxed text-muted-foreground">
                    {receiptFooter}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button
              className="flex-1 rounded-full bg-primary hover:bg-primary/90"
              onClick={() => setReceipt(null)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
