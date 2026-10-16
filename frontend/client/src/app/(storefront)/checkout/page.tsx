"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, ShieldCheck, Check, Tag, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/stellora/empty-state";
import { formatINR } from "@/lib/utils";
import { useStore } from "@/lib/store";
import type { CartViewData } from "@/lib/store";

interface Address {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useStore((s) => s.cart);
  const refreshCart = useStore((s) => s.refreshCart);
  const [authState, setAuthState] = useState<"loading" | "authed" | "guest">("loading");
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shipping, setShipping] = useState<{ baseFee: number; freeAbove: number | null; name: string } | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json());
      if (!me.ok || !me.data.user) {
        setAuthState("guest");
        return;
      }
      setAuthState("authed");
      const [addr, ship] = await Promise.all([
        fetch("/api/account/addresses").then((r) => r.json()),
        fetch("/api/shipping").then((r) => r.json()),
      ]);
      if (addr.ok) {
        setAddresses(addr.data);
        const def = addr.data.find((a: Address) => a.isDefault) ?? addr.data[0];
        if (def) setSelectedId(def.id);
      }
      if (ship.ok) setShipping(ship.data);
      refreshCart();
    })();
  }, [refreshCart]);

  const totals = useMemo(() => {
    const subtotal = cart?.subtotal ?? 0;
    const discount = coupon?.discount ?? 0;
    const payable = Math.max(subtotal - discount, 0);
    let shipFee = shipping ? shipping.baseFee : 0;
    if (shipping?.freeAbove && payable >= shipping.freeAbove) shipFee = 0;
    return { subtotal, discount, shipFee, grand: payable + shipFee };
  }, [cart, coupon, shipping]);

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setCouponBusy(true);
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponInput.trim() }),
    });
    const json = await res.json();
    setCouponBusy(false);
    if (json.ok && json.data.valid) {
      setCoupon({ code: json.data.code, discount: json.data.discount });
      toast.success(`Coupon ${json.data.code} applied — you save ${formatINR(json.data.discount)}`);
    } else {
      setCoupon(null);
      toast.error(json.data?.message ?? json.error?.message ?? "Coupon could not be applied");
    }
  }

  async function saveAddress(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddErrors({});
    const form = new FormData(e.currentTarget);
    const payload = { ...Object.fromEntries(form.entries()), isDefault: form.get("isDefault") === "on" };
    const res = await fetch("/api/account/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      setAddresses((prev) => [...(prev ?? []), json.data]);
      setSelectedId(json.data.id);
      setDialogOpen(false);
      toast.success("Address saved");
    } else {
      setAddErrors(json.error?.fields ?? {});
      toast.error(json.error?.message ?? "Could not save address");
    }
  }

  async function placeOrder() {
    if (!selectedId) {
      toast.error("Please select a delivery address");
      return;
    }
    setPlacing(true);
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addressId: selectedId,
        couponCode: coupon?.code,
        idempotencyKey,
      }),
    });
    const json = await res.json();
    setPlacing(false);
    if (json.ok) {
      await refreshCart();
      router.push(`/order-confirmation/${json.data.orderNumber}`);
    } else {
      toast.error(json.error?.message ?? "Could not place your order");
      if (json.error?.code === "OUT_OF_STOCK") refreshCart();
    }
  }

  if (authState === "loading") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Skeleton className="h-10 w-56" />
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-72 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (authState === "guest") {
    return (
      <EmptyState
        icon="package"
        title="Sign in to check out"
        description="Sign in or create an account — we will keep your cart exactly as you left it."
        actionLabel="Sign in"
        actionHref="/login?next=/checkout"
      />
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon="package"
        title="Your cart is empty"
        description="Add something beautiful before checking out."
        actionLabel="Shop now"
        actionHref="/shop"
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-serif text-4xl font-medium">Checkout</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          {/* Address */}
          <section className="rounded-lg border border-border/70 bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-medium">
                <MapPin className="mr-2 inline h-4 w-4 text-primary" /> Delivery Address
              </h2>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full">
                    <Plus className="h-4 w-4" /> Add new
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add delivery address</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={saveAddress} className="space-y-3">
                    <div>
                      <Label htmlFor="fullName">Full name</Label>
                      <Input id="fullName" name="fullName" required />
                      {addErrors.fullName && <p className="mt-1 text-xs text-destructive">{addErrors.fullName}</p>}
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" name="phone" required placeholder="10-digit mobile" />
                      {addErrors.phone && <p className="mt-1 text-xs text-destructive">{addErrors.phone}</p>}
                    </div>
                    <div>
                      <Label htmlFor="line1">Address line 1</Label>
                      <Input id="line1" name="line1" required placeholder="House / flat, street, area" />
                      {addErrors.line1 && <p className="mt-1 text-xs text-destructive">{addErrors.line1}</p>}
                    </div>
                    <div>
                      <Label htmlFor="line2">Address line 2 (optional)</Label>
                      <Input id="line2" name="line2" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input id="city" name="city" required />
                        {addErrors.city && <p className="mt-1 text-xs text-destructive">{addErrors.city}</p>}
                      </div>
                      <div>
                        <Label htmlFor="pincode">Pincode</Label>
                        <Input id="pincode" name="pincode" required inputMode="numeric" />
                        {addErrors.pincode && <p className="mt-1 text-xs text-destructive">{addErrors.pincode}</p>}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input id="state" name="state" required />
                      {addErrors.state && <p className="mt-1 text-xs text-destructive">{addErrors.state}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="isDefault" name="isDefault" />
                      <Label htmlFor="isDefault" className="text-sm font-normal">
                        Set as default address
                      </Label>
                    </div>
                    <Button
                      type="submit"
                      className="w-full rounded-full bg-primary hover:bg-primary/90"
                    >
                      Save address
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            {addresses === null ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : addresses.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No saved addresses yet. Add one to continue.
              </p>
            ) : (
              <RadioGroup value={selectedId ?? ""} onValueChange={setSelectedId} className="mt-4 space-y-3">
                {addresses.map((a) => (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                      selectedId === a.id ? "border-primary bg-accent/40" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <RadioGroupItem value={a.id} className="mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">
                        {a.fullName}
                        {a.isDefault && (
                          <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                            Default
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} — {a.pincode}
                      </p>
                      <p className="text-muted-foreground tnum">{a.phone}</p>
                    </div>
                    {selectedId === a.id && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </label>
                ))}
              </RadioGroup>
            )}
          </section>

          {/* Payment */}
          <section className="rounded-lg border border-border/70 bg-card p-6">
            <h2 className="font-serif text-xl font-medium">
              <ShieldCheck className="mr-2 inline h-4 w-4 text-primary" /> Payment
            </h2>
            <div className="mt-4 rounded-lg border border-primary/40 bg-accent/40 p-4 text-sm leading-relaxed">
              <p className="font-medium text-accent-foreground">Pay on confirmation</p>
              <p className="mt-1 text-muted-foreground">
                Place your order now and our team will contact you to complete payment securely
                once availability is confirmed. Online payment is activated here as soon as the
                store&apos;s payment provider is configured.
              </p>
            </div>
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-lg border border-border/70 bg-card p-6">
            <h2 className="font-serif text-xl font-medium">Order Summary</h2>
            <ul className="mt-4 max-h-56 space-y-3 overflow-y-auto pr-1 stellora-scroll">
              {cart.items.map((item) => (
                <li key={item.itemId} className="flex items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border/60">
                    <Image
                      src={item.imageUrl ?? "/images/placeholder.svg"}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.variantName} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-medium tnum">{formatINR(item.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <Separator className="my-4" />
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Coupon code"
                  className="pl-9"
                  aria-label="Coupon code"
                />
              </div>
              <Button
                variant="outline"
                onClick={applyCoupon}
                disabled={couponBusy || !couponInput.trim()}
                className="rounded-md"
              >
                {couponBusy ? "…" : "Apply"}
              </Button>
            </div>
            {coupon && (
              <p className="mt-2 flex items-center justify-between text-xs text-primary">
                <span>✓ {coupon.code} applied</span>
                <button
                  className="underline"
                  onClick={() => {
                    setCoupon(null);
                    setCouponInput("");
                  }}
                >
                  remove
                </button>
              </p>
            )}
            <Separator className="my-4" />
            <div className="space-y-2.5 text-sm tnum">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatINR(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-primary">
                  <span>Discount ({coupon?.code})</span>
                  <span>−{formatINR(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Shipping {shipping ? `(${shipping.name})` : ""}
                </span>
                <span className="font-medium">
                  {totals.shipFee === 0 ? "Free" : formatINR(totals.shipFee)}
                </span>
              </div>
              {shipping?.freeAbove && totals.shipFee > 0 && (
                <p className="rounded bg-accent/60 px-3 py-2 text-xs text-accent-foreground">
                  Add {formatINR(shipping.freeAbove - (totals.subtotal - totals.discount))} more for
                  free shipping.
                </p>
              )}
              <Separator />
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatINR(totals.grand)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Taxes included where applicable.</p>
            </div>
            <Button
              size="lg"
              onClick={placeOrder}
              disabled={placing || !selectedId || addresses?.length === 0}
              className="mt-5 w-full rounded-full bg-primary py-6 text-sm tracking-wide hover:bg-primary/90"
            >
              {placing ? "Placing your order…" : `Place Order · ${formatINR(totals.grand)}`}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              By placing this order you agree to our{" "}
              <Link href="/policies/terms" className="underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/policies/returns" className="underline">
                Return Policy
              </Link>
              .
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
