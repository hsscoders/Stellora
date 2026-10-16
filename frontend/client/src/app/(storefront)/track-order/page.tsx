"use client";

import { useState } from "react";
import { PackageSearch } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";

interface TrackResult {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  placedAt: string;
  shippedAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  events: { status: string; note: string | null; at: string }[];
}

const FLOW = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

export default function TrackOrderPage() {
  const [result, setResult] = useState<TrackResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setNotFound(false);
    setResult(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: form.get("orderNumber"),
        email: form.get("email"),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) setResult(json.data);
    else {
      setNotFound(true);
      toast.error(json.error?.message ?? "Order not found");
    }
  }

  const cancelled = result?.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent">
          <PackageSearch className="h-6 w-6 text-accent-foreground" />
        </div>
        <h1 className="mt-5 font-serif text-4xl font-medium">Track Your Order</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Enter your order number and the email used at checkout to see live, server-verified
          status.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mx-auto mt-8 max-w-md space-y-4">
        <div>
          <Label htmlFor="orderNumber">Order number</Label>
          <Input id="orderNumber" name="orderNumber" required placeholder="STL-2026-XXXXXX" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="you@example.com" />
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-primary py-6 text-sm hover:bg-primary/90"
        >
          {busy ? "Checking…" : "Track Order"}
        </Button>
      </form>

      {notFound && (
        <p className="mx-auto mt-6 max-w-md rounded-md border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive">
          We could not find an order matching those details. Double-check and try again.
        </p>
      )}

      {result && (
        <div className="mx-auto mt-10 max-w-md rounded-lg border border-border/70 bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="font-serif text-xl font-medium">{result.orderNumber}</p>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-foreground">
              {result.status.replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Placed {formatDateTime(result.placedAt)} · Payment: {result.paymentStatus}
          </p>

          {result.shippedAt && (
            <p className="mt-3 rounded-md bg-accent/50 px-3 py-2 text-xs text-accent-foreground">
              Shipped {formatDateTime(result.shippedAt)}
              {result.carrier ? ` via ${result.carrier}` : ""}
              {result.trackingNumber ? ` · Tracking: ${result.trackingNumber}` : ""}
            </p>
          )}

          {!cancelled && (
            <ol className="mt-6 space-y-0">
              {FLOW.map((stage, i) => {
                const event = result.events.find((e) => e.status === stage);
                const done = !!event || FLOW.indexOf(result.status) >= i;
                const isCurrent = result.status === stage;
                return (
                  <li key={stage} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < FLOW.length - 1 && (
                      <span
                        className={`absolute left-[7px] top-4 h-full w-px ${done ? "bg-primary" : "bg-border"}`}
                      />
                    )}
                    <span
                      className={`relative mt-0.5 flex h-4 w-4 shrink-0 rounded-full border-2 ${
                        done ? "border-primary bg-primary" : "border-border bg-background"
                      }`}
                    />
                    <div>
                      <p className={`text-sm font-medium ${done ? "" : "text-muted-foreground"}`}>
                        {stage === "PENDING"
                          ? "Order Placed"
                          : stage === "CONFIRMED"
                            ? "Confirmed"
                            : stage === "PROCESSING"
                              ? "Processing"
                              : stage === "SHIPPED"
                                ? "Shipped"
                                : "Delivered"}
                      </p>
                      {event && (
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(event.at)}
                          {event.note ? ` — ${event.note}` : ""}
                        </p>
                      )}
                      {isCurrent && !event && (
                        <p className="text-xs text-primary">In progress</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {cancelled && (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This order was cancelled. Any reserved stock has been released.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
