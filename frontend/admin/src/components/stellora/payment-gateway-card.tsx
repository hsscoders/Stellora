"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  BadgeCheck,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * Admin control for real payment gateways (Razorpay + Stripe).
 *
 * - Keys are stored server-side via /api/admin/payments/config and never
 *   returned unmasked — the inputs stay blank and show masked placeholders.
 * - Leave a secret blank to keep the stored value; use "clear" to remove it.
 * - "Test connection" pings the saved keys against the live gateway API.
 * - Demo gateway needs no keys and always works (in-house simulation).
 */

interface GatewayStatus {
  provider: "razorpay" | "stripe" | "demo";
  selected: string;
  razorpay: { configured: boolean; keyId: string; keySecretMasked: string; webhookSecretMasked: string };
  stripe: { configured: boolean; pk: string; secretMasked: string; webhookSecretMasked: string };
}

type Provider = "demo" | "razorpay" | "stripe";

const PROVIDER_META: Record<Provider, { title: string; blurb: string }> = {
  demo: { title: "Demo gateway", blurb: "Built-in simulator — test cards & UPI, no keys needed" },
  razorpay: { title: "Razorpay", blurb: "UPI, cards, netbanking — India-first checkout" },
  stripe: { title: "Stripe", blurb: "Cards + global payment methods via Payment Element" },
};

function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = "off",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10 tnum"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide key" : "Show key"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function CopyRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            toast.success("Webhook URL copied");
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Could not copy — select and copy manually");
          }
        }}
      >
        <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function StatusBadge({ active, configured }: { active: boolean; configured: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-600/10 px-2.5 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
        <BadgeCheck className="h-3.5 w-3.5" /> Active
      </span>
    );
  }
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-600/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
        <ShieldCheck className="h-3.5 w-3.5" /> Keys saved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      Not configured
    </span>
  );
}

const noopSubscribe = () => () => {};

export function PaymentGatewayCard() {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [provider, setProvider] = useState<Provider>("demo");
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  const [razorpayWebhook, setRazorpayWebhook] = useState("");
  const [stripePk, setStripePk] = useState("");
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");
  const [clearRzpSecret, setClearRzpSecret] = useState(false);
  const [clearStripeSecret, setClearStripeSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<Provider | null>(null);
  // Client-only value: server snapshot is "" so hydration never mismatches.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );

  const applyStatus = useCallback((s: GatewayStatus) => {
    setStatus(s);
    setProvider((PROVIDER_META[s.selected as Provider] ? (s.selected as Provider) : "demo"));
  }, []);

  useEffect(() => {
    fetch("/api/admin/payments/config")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) applyStatus(j.data);
        else toast.error(j.error?.message ?? "Could not load payment configuration");
      })
      .catch(() => toast.error("Could not load payment configuration"));
  }, [applyStatus]);

  function validate(): string | null {
    const rzpId = razorpayKeyId.trim();
    const rzpSecret = razorpayKeySecret.trim();
    const sPk = stripePk.trim();
    const sSecret = stripeSecret.trim();

    if (razorpayKeyId && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(rzpId)) {
      return "Razorpay Key ID usually looks like rzp_test_xxxxxxxx or rzp_live_xxxxxxxx.";
    }
    if (sPk && !/^pk_(test|live)_[A-Za-z0-9]+$/.test(sPk)) {
      return "Stripe publishable key usually looks like pk_test_xxxxxxxx or pk_live_xxxxxxxx.";
    }
    if (sSecret && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(sSecret)) {
      return "Stripe secret key usually looks like sk_test_xxxxxxxx or sk_live_xxxxxxxx.";
    }
    if (rzpSecret && rzpId.startsWith("rzp_live") && rzpSecret.length < 8) {
      return "That Razorpay Key Secret looks too short — please paste the full key.";
    }
    return null;
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = { provider };

    const rzp: Record<string, string> = {};
    if (razorpayKeyId.trim()) rzp.keyId = razorpayKeyId.trim();
    if (razorpayKeySecret.trim()) rzp.keySecret = razorpayKeySecret.trim();
    else if (clearRzpSecret) rzp.keySecret = "";
    if (razorpayWebhook.trim() || clearRzpSecret) rzp.webhookSecret = razorpayWebhook.trim();
    if (Object.keys(rzp).length > 0) payload.razorpay = rzp;

    const st: Record<string, string> = {};
    if (stripePk.trim()) st.publishableKey = stripePk.trim();
    if (stripeSecret.trim()) st.secretKey = stripeSecret.trim();
    else if (clearStripeSecret) st.secretKey = "";
    if (stripeWebhook.trim() || clearStripeSecret) st.webhookSecret = stripeWebhook.trim();
    if (Object.keys(st).length > 0) payload.stripe = st;

    try {
      const res = await fetch("/api/admin/payments/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        applyStatus(json.data);
        setRazorpayKeySecret("");
        setStripeSecret("");
        setClearRzpSecret(false);
        setClearStripeSecret(false);
        toast.success(
          json.data.provider === "demo"
            ? "Saved — Demo gateway is now active"
            : `Saved — ${PROVIDER_META[json.data.provider as Provider].title} is now active`
        );
      } else {
        toast.error(json.error?.message ?? "Could not save payment configuration");
      }
    } catch {
      toast.error("Network error while saving");
    } finally {
      setBusy(false);
    }
  }

  async function testGateway(p: "razorpay" | "stripe") {
    setTesting(p);
    // Prefer the values currently typed in the form (tested ephemerally,
    // never stored); fall back to the saved configuration.
    const keys =
      p === "razorpay"
        ? razorpayKeyId.trim() || razorpayKeySecret.trim()
          ? { razorpay: { keyId: razorpayKeyId.trim(), keySecret: razorpayKeySecret.trim() } }
          : undefined
        : stripeSecret.trim()
          ? { stripe: { secretKey: stripeSecret.trim() } }
          : undefined;
    try {
      const res = await fetch("/api/admin/payments/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keys ? { provider: p, keys } : { provider: p }),
      });
      const json = await res.json();
      if (json.ok) {
        const r = json.data as { ok: boolean; message: string };
        if (r.ok) toast.success(r.message);
        else toast.error(r.message);
      } else {
        toast.error(json.error?.message ?? "Test failed");
      }
    } catch {
      toast.error("Network error while testing the connection");
    } finally {
      setTesting(null);
    }
  }

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-xl">
            <Wallet className="h-5 w-5" /> Payment gateway
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payment configuration…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-xl">
          <Wallet className="h-5 w-5" /> Payment gateway
        </CardTitle>
        <CardDescription>
          Collect real payments. Keys are stored in your database, always shown masked here, and can be verified
          against the live gateway before going active.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-6">
          {/* Provider choice */}
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Active payment provider">
            {(Object.keys(PROVIDER_META) as Provider[]).map((p) => {
              const active = status.provider === p;
              const configured = p === "demo" ? true : p === "razorpay" ? status.razorpay.configured : status.stripe.configured;
              const selected = provider === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setProvider(p)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border hover:border-primary/40 hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{PROVIDER_META[p].title}</span>
                    <StatusBadge active={active} configured={configured} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{PROVIDER_META[p].blurb}</p>
                </button>
              );
            })}
          </div>

          {/* Razorpay keys */}
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Razorpay keys</p>
              <div className="flex items-center gap-2">
                <StatusBadge active={status.provider === "razorpay"} configured={status.razorpay.configured} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  disabled={testing !== null}
                  onClick={() => testGateway("razorpay")}
                >
                  {testing === "razorpay" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                  Test connection
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="rzp-key-id">Key ID {status.razorpay.keyId && <span className="text-xs text-muted-foreground">(saved: {status.razorpay.keyId})</span>}</Label>
                <Input
                  id="rzp-key-id"
                  value={razorpayKeyId}
                  onChange={(e) => setRazorpayKeyId(e.target.value)}
                  placeholder={status.razorpay.keyId || "rzp_test_xxxxxxxxxxxx"}
                  className="tnum"
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Leave blank to keep the saved Key ID.</p>
              </div>
              <div>
                <Label htmlFor="rzp-key-secret">Key Secret</Label>
                {clearRzpSecret ? (
                  <div className="flex items-center gap-2">
                    <Input disabled placeholder="Will be cleared on save" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setClearRzpSecret(false)}>
                      Undo
                    </Button>
                  </div>
                ) : (
                  <SecretInput
                    id="rzp-key-secret"
                    value={razorpayKeySecret}
                    onChange={setRazorpayKeySecret}
                    placeholder={status.razorpay.keySecretMasked ? `saved ${status.razorpay.keySecretMasked}` : "Razorpay dashboard → API Keys"}
                  />
                )}
                {status.razorpay.keySecretMasked && !clearRzpSecret && (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                    onClick={() => {
                      setClearRzpSecret(true);
                      setRazorpayKeySecret("");
                    }}
                  >
                    Clear stored secret
                  </button>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="rzp-webhook">Webhook secret (optional)</Label>
                <SecretInput
                  id="rzp-webhook"
                  value={razorpayWebhook}
                  onChange={setRazorpayWebhook}
                  placeholder={status.razorpay.webhookSecretMasked ? `saved ${status.razorpay.webhookSecretMasked}` : "For payment webhooks"}
                />
              </div>
            </div>
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                Paste this URL in Razorpay Dashboard → Settings → Webhooks (events: <code>payment.captured</code>, <code>order.paid</code>):
              </p>
              <CopyRow url={`${origin}/api/payments/webhook/razorpay`} />
            </div>
          </div>

          {/* Stripe keys */}
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Stripe keys</p>
              <div className="flex items-center gap-2">
                <StatusBadge active={status.provider === "stripe"} configured={status.stripe.configured} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  disabled={testing !== null}
                  onClick={() => testGateway("stripe")}
                >
                  {testing === "stripe" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                  Test connection
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="stripe-pk">Publishable key</Label>
                <Input
                  id="stripe-pk"
                  value={stripePk}
                  onChange={(e) => setStripePk(e.target.value)}
                  placeholder={status.stripe.pk || "pk_test_xxxxxxxxxxxx"}
                  className="tnum"
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Safe to show in the browser.</p>
              </div>
              <div>
                <Label htmlFor="stripe-secret">Secret key</Label>
                {clearStripeSecret ? (
                  <div className="flex items-center gap-2">
                    <Input disabled placeholder="Will be cleared on save" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setClearStripeSecret(false)}>
                      Undo
                    </Button>
                  </div>
                ) : (
                  <SecretInput
                    id="stripe-secret"
                    value={stripeSecret}
                    onChange={setStripeSecret}
                    placeholder={status.stripe.secretMasked ? `saved ${status.stripe.secretMasked}` : "sk_test_xxxxxxxxxxxx"}
                  />
                )}
                {status.stripe.secretMasked && !clearStripeSecret && (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                    onClick={() => {
                      setClearStripeSecret(true);
                      setStripeSecret("");
                    }}
                  >
                    Clear stored secret
                  </button>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="stripe-webhook">Webhook signing secret (optional)</Label>
                <SecretInput
                  id="stripe-webhook"
                  value={stripeWebhook}
                  onChange={setStripeWebhook}
                  placeholder={status.stripe.webhookSecretMasked ? `saved ${status.stripe.webhookSecretMasked}` : "whsec_…"}
                />
              </div>
            </div>
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                Add this endpoint in Stripe Dashboard → Developers → Webhooks (event: <code>payment_intent.succeeded</code>):
              </p>
              <CopyRow url={`${origin}/api/payments/webhook/stripe`} />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              {provider === "demo" ? (
                <>
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Demo mode uses simulated cards (4111 1111 1111 1111 succeeds) — perfect for testing the full order flow.
                </>
              ) : (
                <>
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Save first, then use “Test connection” to verify the stored keys against the live gateway API.
                </>
              )}
            </p>
            <Button type="submit" disabled={busy} className="rounded-full bg-primary px-8 hover:bg-primary/90">
              {busy ? "Saving…" : "Save payment settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
