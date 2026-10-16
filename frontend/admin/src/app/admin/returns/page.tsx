"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/notify";
import { RotateCcw, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

interface ReturnRow {
  id: string;
  orderNumber: string;
  customer: { name: string; email: string } | null;
  type: "RETURN" | "EXCHANGE";
  reason: string;
  details: string;
  items: { productName: string; variantName: string; quantity: number }[];
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";
  adminNote: string | null;
  createdAt: string;
}

const STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"] as const;

export default function AdminReturnsPage() {
  const [rows, setRows] = useState<ReturnRow[] | null>(null);

  const load = () =>
    fetch("/api/admin/returns")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []))
      .catch(() => setRows([]));

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: (typeof STATUSES)[number]) {
    const res = await fetch(`/api/admin/returns/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(`Marked ${status.toLowerCase()}`);
      load();
    } else {
      toast.error(json.error?.message ?? "Update failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-medium">Returns &amp; Exchanges</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer requests for returns and exchanges — approve, reject or mark completed.
        </p>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <RotateCcw className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No return or exchange requests yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {r.type === "RETURN" ? (
                      <RotateCcw className="h-4 w-4 text-primary" />
                    ) : (
                      <Repeat2 className="h-4 w-4 text-primary" />
                    )}
                    {r.type === "RETURN" ? "Return" : "Exchange"} · Order {r.orderNumber}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.customer?.name} · {r.customer?.email} · {formatDateTime(r.createdAt)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    r.status === "REQUESTED"
                      ? "border-amber-500/40 text-amber-600"
                      : r.status === "APPROVED"
                        ? "border-primary/40 text-primary"
                        : r.status === "COMPLETED"
                          ? "border-emerald-500/40 text-emerald-600"
                          : "border-destructive/40 text-destructive"
                  }
                >
                  {r.status}
                </Badge>
              </div>

              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Reason
                  </p>
                  <p className="mt-1">{r.reason}</p>
                  {r.details && <p className="mt-1 text-xs text-muted-foreground">{r.details}</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Items
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {r.items.map((i, idx) => (
                      <li key={idx}>
                        {i.productName} · {i.variantName} × {i.quantity}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {STATUSES.filter((s) => s !== r.status).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === "APPROVED" ? "default" : "outline"}
                    onClick={() => setStatus(r.id, s)}
                    className={`rounded-full text-xs ${s === "APPROVED" ? "bg-primary hover:bg-primary/90" : ""}`}
                  >
                    Mark {s.toLowerCase()}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
