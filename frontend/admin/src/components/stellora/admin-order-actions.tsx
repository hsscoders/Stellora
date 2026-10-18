"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Truck } from "lucide-react";

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

type Partner = { id: string; name: string; trackingUrl: string | null };

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
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [defaultPartner, setDefaultPartner] = useState<string>("shiprocket");
  const [customUrl, setCustomUrl] = useState<string>("");
  const [shipPartner, setShipPartner] = useState<string>("");
  const [awb, setAwb] = useState<string>("");

  /* Delivery partner catalog + saved store default (Admin → Settings). */
  useEffect(() => {
    fetch("/api/admin/delivery/config")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setPartners(j.data.partners);
        setDefaultPartner(j.data.config?.partnerId ?? "shiprocket");
        setCustomUrl(j.data.config?.customTrackingUrl ?? "");
      })
      .catch(() => {});
  }, []);

  const transitions = TRANSITIONS[status] ?? [];
  const paymentOptions = PAYMENT_FLOW[paymentStatus] ?? [];

  const selectedPartner = partners?.find((p) => p.id === shipPartner) ?? null;
  const previewPattern =
    shipPartner === "custom"
      ? customUrl
      : selectedPartner?.trackingUrl ?? null;
  const previewUrl =
    previewPattern && awb.trim()
      ? previewPattern.includes("{awb}")
        ? previewPattern.replace("{awb}", encodeURIComponent(awb.trim()))
        : previewPattern
      : null;

  async function changeStatus(next: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const partnerName =
      partners?.find((p) => p.id === (form.get("partnerId") ?? ""))?.name ??
      (form.get("partnerId") as string) ??
      undefined;
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: next,
        note: form.get("note") || undefined,
        carrier: partnerName || undefined,
        trackingNumber: form.get("trackingNumber") || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      toast.success(
        next === "SHIPPED"
          ? `Order shipped via ${partnerName ?? "courier"} — customer's tracking page updated live`
          : `Order moved to ${next}`
      );
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
                      <Label htmlFor="partnerId" className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5" aria-hidden />
                        Delivery partner
                      </Label>
                      <select
                        id="partnerId"
                        name="partnerId"
                        value={shipPartner}
                        onChange={(e) => setShipPartner(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {!partners && <option>Loading…</option>}
                        {partners?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.id === defaultPartner ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                      {shipPartner === "custom" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Custom courier — configure its name &amp; tracking URL under Settings → Delivery partner.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="tracking">Tracking number (AWB)</Label>
                      <Input
                        id="tracking"
                        name="trackingNumber"
                        required
                        value={awb}
                        onChange={(e) => setAwb(e.target.value)}
                        placeholder="e.g. SR1234567890"
                      />
                    </div>
                    {previewUrl && (
                      <p className="text-xs text-muted-foreground">
                        Customer gets a one-click tracking link:{" "}
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
                        >
                          preview <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </p>
                    )}
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
            <div className="rounded-md border border-border/60 bg-muted/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Truck className="h-3.5 w-3.5" aria-hidden /> Shipment
              </p>
              <p className="mt-1 text-sm">
                {shipment.carrier ?? "Courier"} · {shipment.trackingNumber}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Status: {shipment.status}</p>
              {(() => {
                const stored = partners?.find((p) => p.name.toLowerCase() === (shipment.carrier ?? "").toLowerCase());
                const pattern =
                  stored?.trackingUrl ??
                  (stored?.id === "custom" || (!stored && shipment.carrier) ? customUrl : null);
                const url =
                  pattern && pattern.includes("{awb}")
                    ? pattern.replace("{awb}", encodeURIComponent(shipment.trackingNumber))
                    : pattern;
                return url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Track on {shipment.carrier ?? "courier"} site <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null;
              })()}
            </div>
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
