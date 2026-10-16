"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/notify";
import { CreditCard, Landmark, Loader2, Lock, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatINR } from "@/lib/utils";

/**
 * Secure checkout modal for the Stellora payment gateway.
 *
 * - Demo mode (default): a fully simulated hosted checkout — cards & UPI,
 *   server-side authorization rules, HMAC-signed handshake, instant settle.
 * - Razorpay mode: opens Razorpay Checkout when real API keys are configured.
 */

interface Intent {
  orderNumber: string;
  amount: number;
  currency: string;
  provider: string;
  demo: boolean;
  keyId: string | null;
  gatewayOrderId: string;
  customer?: { name: string | null; email: string } | null;
}

type Stage = "preparing" | "form" | "processing" | "declined";

export function PaymentModal({
  open,
  onOpenChange,
  orderNumber,
  amount,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderNumber: string;
  amount: number;
  onSuccess: () => void;
}) {
  const [stage, setStage] = useState<Stage>("preparing");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [upi, setUpi] = useState("");
  const [declineReason, setDeclineReason] = useState<string | null>(null);
  const settled = useRef(false);

  const runPrepare = useCallback(async () => {
    setStage("preparing");
    setIntent(null);
    setPrepError(null);
    setDeclineReason(null);
    setCard("");
    setExpiry("");
    setCvv("");
    setUpi("");
    try {
      const res = await fetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const json = await res.json();
      if (!json.ok) {
        setPrepError(json.error?.message ?? "Could not start the payment. Please try again.");
        setStage("declined");
        return;
      }
      if (json.data.alreadyPaid) {
        onSuccess();
        return;
      }
      setIntent(json.data);
      setStage("form");
      if (!json.data.demo && json.data.provider === "razorpay") {
        openRazorpay(json.data);
      }
    } catch {
      setPrepError("Network error while contacting the payment gateway.");
      setStage("declined");
    }
  }, [orderNumber, onSuccess]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      // Yield so state resets happen outside the effect's synchronous window
      await new Promise((r) => setTimeout(r, 50));
      if (cancelled) return;
      await runPrepare();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, runPrepare]);

  function openRazorpay(data: Intent) {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => {
      const rzp = new (window as any).Razorpay({
        key: data.keyId,
        amount: Math.round(data.amount * 100),
        currency: data.currency,
        name: "Stellora",
        description: `Order ${data.orderNumber}`,
        order_id: data.gatewayOrderId,
        prefill: { name: data.customer?.name ?? "" },
        theme: { color: "#8e1f45" },
        handler: async (response: any) => {
          await settle(data.orderNumber, response.razorpay_payment_id, response.razorpay_signature);
        },
        modal: { ondismiss: () => setStage("form") },
      });
      rzp.open();
    };
    document.body.appendChild(script);
  }

  async function settle(orderNumber: string, gatewayPaymentId: string, gatewaySignature: string) {
    const res = await fetch("/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber, gatewayPaymentId, gatewaySignature }),
    });
    const json = await res.json();
    if (json.ok) {
      settled.current = true;
      toast.success("Payment successful — thank you!");
      onSuccess();
    } else {
      setDeclineReason(json.error?.message ?? "We could not verify this payment.");
      setStage("declined");
    }
  }

  async function payCard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!intent) return;
    setStage("processing");
    try {
      const res = await fetch("/api/payments/demo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: intent.orderNumber, cardNumber: card, expiry, cvv }),
      });
      const json = await res.json();
      if (!json.ok || !json.data.approved) {
        setDeclineReason(json.data?.reason ?? json.error?.message ?? "Payment declined.");
        setStage("declined");
        return;
      }
      await settle(intent.orderNumber, json.data.gatewayPaymentId, json.data.gatewaySignature);
    } catch {
      setDeclineReason("Network error while contacting the payment gateway.");
      setStage("declined");
    }
  }

  async function payUpi(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!intent) return;
    setStage("processing");
    try {
      const res = await fetch("/api/payments/demo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: intent.orderNumber, upiId: upi }),
      });
      const json = await res.json();
      if (!json.ok || !json.data.approved) {
        setDeclineReason(json.data?.reason ?? json.error?.message ?? "Payment declined.");
        setStage("declined");
        return;
      }
      await settle(intent.orderNumber, json.data.gatewayPaymentId, json.data.gatewaySignature);
    } catch {
      setDeclineReason("Network error while contacting the payment gateway.");
      setStage("declined");
    }
  }

  function fillSuccessCard() {
    setCard("4111 1111 1111 1111");
    setExpiry("12/28");
    setCvv("123");
    setDeclineReason(null);
    setStage("form");
  }

  function fillDeclinedCard() {
    setCard("4000 0000 0000 0002");
    setExpiry("12/28");
    setCvv("123");
    setDeclineReason(null);
    setStage("form");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden p-0">
        <div className="brand-gradient px-6 py-5 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] opacity-80">Secure Checkout</p>
              <p className="mt-1 font-serif text-2xl font-medium tnum">{formatINR(amount)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
              <Lock className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-xs opacity-80">Order {orderNumber} · 256-bit encrypted</p>
        </div>

        {stage === "preparing" && (
          <div className="flex flex-col items-center gap-3 px-6 py-12">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Contacting payment gateway…</p>
          </div>
        )}

        {stage === "form" && intent && (
          <div className="px-6 py-5">
            {intent.demo && (
              <p className="mb-4 flex items-start gap-2 rounded-md border border-primary/30 bg-accent/50 px-3 py-2 text-xs leading-relaxed text-accent-foreground">
                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Test gateway mode.</strong> Use card{" "}
                  <button type="button" className="font-semibold underline" onClick={fillSuccessCard}>
                    4111 1111 1111 1111
                  </button>{" "}
                  to succeed or{" "}
                  <button type="button" className="font-semibold underline" onClick={fillDeclinedCard}>
                    4000 0000 0000 0002
                  </button>{" "}
                  to see a decline. Any UPI ID like <em>name@bank</em> works.
                </span>
              </p>
            )}
            <Tabs defaultValue="card">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="card" className="gap-2">
                  <CreditCard className="h-4 w-4" /> Card
                </TabsTrigger>
                <TabsTrigger value="upi" className="gap-2">
                  <Smartphone className="h-4 w-4" /> UPI
                </TabsTrigger>
              </TabsList>

              <TabsContent value="card">
                <form onSubmit={payCard} className="mt-4 space-y-3">
                  <div>
                    <Label htmlFor="gw-card">Card number</Label>
                    <Input
                      id="gw-card"
                      value={card}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 19);
                        setCard(digits.replace(/(.{4})/g, "$1 ").trim());
                      }}
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="4111 1111 1111 1111"
                      className="tnum"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="gw-exp">Expiry</Label>
                      <Input
                        id="gw-exp"
                        value={expiry}
                        onChange={(e) => {
                          let v = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
                          if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
                          setExpiry(v);
                        }}
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        placeholder="MM/YY"
                        className="tnum"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="gw-cvv">CVV</Label>
                      <Input
                        id="gw-cvv"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        type="password"
                        placeholder="•••"
                        className="tnum"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full rounded-full bg-primary py-6 hover:bg-primary/90">
                    Pay {formatINR(amount)}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="upi">
                <form onSubmit={payUpi} className="mt-4 space-y-3">
                  <div>
                    <Label htmlFor="gw-upi">UPI ID</Label>
                    <Input
                      id="gw-upi"
                      value={upi}
                      onChange={(e) => setUpi(e.target.value.trim())}
                      placeholder="yourname@bank"
                      required
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      You will receive a collect request in your UPI app.
                    </p>
                  </div>
                  <Button type="submit" className="w-full rounded-full bg-primary py-6 hover:bg-primary/90">
                    Pay {formatINR(amount)}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Payments are verified with HMAC signatures server-side
            </p>
          </div>
        )}

        {stage === "processing" && (
          <div className="flex flex-col items-center gap-3 px-6 py-12">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm font-medium">Authorising your payment…</p>
            <p className="text-xs text-muted-foreground">Do not close this window</p>
          </div>
        )}

        {stage === "declined" && (
          <div className="px-6 py-6">
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {prepError ?? declineReason ?? "Payment could not be completed."}
            </div>
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-full"
                onClick={() => {
                  void runPrepare();
                }}
              >
                Try again
              </Button>
              <Button
                variant="ghost"
                className="flex-1 rounded-full"
                onClick={() => onOpenChange(false)}
              >
                Pay later
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-4 border-t border-border/70 bg-muted/40 px-6 py-2.5">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <CreditCard className="h-3 w-3" /> Cards
          </span>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Smartphone className="h-3 w-3" /> UPI
          </span>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Landmark className="h-3 w-3" /> NetBanking
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
