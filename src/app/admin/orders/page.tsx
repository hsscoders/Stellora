"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
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
  grandTotal: string;
  createdAt: string;
  user: { name: string; email: string };
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  PROCESSING: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  SHIPPED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  DELIVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/orders", { cache: "no-store" }).catch(() => {});
    // Admin orders come from the admin products? No — dedicated listing via server page is absent;
    // use the /api/orders?admin route: we don't have one, so fetch all orders via admin orders list endpoint
  }, []);

  useEffect(() => {
    fetch("/api/admin/orders-list")
      .then((r) => r.json())
      .then((j) => setOrders(j.ok ? j.data : []))
      .catch(() => setOrders([]));
  }, []);

  const filtered = orders?.filter(
    (o) =>
      (statusFilter === "ALL" || o.status === statusFilter) &&
      (!q ||
        o.orderNumber.toLowerCase().includes(q.toLowerCase()) ||
        o.user.email.toLowerCase().includes(q.toLowerCase()) ||
        o.user.name.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-medium">Orders</h1>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order no. or customer…" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["ALL", "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {orders === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="rounded-lg border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
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
                    {o.user.name}
                    <p className="text-xs text-muted-foreground">{o.user.email}</p>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${STATUS_STYLE[o.status] ?? ""}`}>{o.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {o.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tnum">
                    {formatINR(o.grandTotal)}
                  </TableCell>
                </TableRow>
              ))}
              {filtered?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No orders match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
