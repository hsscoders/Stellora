"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Clock3, CheckCircle2, IndianRupee, Download, XCircle } from "lucide-react";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow, DateRangeChips, inPreset, type DatePreset } from "@/components/stellora/advanced/widgets";
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
const DATE_PRESETS = ["ALL", "TODAY", "7D", "30D", "90D"] as const;

function presetStart(preset: DatePreset): Date | null {
  const now = new Date();
  switch (preset) {
    case "TODAY":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "7D":
      return new Date(now.getTime() - 7 * 86400000);
    case "30D":
      return new Date(now.getTime() - 30 * 86400000);
    case "90D":
      return new Date(now.getTime() - 90 * 86400000);
    default:
      return null;
  }
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof ORDER_STATUSES)[number]>("ALL");
  const [payFilter, setPayFilter] = useState<(typeof PAYMENT_STATUSES)[number]>("ALL");
  const [sourceFilter, setSourceFilter] = useState<(typeof SOURCES)[number]>("ALL");
  const [dateFilter, setDateFilter] = useState<DatePreset>("ALL");

  // Deep-link support (e.g. notifications → /admin/orders?status=PENDING)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const sp = new URLSearchParams(window.location.search);
      const s = sp.get("status");
      if (s && (ORDER_STATUSES as readonly string[]).includes(s)) {
        setStatusFilter(s as (typeof ORDER_STATUSES)[number]);
      }
      const pay = sp.get("payment");
      if (pay && (PAYMENT_STATUSES as readonly string[]).includes(pay)) {
        setPayFilter(pay as (typeof PAYMENT_STATUSES)[number]);
      }
      const src = sp.get("source");
      if (src && (SOURCES as readonly string[]).includes(src)) {
        setSourceFilter(src as (typeof SOURCES)[number]);
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
          inPreset(o.createdAt, dateFilter)
      ) ?? [],
    [orders, statusFilter, payFilter, sourceFilter, dateFilter]
  );

  const stats = useMemo(() => {
    const revenue = filtered.filter((o) => o.status !== "CANCELLED").reduce((n, o) => n + Number(o.grandTotal ?? 0), 0);
    const pending = filtered.filter((o) => ["PENDING", "CONFIRMED", "PROCESSING"].includes(o.status)).length;
    const delivered = filtered.filter((o) => o.status === "DELIVERED").length;
    const cancelled = filtered.filter((o) => o.status === "CANCELLED").length;
    return { count: filtered.length, revenue, pending, delivered, cancelled };
  }, [filtered]);

  const columns: Column<OrderRow>[] = useMemo(
    () => [
      {
        key: "orderNumber",
        header: "Order",
        sortValue: (o) => o.orderNumber,
        searchValue: (o) => `${o.orderNumber}`,
        cell: (o) => (
          <span className="min-w-0">
            <Link href={`/admin/orders/${o.id}`} className="block truncate font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
              {o.orderNumber}
            </Link>
            <span className="block text-xs text-muted-foreground">{formatDate(o.createdAt)}</span>
          </span>
        ),
      },
      {
        key: "customer",
        header: "Customer",
        sortValue: (o) => o.user?.name ?? "walk-in",
        searchValue: (o) => `${o.user?.name ?? "walk-in"} ${o.user?.email ?? ""}`,
        hideBelow: "md",
        cell: (o) => (
          <span className="block max-w-48 truncate text-sm">
            {o.user?.name ?? "Walk-in customer"}
            <span className="block truncate text-xs text-muted-foreground">{o.user?.email ?? "—"}</span>
          </span>
        ),
      },
      {
        key: "source",
        header: "Channel",
        sortValue: (o) => o.source ?? "ONLINE",
        hideBelow: "lg",
        cell: (o) => (
          <Badge variant="outline" className="text-[11px]">
            {(o.source ?? "ONLINE") === "POS" ? "In-store" : "Online"}
          </Badge>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortValue: (o) => o.status,
        searchValue: (o) => o.status,
        cell: (o) => (
          <Badge className={`text-[11px] ${STATUS_STYLE[o.status] ?? ""}`}>{o.status}</Badge>
        ),
      },
      {
        key: "paymentStatus",
        header: "Payment",
        sortValue: (o) => o.paymentStatus ?? "",
        hideBelow: "sm",
        cell: (o) => (
          <Badge variant="secondary" className="text-[11px]">
            {(o.paymentStatus ?? "PENDING").toUpperCase()}
          </Badge>
        ),
      },
      {
        key: "grandTotal",
        header: "Total",
        align: "right",
        sortValue: (o) => Number(o.grandTotal ?? 0),
        cell: (o) => <span className="font-medium tnum">{formatINR(o.grandTotal)}</span>,
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingCart}
        title="Orders"
        subtitle="Every online and in-store order, searchable, filterable and exportable."
        actions={
          <a
            href="/api/admin/export/orders"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm transition hover:border-primary hover:text-primary"
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard label="Orders in view" value={stats.count} icon={ShoppingCart} />
        <StatCard label="Revenue (excl. cancelled)" value={formatINR(stats.revenue)} icon={IndianRupee} />
        <StatCard label="Awaiting action" value={stats.pending} icon={Clock3} accent="text-amber-600" />
        <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle2} accent="text-emerald-600" />
        <StatCard label="Cancelled" value={stats.cancelled} icon={XCircle} accent="text-rose-500" invertDelta />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ChipRow label="Order status" value={statusFilter} options={ORDER_STATUSES} onChange={setStatusFilter} />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</span>
          <ChipRow label="Payment status" value={payFilter} options={PAYMENT_STATUSES} onChange={setPayFilter} size="sm" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Channel</span>
          <ChipRow label="Sales channel" value={sourceFilter} options={SOURCES} onChange={setSourceFilter} size="sm" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Period</span>
          <DateRangeChips value={dateFilter} onChange={setDateFilter} />
        </div>
      </div>

      <AdvancedTable
        columns={columns}
        rows={orders}
        getKey={(o) => o.id}
        searchable
        searchPlaceholder="Search order no. or customer…"
        initialSort={{ key: "orderNumber", dir: "desc" }}
        selectable
        csvName="orders"
        printTitle="Orders"
        loading={orders === null}
        onRowClick={(o) => {
          router.push(`/admin/orders/${o.id}`);
        }}
        emptyMessage="No orders match the current filters."
      />
    </div>
  );
}
