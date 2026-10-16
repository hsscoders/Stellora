"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const TRANSITIONS: Record<string, { next: string; needsShipping?: boolean }[]> = {
  PENDING: [{ next: "CONFIRMED" }, { next: "CANCELLED" }],
  CONFIRMED: [{ next: "PROCESSING" }, { next: "CANCELLED" }],
  PROCESSING: [{ next: "SHIPPED", needsShipping: true }, { next: "CANCELLED" }],
  SHIPPED: [{ next: "DELIVERED" }],
  DELIVERED: [],
  CANCELLED: [],
};

const PAYMENT_FLOW: Record<string, string[]> = {
  PENDING: ["PAID", "FAILED"],
  PAID: ["REFUNDED"],
  FAILED: ["PENDING", "PAID"],
  REFUNDED: [],
};

export function OrderActions({
  orderId,
  status,
  paymentStatus,
  shipment,
}: {
  orderId: string;
  status: string;
  paymentStatus: string;
  shipment: { carrier: string | null; trackingNumber: string | null; status: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const transitions = TRANSITIONS[status] ?? [];
  const paymentOptions = PAYMENT_FLOW[paymentStatus] ?? [];

  async function changeStatus(next: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: next,
        note: form.get("note") || undefined,
        carrier: form.get("carrier") || undefined,
        trackingNumber: form.get("trackingNumber") || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      toast.success(`Order moved to ${next}`);
      router.refresh();
    } else {
      toast.error(json.error?.message ?? "Transition failed");
    }
  }

  async function changePayment(next: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/orders/${orderId}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus: next }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      toast.success(`Payment marked ${next}`);
      router.refresh();
    } else {
      toast.error(json.error?.message ?? "Update failed");
    }
  }

  return (
    <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
      <section className="rounded-lg border border-border/70 bg-card p-6">
        <h2 className="font-serif text-lg font-medium">Order status</h2>
        <p className="mt-2 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-foreground">
          {status}
        </p>
        {transitions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No further transitions from this state.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {transitions.map((t) => (
              <form key={t.next} onSubmit={(e) => changeStatus(t.next, e)} className="space-y-3 rounded-md border border-border p-4">
                <p className="text-sm font-medium">
                  Move to <Badge className="ml-1">{t.next}</Badge>
                </p>
                {t.needsShipping && (
                  <>
                    <div>
                      <Label htmlFor="carrier">Carrier</Label>
                      <Input id="carrier" name="carrier" placeholder="e.g. BlueDart" required />
                    </div>
                    <div>
                      <Label htmlFor="tracking">Tracking number</Label>
                      <Input id="tracking" name="trackingNumber" required />
                    </div>
                  </>
                )}
                <div>
                  <Label htmlFor={`note-${t.next}`}>
                    {t.next === "CANCELLED" ? "Cancellation reason (required)" : "Note (optional)"}
                  </Label>
                  <Textarea
                    id={`note-${t.next}`}
                    name="note"
                    rows={2}
                    required={t.next === "CANCELLED"}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy}
                  className={`w-full rounded-full ${
                    t.next === "CANCELLED"
                      ? "bg-destructive text-white hover:bg-destructive/90"
                      : "bg-primary hover:bg-primary/90"
                  }`}
                >
                  Confirm → {t.next}
                </Button>
              </form>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border/70 bg-card p-6">
        <h2 className="font-serif text-lg font-medium">Payment</h2>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Current:</span>
          <Badge variant="secondary">{paymentStatus}</Badge>
        </div>
        {shipment?.trackingNumber && (
          <>
            <Separator className="my-4" />
            <p className="text-sm text-muted-foreground">
              Shipment: {shipment.status}
              {shipment.carrier ? ` · ${shipment.carrier}` : ""}
              {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}
            </p>
          </>
        )}
        {paymentOptions.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              Only change payment status with verified evidence (e.g. payment received on
              confirmation). All changes are audit-logged.
            </p>
            {paymentOptions.map((p) => (
              <Button
                key={p}
                variant="outline"
                size="sm"
                disabled={busy}
                className="w-full rounded-full"
                onClick={() => changePayment(p)}
              >
                Mark as {p}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No further payment changes.</p>
        )}
      </section>
    </aside>
  );
}
