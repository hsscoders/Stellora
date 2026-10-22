"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Download, Users, UserPlus, Crown, IndianRupee } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow } from "@/components/stellora/advanced/widgets";
import { formatDate, formatINR } from "@/lib/utils";

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { orders: number };
  totalSpent?: number;
  lastOrderAt?: string | null;
}

type CustomerFilter = "ALL" | "ACTIVE" | "DEACTIVATED" | "WITH_ORDERS" | "VIP";

const FILTERS: { key: CustomerFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "WITH_ORDERS", label: "Has orders" },
  { key: "VIP", label: "VIP" },
  { key: "DEACTIVATED", label: "Deactivated" },
];

export default function AdminCustomersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [filter, setFilter] = useState<CustomerFilter>("ALL");

  useEffect(() => {
    fetch("/api/admin/customers-list")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []))
      .catch(() => setRows([]));
  }, []);

  async function toggle(id: string, isActive: boolean) {
    const res = await fetch(`/api/admin/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(isActive ? "Customer reactivated" : "Customer deactivated (sessions revoked)");
      setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, isActive } : r)) ?? null);
    } else {
      toast.error(json.error?.message ?? "Action failed");
    }
  }

  // VIP = top 20% by total spend (min 1 customer), computed from loaded data
  const vipThreshold = useMemo(() => {
    const spends = (rows ?? []).map((r) => r.totalSpent ?? 0).filter((n) => n > 0).sort((a, b) => b - a);
    if (!spends.length) return Infinity;
    const topIdx = Math.max(0, Math.floor(spends.length * 0.2) - 1);
    return spends[topIdx];
  }, [rows]);

  const isVip = (r: CustomerRow) => (r.totalSpent ?? 0) >= vipThreshold && vipThreshold > 0;

  const filtered = useMemo(
    () =>
      rows?.filter(
        (r) =>
          filter === "ALL" ||
          (filter === "ACTIVE" && r.isActive) ||
          (filter === "DEACTIVATED" && !r.isActive) ||
          (filter === "WITH_ORDERS" && r._count.orders > 0) ||
          (filter === "VIP" && isVip(r))
      ) ?? [],
    [rows, filter, vipThreshold]
  );

  const stats = useMemo(() => {
    const list = rows ?? [];
    const monthAgo = new Date(Date.now() - 30 * 86400000);
    return {
      total: list.length,
      active: list.filter((r) => r.isActive).length,
      new30d: list.filter((r) => new Date(r.createdAt) >= monthAgo).length,
      vip: list.filter(isVip).length,
      ltv: list.reduce((n, r) => n + (r.totalSpent ?? 0), 0),
    };
  }, [rows, vipThreshold]);

  const columns: Column<CustomerRow>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Customer",
        sortValue: (r) => r.name,
        searchValue: (r) => `${r.name} ${r.email} ${r.phone ?? ""}`,
        cell: (r) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {(r.name || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="block max-w-44 truncate font-medium">{r.name}</span>
                {isVip(r) && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="VIP customer" />}
              </span>
              <span className="block max-w-44 truncate text-xs text-muted-foreground">{r.email}</span>
            </span>
          </span>
        ),
      },
      {
        key: "phone",
        header: "Phone",
        sortValue: (r) => r.phone ?? "",
        hideBelow: "lg",
        cell: (r) => <span className="text-sm">{r.phone ?? "—"}</span>,
      },
      {
        key: "orders",
        header: "Orders",
        align: "right",
        sortValue: (r) => r._count.orders,
        cell: (r) => <span className="tnum text-sm font-medium">{r._count.orders}</span>,
      },
      {
        key: "totalSpent",
        header: "Lifetime spend",
        align: "right",
        sortValue: (r) => r.totalSpent ?? 0,
        cell: (r) => <span className="tnum text-sm font-semibold">{formatINR(r.totalSpent ?? 0)}</span>,
      },
      {
        key: "lastOrderAt",
        header: "Last order",
        sortValue: (r) => r.lastOrderAt ?? "",
        hideBelow: "md",
        cell: (r) => <span className="text-sm text-muted-foreground">{r.lastOrderAt ? formatDate(r.lastOrderAt) : "—"}</span>,
      },
      {
        key: "createdAt",
        header: "Joined",
        sortValue: (r) => r.createdAt,
        hideBelow: "xl",
        cell: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</span>,
      },
      {
        key: "isActive",
        header: "Status",
        sortValue: (r) => (r.isActive ? 1 : 0),
        cell: (r) => (
          <Badge
            variant="secondary"
            className={
              r.isActive
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
            }
          >
            {r.isActive ? "Active" : "Deactivated"}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (r) => (
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              void toggle(r.id, !r.isActive);
            }}
          >
            {r.isActive ? (
              <>
                <Ban className="h-3.5 w-3.5" /> Deactivate
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Reactivate
              </>
            )}
          </Button>
        ),
      },
    ],
    [vipThreshold]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Customers"
        subtitle="Privacy first: passwords are never displayed or accessible, and records are never deleted (orders must remain accurate)."
        actions={
          <a
            href="/api/admin/export/customers"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm transition hover:border-primary hover:text-primary"
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard label="Total customers" value={stats.total} icon={Users} />
        <StatCard label="Active" value={stats.active} icon={CheckCircle2} accent="text-emerald-600" />
        <StatCard label="New · 30 days" value={stats.new30d} icon={UserPlus} />
        <StatCard label="VIP (top 20%)" value={stats.vip} icon={Crown} accent="text-amber-600" />
        <StatCard label="Lifetime value" value={formatINR(stats.ltv)} icon={IndianRupee} />
      </div>

      <ChipRow label="Customer filter" value={filter} options={FILTERS.map((f) => f.key)} onChange={setFilter} />

      <AdvancedTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        searchPlaceholder="Search name, email or phone…"
        initialSort={{ key: "totalSpent", dir: "desc" }}
        selectable
        csvName="customers"
        printTitle="Customers"
        loading={rows === null}
        onRowClick={(r) => router.push(`/admin/orders?customer=${encodeURIComponent(r.email)}`)}
        emptyMessage="No customers match the current filter."
      />
    </div>
  );
}
