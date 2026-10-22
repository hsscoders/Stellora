"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Truck, CheckCircle2, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow, EmptyState } from "@/components/stellora/advanced/widgets";
import { formatINR } from "@/lib/utils";

interface Rate {
  id: string;
  name: string;
  baseFee: string;
  freeAbove: string | null;
  isActive: boolean;
  sortOrder: number;
}

const STATUS_FILTERS = ["ALL", "ACTIVE", "INACTIVE"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const ACTIVE_BADGE = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";

export default function AdminShippingPage() {
  const [rows, setRows] = useState<Rate[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const load = () =>
    fetch("/api/admin/shipping")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []));

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      baseFee: Number(form.get("baseFee")),
      freeAbove: form.get("freeAbove") ? Number(form.get("freeAbove")) : null,
      isActive: form.get("isActive") === "on",
      sortOrder: Number(form.get("sortOrder") || 0),
    };
    const res = await fetch("/api/admin/shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success("Shipping rate added");
      (e.target as HTMLFormElement).reset();
      load();
    } else {
      toast.error(json.error?.message ?? "Could not save rate");
    }
  }

  async function toggle(r: Rate) {
    const res = await fetch(`/api/admin/shipping/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: r.name,
        baseFee: Number(r.baseFee),
        freeAbove: r.freeAbove ? Number(r.freeAbove) : null,
        isActive: !r.isActive,
        sortOrder: r.sortOrder,
      }),
    });
    if (res.ok) {
      load();
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/shipping/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Rate removed");
      load();
    }
  }

  const list = useMemo(() => rows ?? [], [rows]);

  const filtered = useMemo(
    () =>
      list.filter(
        (r) =>
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" ? r.isActive : !r.isActive)
      ),
    [list, statusFilter]
  );

  const stats = useMemo(() => {
    const fees = list.map((r) => Number(r.baseFee)).filter((n) => Number.isFinite(n));
    const active = list.filter((r) => r.isActive).length;
    return {
      total: list.length,
      active,
      inactive: list.length - active,
      minFee: fees.length ? Math.min(...fees) : null,
      maxFee: fees.length ? Math.max(...fees) : null,
    };
  }, [list]);

  /** The first active rate by sort order is what checkout applies. */
  const appliedRateId = useMemo(() => {
    const active = list.filter((r) => r.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    return active[0]?.id ?? null;
  }, [list]);

  const counts = useMemo<Partial<Record<StatusFilter, number>>>(
    () => ({ ALL: stats.total, ACTIVE: stats.active, INACTIVE: stats.inactive }),
    [stats]
  );

  const columns: Column<Rate>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Rate",
        sortValue: (r) => r.name,
        searchValue: (r) => r.name,
        cell: (r) => (
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium">
              <span className="truncate">{r.name}</span>
              {appliedRateId === r.id && (
                <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" title="First active rate by sort order — applied at checkout">
                  Applied at checkout
                </Badge>
              )}
            </span>
          </span>
        ),
      },
      {
        key: "baseFee",
        header: "Fee",
        sortValue: (r) => Number(r.baseFee) || 0,
        cell: (r) => <span className="tnum font-medium">{formatINR(r.baseFee)}</span>,
      },
      {
        key: "freeAbove",
        header: "Free above",
        sortValue: (r) => (r.freeAbove !== null ? Number(r.freeAbove) : ""),
        hideBelow: "md",
        cell: (r) => (
          <span className="tnum text-sm">{r.freeAbove ? formatINR(r.freeAbove) : <span className="text-muted-foreground">—</span>}</span>
        ),
      },
      {
        key: "sortOrder",
        header: "Order",
        align: "right",
        sortValue: (r) => r.sortOrder,
        hideBelow: "sm",
        cell: (r) => <span className="tnum text-sm text-muted-foreground">{r.sortOrder}</span>,
      },
      {
        key: "status",
        header: "Status",
        sortValue: (r) => (r.isActive ? "Active" : "Inactive"),
        searchValue: (r) => (r.isActive ? "active" : "inactive"),
        cell: (r) => (
          <Badge variant="secondary" className={`text-[11px] ${r.isActive ? ACTIVE_BADGE : ""}`}>
            {r.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: <span className="sr-only">Actions</span>,
        align: "right",
        cell: (r) => (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => toggle(r)}>
              {r.isActive ? "Disable" : "Enable"}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(r.id)}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appliedRateId]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Truck}
        title="Shipping Configuration"
        subtitle="The first active rate (by sort order) is applied at checkout. Configure your real rates here — the seeded values are samples."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total rates" value={stats.total} icon={Truck} />
        <StatCard label="Active rates" value={stats.active} icon={CheckCircle2} accent="text-emerald-600" />
        <StatCard
          label="Lowest fee"
          value={stats.minFee === null ? "—" : formatINR(stats.minFee)}
          icon={ArrowDownRight}
        />
        <StatCard
          label="Highest fee"
          value={stats.maxFee === null ? "—" : formatINR(stats.maxFee)}
          icon={ArrowUpRight}
          accent="text-amber-600"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ChipRow
          label="Rate status"
          value={statusFilter}
          options={STATUS_FILTERS}
          onChange={setStatusFilter}
          counts={counts}
        />
      </div>

      <AdvancedTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        searchable
        searchPlaceholder="Search rate name…"
        initialSort={{ key: "sortOrder", dir: "asc" }}
        csvName="shipping-rates"
        printTitle="Shipping Rates"
        loading={rows === null}
        emptyMessage={
          <EmptyState
            icon={Truck}
            title={list.length === 0 ? "No shipping rates yet" : "No rates match this filter"}
            hint="Add a rate below — shoppers pick it up at checkout instantly."
          />
        }
      />

      <form onSubmit={save} className="grid gap-4 rounded-lg border border-border/70 bg-card p-6 sm:grid-cols-5 sm:items-end">
        <div className="sm:col-span-1">
          <Label htmlFor="rname">Name *</Label>
          <Input id="rname" name="name" required placeholder="Standard Delivery" />
        </div>
        <div>
          <Label htmlFor="rfee">Fee (₹) *</Label>
          <Input id="rfee" name="baseFee" type="number" step="0.01" min="0" required />
        </div>
        <div>
          <Label htmlFor="rfree">Free above (₹)</Label>
          <Input id="rfree" name="freeAbove" type="number" step="0.01" min="0" />
        </div>
        <div>
          <Label htmlFor="rorder">Sort order</Label>
          <Input id="rorder" name="sortOrder" type="number" min="0" defaultValue={rows?.length ?? 0} />
        </div>
        <div className="flex items-center gap-3 sm:pb-2">
          <Switch id="ractive" name="isActive" defaultChecked />
          <Label htmlFor="ractive" className="text-sm font-normal">
            Active
          </Label>
          <Button type="submit" className="rounded-full bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </form>
    </div>
  );
}
