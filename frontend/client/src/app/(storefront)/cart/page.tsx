"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2, Minus, Plus, ShoppingBag, ArrowRight, Tag, X, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/stellora/empty-state";
import { useStore } from "@/lib/store";
import { formatINR } from "@/lib/utils";

const COUPON_KEY = "stellora-coupon";

export default function CartPage() {
  const cart = useStore((s) => s.cart);
  const cartLoading = useStore((s) => s.cartLoading);
  const refreshCart = useStore((s) => s.refreshCart);
  const updateItem = useStore((s) => s.updateItem);
  const removeItem = useStore((s) => s.removeItem);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const change = async (itemId: string, q: number) => {
    setBusyId(itemId);
    await updateItem(itemId, q);
    setBusyId(null);
  };

  const remove = async (itemId: string, name: string) => {
    setBusyId(itemId);
    await removeItem(itemId);
    setBusyId(null);
    toast.success(`Removed ${name}`);
  };

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (json.ok && json.data.valid) {
        const applied = { code: json.data.code as string, discount: json.data.discount as number };
        setCoupon(applied);
        setCouponInput("");
        window.sessionStorage.setItem(COUPON_KEY, applied.code);
        toast.success(`Coupon ${applied.code} applied — you save ${formatINR(applied.discount)}`);
      } else {
        setCoupon(null);
        window.sessionStorage.removeItem(COUPON_KEY);
        toast.error(json.data?.message ?? json.error?.message ?? "Coupon could not be applied");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setCouponBusy(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    window.sessionStorage.removeItem(COUPON_KEY);
    toast.success("Coupon removed");
  };

  if (cartLoading && !cart) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <Skeleton className="h-10 w-48" />
        <div className="mt-10 space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-5">
              <Skeleton className="h-28 w-28 rounded-lg" />
              <div className="flex-1 space-y-3 py-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-8 w-40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon="package"
        title="Your cart is empty"
        description="Beautiful things are waiting. Explore our collections and find something that feels like you."
        actionLabel="Start shopping"
        actionHref="/shop"
      />
    );
  }

  const subtotal = cart.subtotal;
  const FREE_SHIPPING_THRESHOLD = 1999;
  const discount = coupon?.discount ?? 0;
  const payable = Math.max(subtotal - discount, 0);
  const progress = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
  const away = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-serif text-4xl font-medium">Your Cart</h1>
      <p className="mt-2 text-sm text-muted-foreground tnum">
        {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
      </p>

      {/* Free-shipping progress */}
      <div className="anim-fade-up mt-6 rounded-lg border border-border/70 bg-card p-4">
        <p className="text-sm">
          {away > 0 ? (
            <>
              Add <span className="font-semibold text-primary tnum">{formatINR(away)}</span> more to
              unlock <span className="font-semibold">free shipping</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-primary">Congratulations!</span> Your order ships
              free
            </>
          )}
        </p>
        <div
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress towards free shipping"
        >
          <div
            className="h-full rounded-full brand-gradient transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <ul className="divide-y divide-border">
          {cart.items.map((item) => (
            <li key={item.itemId} className="flex gap-4 py-6 sm:gap-6">
              <Link
                href={`/product/${item.slug}`}
                className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border/60 sm:h-32 sm:w-32"
              >
                <Image
                  src={item.imageUrl ?? "/images/placeholder.svg"}
                  alt={item.productName}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              </Link>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/product/${item.slug}`}
                      className="font-serif text-[17px] font-medium leading-snug hover:text-primary"
                    >
                      {item.productName}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.variantName}</p>
                  </div>
                  <button
                    onClick={() => remove(item.itemId, item.productName)}
                    disabled={busyId === item.itemId}
                    aria-label={`Remove ${item.productName}`}
                    className="p-1.5 text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                  <div className="inline-flex items-center rounded-md border border-input">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-r-none"
                      aria-label="Decrease quantity"
                      disabled={busyId === item.itemId || item.quantity <= 1}
                      onClick={() => change(item.itemId, item.quantity - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-9 text-center text-sm font-medium tnum">{item.quantity}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-l-none"
                      aria-label="Increase quantity"
                      disabled={
                        busyId === item.itemId ||
                        item.quantity >= Math.min(10, item.stock)
                      }
                      onClick={() => change(item.itemId, item.quantity + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="text-right tnum">
                    <p className="font-semibold">{formatINR(item.lineTotal)}</p>
                    <p className="text-xs text-muted-foreground">{formatINR(item.unitPrice)} each</p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-lg border border-border/70 bg-card p-6">
            <h2 className="font-serif text-xl font-medium">Order Summary</h2>
            <div className="mt-5 space-y-3 text-sm tnum">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatINR(subtotal)}</span>
              </div>
              {coupon && discount > 0 && (
                <div className="flex justify-between text-primary">
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" /> Coupon {coupon.code}
                  </span>
                  <span className="font-medium">−{formatINR(discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className={payable >= FREE_SHIPPING_THRESHOLD ? "font-medium text-primary" : "text-muted-foreground"}>
                  {payable >= FREE_SHIPPING_THRESHOLD ? "FREE" : "Calculated at checkout"}
                </span>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold uppercase tracking-[0.14em]">Total</span>
              <span className="text-xl font-bold tnum">{formatINR(payable)}</span>
            </div>
            {coupon && discount > 0 && (
              <p className="mt-1.5 text-right text-xs font-medium text-primary tnum">
                You save {formatINR(discount)} with {coupon.code}
              </p>
            )}

            {/* Coupon code */}
            {coupon ? (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-primary/30 bg-accent/50 px-3 py-2.5">
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Tag className="h-3.5 w-3.5" /> {coupon.code} applied
                </p>
                <button
                  onClick={removeCoupon}
                  aria-label={`Remove coupon ${coupon.code}`}
                  className="text-muted-foreground transition hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex gap-2">
                  <Input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                    placeholder="Coupon code e.g. WELCOME10"
                    aria-label="Coupon code"
                    className="h-10 uppercase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={couponBusy || !couponInput.trim()}
                    onClick={applyCoupon}
                    className="btn-press shrink-0 rounded-full border-primary/50 px-5"
                  >
                    {couponBusy ? "…" : "Apply"}
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Try <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={() => setCouponInput("WELCOME10")}>WELCOME10</button> or <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={() => setCouponInput("FLAT200")}>FLAT200</button>
                </p>
              </div>
            )}

            <Button asChild size="lg" className="btn-sheen btn-gradient mt-5 w-full rounded-full font-semibold text-primary-foreground shadow-lg shadow-primary/25">
              <Link href="/checkout">
                Proceed to Checkout <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="mt-2 w-full">
              <Link href="/shop">
                <ShoppingBag className="h-4 w-4" /> Continue shopping
              </Link>
            </Button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Secure checkout · Taxes included
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
