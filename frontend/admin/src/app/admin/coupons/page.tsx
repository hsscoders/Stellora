"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, TicketPercent, CheckCircle2, CalendarClock, ShoppingBag } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow, EmptyState, MiniProgress } from "@/components/stellora/advanced/widgets";
import { formatINR, formatDate } from "@/lib/utils";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  value: string;
  minSubtotal: string | null;
  maxDiscount: string | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  timesUsed: number;
  isActive: boolean;
  _count: { redemptions: number };
}

const STATUS_FILTERS = ["ALL", "ACTIVE", "INACTIVE", "EXPIRING"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type CouponState = "ACTIVE" | "INACTIVE" | "EXPIRING" | "EXPIRED";

const DAY = 86_400_000;
/** Whole days until `endsAt` (negative = already past). */
function daysLeft(endsAt: string | null): number | null {
  if (!endsAt) return null;
  const t = new Date(endsAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / DAY);
}

function couponState(c: Coupon): CouponState {
  if (!c.isActive) return "INACTIVE";
  const d = daysLeft(c.endsAt);
  if (d !== null && d <= 0) return "EXPIRED";
  if (d !== null && d <= 7) return "EXPIRING";
  return "ACTIVE";
}

const STATE_BADGE: Record<CouponState, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  EXPIRING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  EXPIRED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  INACTIVE: "",
};

const STATE_LABEL: Record<CouponState, string> = {
  ACTIVE: "Active",
  EXPIRING: "Expiring",
  EXPIRED: "Expired",
  INACTIVE: "Inactive",
};

function usageBarClass(c: Coupon): string {
  if (!c.usageLimit) return "bg-primary";
  const pct = (c.timesUsed / c.usageLimit) * 100;
  if (pct >= 100) return "bg-rose-500";
  if (pct >= 75) return "bg-amber-500";
  return "bg-primary";
}

function discountLabel(c: Coupon): string {
  return c.discountType === "PERCENT" ? `${Number(c.value)}% off` : `${formatINR(c.value)} off`;
}

export default function AdminCouponsPage() {
  const [rows, setRows] = useState<Coupon[] | null>(null);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const load = () =>
    fetch("/api/admin/coupons")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []));

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const form = new FormData(e.currentTarget);
    const g = (k: string) => String(form.get(k) ?? "").trim();
    const payload = {
      code: g("code").toUpperCase(),
      description: g("description"),
      discountType: g("discountType"),
      value: Number(g("value")),
      minSubtotal: g("minSubtotal") ? Number(g("minSubtotal")) : null,
      maxDiscount: g("maxDiscount") ? Number(g("maxDiscount")) : null,
      startsAt: g("startsAt") || null,
      endsAt: g("endsAt") || null,
      usageLimit: g("usageLimit") ? Number(g("usageLimit")) : null,
      perUserLimit: g("perUserLimit") ? Number(g("perUserLimit")) : null,
      isActive: form.get("isActive") === "on",
    };
    const res = await fetch(editing ? `/api/admin/coupons/${editing.id}` : "/api/admin/coupons", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(editing ? "Coupon updated" : "Coupon created");
      setOpen(false);
      setEditing(null);
      load();
    } else {
      setErrors(json.error?.fields ?? {});
      toast.error(json.error?.message ?? "Could not save coupon");
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      toast.success(json.data.deactivated ? json.data.message : "Coupon deleted");
      load();
    } else {
      toast.error(json.error?.message ?? "Action failed");
    }
  }

  const list = useMemo(() => rows ?? [], [rows]);

  const filtered = useMemo(
    () =>
      list.filter((c) => {
        if (statusFilter === "ALL") return true;
        const st = couponState(c);
        if (statusFilter === "ACTIVE") return st === "ACTIVE";
        if (statusFilter === "INACTIVE") return st === "INACTIVE";
        // EXPIRING = still active but ending within 7 days (or already past its end)
        return st === "EXPIRING" || st === "EXPIRED";
      }),
    [list, statusFilter]
  );

  const stats = useMemo(() => {
    const states = list.map((c) => couponState(c));
    return {
      total: list.length,
      active: states.filter((s) => s === "ACTIVE").length,
      expiring: states.filter((s) => s === "EXPIRING" || s === "EXPIRED").length,
      redemptions: list.reduce((n, c) => n + c.timesUsed, 0),
    };
  }, [list]);

  const counts = useMemo<Partial<Record<StatusFilter, number>>>(
    () => ({ ALL: stats.total, ACTIVE: stats.active, INACTIVE: stats.total - stats.active - stats.expiring, EXPIRING: stats.expiring }),
    [stats]
  );

  const columns: Column<Coupon>[] = useMemo(
    () => [
      {
        key: "code",
        header: "Code",
        sortValue: (c) => c.code,
        searchValue: (c) => `${c.code} ${c.description ?? ""}`,
        cell: (c) => (
          <span className="min-w-0">
            <span className="block font-mono font-semibold">{c.code}</span>
            {c.description && <span className="block max-w-56 truncate text-xs text-muted-foreground">{c.description}</span>}
          </span>
        ),
      },
      {
        key: "discount",
        header: "Discount",
        sortValue: (c) => discountLabel(c),
        searchValue: (c) => discountLabel(c),
        cell: (c) => (
          <span className="block text-sm tnum">
            {discountLabel(c)}
            {c.maxDiscount && <span className="block text-xs text-muted-foreground">max {formatINR(c.maxDiscount)}</span>}
          </span>
        ),
      },
      {
        key: "conditions",
        header: "Conditions",
        sortValue: (c) => (c.minSubtotal !== null ? Number(c.minSubtotal) : 0),
        searchValue: (c) =>
          [
            c.minSubtotal ? `min ${formatINR(c.minSubtotal)}` : "",
            c.usageLimit ? `limit ${c.usageLimit}` : "",
            c.perUserLimit ? `per user ${c.perUserLimit}` : "",
            c.endsAt ? `ends ${formatDate(c.endsAt)}` : "",
          ].join(" "),
        hideBelow: "lg",
        cell: (c) => (
          <span className="block text-xs text-muted-foreground">
            {c.minSubtotal && <span className="block">min {formatINR(c.minSubtotal)}</span>}
            {c.usageLimit && <span className="block">limit {c.usageLimit}</span>}
            {c.perUserLimit && <span className="block">per user {c.perUserLimit}</span>}
            {!c.minSubtotal && !c.usageLimit && !c.perUserLimit && "—"}
          </span>
        ),
      },
      {
        key: "usage",
        header: "Usage",
        align: "right",
        sortValue: (c) => c.timesUsed,
        cell: (c) => (
          <span className="ml-auto block w-28">
            <span className="tnum text-sm font-medium">
              {c.timesUsed}
              {c.usageLimit ? <span className="text-muted-foreground"> / {c.usageLimit}</span> : null}
            </span>
            {c.usageLimit ? (
              <MiniProgress value={c.timesUsed} max={c.usageLimit} className="mt-1.5" barClass={usageBarClass(c)} />
            ) : (
              <span className="mt-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground">no cap</span>
            )}
          </span>
        ),
      },
      {
        key: "endsAt",
        header: "Ends",
        sortValue: (c) => c.endsAt ?? "",
        searchValue: (c) => (c.endsAt ? formatDate(c.endsAt) : ""),
        hideBelow: "sm",
        cell: (c) => {
          const d = daysLeft(c.endsAt);
          return (
            <span className="block text-sm">
              {c.endsAt ? formatDate(c.endsAt) : <span className="text-muted-foreground">Never</span>}
              {c.isActive && d !== null && d > 0 && d <= 7 && (
                <Badge variant="secondary" className={`mt-1 block w-fit text-[10px] ${STATE_BADGE.EXPIRING}`}>
                  {d === 1 ? "Last day!" : `Expires in ${d}d`}
                </Badge>
              )}
              {c.isActive && d !== null && d <= 0 && (
                <Badge variant="secondary" className={`mt-1 block w-fit text-[10px] ${STATE_BADGE.EXPIRED}`}>
                  Expired
                </Badge>
              )}
            </span>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        sortValue: (c) => STATE_LABEL[couponState(c)],
        searchValue: (c) => STATE_LABEL[couponState(c)],
        cell: (c) => {
          const st = couponState(c);
          return (
            <Badge variant="secondary" className={`text-[11px] ${STATE_BADGE[st]}`}>
              {STATE_LABEL[st]}
            </Badge>
          );
        },
      },
      {
        key: "actions",
        header: <span className="sr-only">Actions</span>,
        align: "right",
        cell: (c) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit"
              onClick={() => {
                setEditing(c);
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(c.id)}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={TicketPercent}
        title="Coupons"
        subtitle="Discount codes for checkout — watch usage caps and expiry dates at a glance."
        actions={
          <Button
            className="rounded-full bg-primary hover:bg-primary/90"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New coupon
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Coupons" value={stats.total} icon={TicketPercent} />
        <StatCard label="Active" value={stats.active} icon={CheckCircle2} accent="text-emerald-600" />
        <StatCard label="Expiring ≤7d" value={stats.expiring} icon={CalendarClock} accent="text-amber-600" />
        <StatCard label="Total redemptions" value={stats.redemptions} icon={ShoppingBag} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ChipRow
          label="Coupon status"
          value={statusFilter}
          options={STATUS_FILTERS}
          onChange={setStatusFilter}
          counts={counts}
        />
      </div>

      <AdvancedTable
        columns={columns}
        rows={rows}
        getKey={(c) => c.id}
        searchable
        searchPlaceholder="Search code or description…"
        initialSort={{ key: "code", dir: "asc" }}
        csvName="coupons"
        printTitle="Coupons"
        loading={rows === null}
        emptyMessage={
          <EmptyState
            icon={TicketPercent}
            title={list.length === 0 ? "No coupons yet" : "No coupons match this filter"}
            hint="Coupons drive repeat purchases — pair percentage codes with a min subtotal."
            action={
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> New coupon
              </Button>
            }
          />
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit coupon" : "New coupon"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="code">Code *</Label>
                <Input id="code" name="code" defaultValue={editing?.code} required placeholder="WELCOME10" className="font-mono uppercase" />
                {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
              </div>
              <div>
                <Label htmlFor="discountType">Type *</Label>
                <select
                  id="discountType"
                  name="discountType"
                  defaultValue={editing?.discountType ?? "PERCENT"}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="PERCENT">Percent (%)</option>
                  <option value="FIXED">Fixed (₹)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="value">Value *</Label>
                <Input id="value" name="value" type="number" step="0.01" min="0.01" defaultValue={editing ? Number(editing.value) : ""} required />
                {errors.value && <p className="mt-1 text-xs text-destructive">{errors.value}</p>}
              </div>
              <div>
                <Label htmlFor="maxDiscount">Max discount (₹, optional)</Label>
                <Input id="maxDiscount" name="maxDiscount" type="number" step="0.01" min="0" defaultValue={editing?.maxDiscount ? Number(editing.maxDiscount) : ""} />
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" defaultValue={editing?.description ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="minSubtotal">Min subtotal (₹)</Label>
                <Input id="minSubtotal" name="minSubtotal" type="number" step="0.01" min="0" defaultValue={editing?.minSubtotal ? Number(editing.minSubtotal) : ""} />
              </div>
              <div>
                <Label htmlFor="perUserLimit">Per-user limit</Label>
                <Input id="perUserLimit" name="perUserLimit" type="number" min="1" defaultValue={editing?.perUserLimit ?? ""} />
              </div>
              <div>
                <Label htmlFor="usageLimit">Total usage limit</Label>
                <Input id="usageLimit" name="usageLimit" type="number" min="1" defaultValue={editing?.usageLimit ?? ""} />
              </div>
              <div>
                <Label htmlFor="endsAt">Ends at</Label>
                <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={editing?.endsAt ? editing.endsAt.slice(0, 16) : ""} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="isActive" name="isActive" defaultChecked={editing?.isActive ?? true} />
              <Label htmlFor="isActive" className="text-sm font-normal">
                Active
              </Label>
            </div>
            <Button type="submit" className="w-full rounded-full bg-primary hover:bg-primary/90">
              Save coupon
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
