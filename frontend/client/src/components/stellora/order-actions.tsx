"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Repeat2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type OrderItem = { id: string; productName: string; variantName: string; quantity: number };

type RequestRow = {
  id: string;
  type: "RETURN" | "EXCHANGE";
  reason: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";
  createdAt: string;
  adminNote?: string | null;
};

const REASONS = [
  "Wrong item received",
  "Item damaged / defective",
  "Size or fit issue",
  "Quality not as expected",
  "Changed my mind",
  "Other",
];

/**
 * Customer self-service actions on an order:
 *  - cancel while it's still in a cancellable state
 *  - raise a return / exchange request with item selection
 *  - see the status of previously raised requests
 */
export function OrderActions({
  orderNumber,
  status,
  items,
}: {
  orderNumber: string;
  status: string;
  items: OrderItem[];
}) {
  const router = useRouter();
  const cancellable = ["PENDING", "CONFIRMED", "PROCESSING"].includes(status);
  const requestable = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(status);

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [openForm, setOpenForm] = useState(false);
  const [type, setType] = useState<"RETURN" | "EXCHANGE">("RETURN");
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelledDone, setCancelledDone] = useState(false);

  const loadRequests = () =>
    fetch(`/api/orders/${encodeURIComponent(orderNumber)}/requests`)
      .then((r) => r.json())
      .then((j) => setRequests(j.ok ? j.data : []))
      .catch(() => {});

  useEffect(() => {
    if (requestable) loadRequests();
  }, [orderNumber, requestable]);

  const cancelOrder = async () => {
    if (!window.confirm("Cancel this order? Reserved stock will be released.")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/cancel`, { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        toast.success("Order cancelled. Stock has been released.");
        setCancelledDone(true);
        router.refresh();
      } else {
        toast.error(json.error?.message ?? "Could not cancel this order.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const toggleItem = (name: string, max: number) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[name]) delete next[name];
      else next[name] = max;
      return next;
    });
  };

  const submitRequest = async () => {
    const selected = Object.entries(picked).map(([productName, quantity]) => {
      const item = items.find((i) => i.productName === productName);
      return {
        orderItemId: item?.id ?? "",
        productName,
        variantName: item?.variantName ?? "",
        quantity,
      };
    });
    if (selected.length === 0) {
      toast.error("Select at least one item");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, reason, details, items: selected }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(json.data?.message ?? "Request submitted.");
        setOpenForm(false);
        setPicked({});
        setDetails("");
        loadRequests();
      } else {
        toast.error(json.error?.message ?? "Could not submit your request.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (s: RequestRow["status"]) =>
    ({
      REQUESTED: "bg-muted text-muted-foreground",
      APPROVED: "bg-accent text-accent-foreground",
      REJECTED: "bg-destructive/10 text-destructive",
      COMPLETED: "bg-primary/15 text-primary",
    })[s];

  return (
    <section className="rounded-lg border border-border/70 bg-card p-6">
      <h2 className="font-serif text-xl font-medium">Order Help</h2>

      {cancellable && !cancelledDone && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 p-4">
          <p className="text-sm text-muted-foreground">
            Changed your mind? You can cancel while the order is being prepared.
          </p>
          <Button
            variant="outline"
            disabled={cancelling}
            onClick={cancelOrder}
            className="btn-press shrink-0 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <XCircle className="h-4 w-4" />
            {cancelling ? "Cancelling…" : "Cancel order"}
          </Button>
        </div>
      )}

      {requestable && (
        <div className="mt-4">
          {!openForm ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 p-4">
              <p className="text-sm text-muted-foreground">
                Need to send something back or swap it? Raise a request — we usually respond within
                24–48 hours.
              </p>
              <Button
                variant="outline"
                onClick={() => setOpenForm(true)}
                className="btn-press shrink-0 rounded-full border-primary/50"
              >
                <RotateCcw className="h-4 w-4" /> Return / Exchange
              </Button>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-border/60 p-4">
              <div className="flex gap-2">
                <Button
                  variant={type === "RETURN" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setType("RETURN")}
                  className={cn("rounded-full", type === "RETURN" && "bg-primary hover:bg-primary/90")}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Return
                </Button>
                <Button
                  variant={type === "EXCHANGE" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setType("EXCHANGE")}
                  className={cn("rounded-full", type === "EXCHANGE" && "bg-primary hover:bg-primary/90")}
                >
                  <Repeat2 className="h-3.5 w-3.5" /> Exchange
                </Button>
              </div>

              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Items
              </p>
              <ul className="mt-2 space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={!!picked[item.productName]}
                        onChange={() => toggleItem(item.productName, item.quantity)}
                      />
                      {item.productName}
                      <span className="text-xs text-muted-foreground">
                        {item.variantName} · Qty {item.quantity}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-label="Reason"
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>

              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Anything else we should know? (optional)"
                rows={3}
                maxLength={1000}
                className="mt-3"
                aria-label="Additional details"
              />

              <div className="mt-4 flex gap-2">
                <Button
                  onClick={submitRequest}
                  disabled={busy}
                  className="btn-press rounded-full bg-primary hover:bg-primary/90"
                >
                  {busy ? "Submitting…" : `Submit ${type.toLowerCase()} request`}
                </Button>
                <Button variant="ghost" onClick={() => setOpenForm(false)} className="rounded-full">
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {requests.length > 0 && (
        <ul className="mt-4 space-y-2">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-4 py-3 text-sm"
            >
              <span>
                {r.type === "RETURN" ? "Return" : "Exchange"} · {r.reason}
              </span>
              <span className="flex items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider", statusBadge(r.status))}>
                  {r.status}
                </span>
                {r.adminNote && <span className="text-xs text-muted-foreground">— {r.adminNote}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
