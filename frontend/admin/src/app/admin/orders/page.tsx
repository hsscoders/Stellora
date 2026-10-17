"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR, formatDate } from "@/lib/utils";

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  source?: "POS" | "ONLINE";
  grandTotal: string;
  createdAt: string;
  user: { name: string; email: string } | null;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  PROCESSING: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  SHIPPED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  DELIVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const ORDER_STATUSES = ["ALL", "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
const PAYMENT_STATUSES = ["ALL", "PENDING", "PAID", "REFUNDED", "FAILED"] as const;
const SOURCES = ["ALL", "ONLINE", "POS"] as const;

type ChipProps<T extends string> = { value: T; options: readonly T[]; onChange: (v: T) => void; label: string };

function ChipRow<T extends string>({ value, options, onChange, label }: ChipProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {options.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          aria-pressed={value === s}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            value === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {s === "ALL" ? "All" : s}
        </button>
      ))}
    </div>
  );
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof ORDER_STATUSES)[number]>("ALL");
  const [payFilter, setPayFilter] = useState<(typeof PAYMENT_STATUSES)[number]>("ALL");
  const [sourceFilter, setSourceFilter] = useState<(typeof SOURCES)[number]>("ALL");

  // Deep-link support (e.g. notifications → /admin/orders?status=PENDING)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const s = new URLSearchParams(window.location.search).get("status");
      if (s && (ORDER_STATUSES as readonly string[]).includes(s)) {
        setStatusFilter(s as (typeof ORDER_STATUSES)[number]);
      }
      const pay = new URLSearchParams(window.location.search).get("payment");
      if (pay && (PAYMENT_STATUSES as readonly string[]).includes(pay)) {
        setPayFilter(pay as (typeof PAYMENT_STATUSES)[number]);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    fetch("/api/admin/orders-list")
      .then((r) => r.json())
      .then((j) => setOrders(j.ok ? j.data : []))
      .catch(() => setOrders([]));
  }, []);

  const filtered = useMemo(
    () =>
      orders?.filter(
        (o) =>
          (statusFilter === "ALL" || o.status === statusFilter) &&
          (payFilter === "ALL" || (o.paymentStatus ?? "").toUpperCase() === payFilter) &&
          (sourceFilter === "ALL" || (o.source ?? "ONLINE") === sourceFilter) &&
          (!q ||
            o.orderNumber.toLowerCase().includes(q.toLowerCase()) ||
            (o.user?.email ?? "").toLowerCase().includes(q.toLowerCase()) ||
            (o.user?.name ?? "walk-in").toLowerCase().includes(q.toLowerCase()))
      ),
    [orders, statusFilter, payFilter, sourceFilter, q]
  );

  const summary = useMemo(() => {
    if (!filtered) return null;
    const revenue = filtered
      .filter((o) => o.status !== "CANCELLED")
      .reduce((n, o) => n + Number(o.grandTotal ?? 0), 0);
    return { count: filtered.length, revenue };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-medium">Orders</h1>
        <a href="/api/admin/export/orders" className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm transition hover:border-primary hover:text-primary">
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order no. or customer…" className="pl-9" />
        </div>
        <ChipRow label="Order status" value={statusFilter} options={ORDER_STATUSES} onChange={setStatusFilter} />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</span>
          <ChipRow label="Payment status" value={payFilter} options={PAYMENT_STATUSES} onChange={setPayFilter} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Channel</span>
          <ChipRow label="Sales channel" value={sourceFilter} options={SOURCES} onChange={setSourceFilter} />
        </div>
      </div>

      {orders === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {summary && (
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border border-border bg-card px-3 py-1 tnum">
                {summary.count} order{summary.count === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-border bg-card px-3 py-1 tnum">
                Revenue (excl. cancelled): <span className="font-semibold">{formatINR(summary.revenue)}</span>
              </span>
            </div>
          )}

          <div className="rounded-lg border border-border/70 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered?.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${o.id}`} className="font-medium hover:text-primary">
                        {o.orderNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {o.user?.name ?? "Walk-in customer"}
                      <p className="text-xs text-muted-foreground">{o.user?.email ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {(o.source ?? "ONLINE") === "POS" ? "In-store" : "Online"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_STYLE[o.status] ?? ""}`}>{o.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {(o.paymentStatus ?? "PENDING").toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tnum">
                      {formatINR(o.grandTotal)}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No orders match.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
