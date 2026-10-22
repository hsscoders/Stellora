"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/notify";
import { RotateCcw, Repeat2, Clock3, CheckCircle2, IndianRupee, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow, EmptyState, ErrorState } from "@/components/stellora/advanced/widgets";
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
type ReturnStatus = (typeof STATUSES)[number];

const STATUS_FILTERS = ["ALL", "REQUESTED", "APPROVED", "REJECTED", "COMPLETED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export default function AdminReturnsPage() {
  const [rows, setRows] = useState<ReturnRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [detail, setDetail] = useState<ReturnRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/admin/returns")
      .then((r) => r.json())
      .then((j) => {
        setRows(j.ok ? j.data : []);
        setError(null);
      })
      .catch(() => {
        setRows([]);
        setError("Could not load return requests. Check your connection and try again.");
      });

  // Retry is a user event, so resetting loading/error state here is safe.
  const retry = () => {
    setRows(null);
    setError(null);
    void load();
  };

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: ReturnStatus) {
    const res = await fetch(`/api/admin/returns/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(`Marked ${status.toLowerCase()}`);
      setDetail(null);
      load();
    } else {
      toast.error(json.error?.message ?? "Update failed");
    }
  }

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => statusFilter === "ALL" || r.status === statusFilter),
    [rows, statusFilter]
  );

  const counts = useMemo(() => {
    const c: Partial<Record<StatusFilter, number>> = {};
    for (const r of rows ?? []) {
      const key = r.status as StatusFilter;
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      pending: list.filter((r) => r.status === "REQUESTED").length,
      approved: list.filter((r) => r.status === "APPROVED").length,
      refunded: list.filter((r) => r.status === "COMPLETED").length,
    };
  }, [rows]);

  const markButtons = (r: ReturnRow, stopPropagation = false) => (
    <>
      {STATUSES.filter((s) => s !== r.status).map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === "APPROVED" ? "default" : "outline"}
          onClick={(e) => {
            if (stopPropagation) e.stopPropagation();
            setStatus(r.id, s);
          }}
          className={`rounded-full text-xs ${s === "APPROVED" ? "bg-primary hover:bg-primary/90" : ""}`}
        >
          Mark {s.toLowerCase()}
        </Button>
      ))}
    </>
  );

  const columns: Column<ReturnRow>[] = [
    {
      key: "orderNumber",
      header: "Request",
      sortValue: (r) => r.orderNumber,
      searchValue: (r) => `${r.orderNumber} ${r.type}`,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          {r.type === "RETURN" ? (
            <RotateCcw className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Repeat2 className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.type === "RETURN" ? "Return" : "Exchange"}</span>
            <span className="block truncate text-xs text-muted-foreground">Order {r.orderNumber}</span>
          </span>
        </span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      sortValue: (r) => r.customer?.name ?? "",
      searchValue: (r) => `${r.customer?.name ?? ""} ${r.customer?.email ?? ""}`,
      hideBelow: "md",
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{r.customer?.name ?? "—"}</span>
          <span className="block truncate text-xs text-muted-foreground">{r.customer?.email ?? ""}</span>
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      sortValue: (r) => r.reason,
      searchValue: (r) => `${r.reason} ${r.details}`,
      hideBelow: "lg",
      cell: (r) => (
        <span className="block max-w-xs">
          <span className="block truncate font-medium">{r.reason}</span>
          {r.details && <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{r.details}</span>}
        </span>
      ),
    },
    {
      key: "items",
      header: "Items",
      sortValue: (r) => r.items.reduce((n, i) => n + i.quantity, 0),
      hideBelow: "md",
      cell: (r) => (
        <span className="tnum text-sm text-muted-foreground">
          {r.items.reduce((n, i) => n + i.quantity, 0)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      searchValue: (r) => r.status,
      cell: (r) => <Badge className={`text-[11px] ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</Badge>,
    },
    {
      key: "createdAt",
      header: "Received",
      sortValue: (r) => new Date(r.createdAt).getTime(),
      hideBelow: "xl",
      cell: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label="View details"
            onClick={(e) => {
              e.stopPropagation();
              setDetail(r);
            }}
            className="rounded-full text-xs text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" /> View
          </Button>
          {markButtons(r, true)}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={RotateCcw}
        title="Returns & Exchanges"
        subtitle="Customer requests for returns and exchanges — approve, reject or mark completed."
      />

      {error ? (
        <ErrorState title="Couldn't load return requests" message={error} onRetry={retry} />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label="Total requests" value={stats.total} icon={RotateCcw} />
            <StatCard label="Pending" value={stats.pending} icon={Clock3} accent="text-amber-600" />
            <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} accent="text-blue-600" />
            <StatCard label="Refunded" value={stats.refunded} icon={IndianRupee} accent="text-emerald-600" />
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
            <ChipRow
              label="Return status"
              value={statusFilter}
              options={STATUS_FILTERS}
              onChange={setStatusFilter}
              counts={counts}
            />
          </div>

          <AdvancedTable
            columns={columns}
            rows={rows === null ? null : filtered}
            getKey={(r) => r.id}
            searchable
            searchPlaceholder="Search order, customer or reason…"
            initialSort={{ key: "createdAt", dir: "desc" }}
            csvName="returns"
            printTitle="Returns & Exchanges"
            loading={rows === null}
            onRowClick={(r) => setDetail(r)}
            emptyMessage={
              <EmptyState
                icon={RotateCcw}
                title={statusFilter === "ALL" ? "No return or exchange requests yet." : `No ${statusFilter.toLowerCase()} requests right now.`}
                hint="Requests raised from the customer order page appear here."
              />
            }
          />

          {/* Detail dialog */}
          <Dialog open={detail !== null} onOpenChange={(v) => { if (!v) setDetail(null); }}>
            <DialogContent className="sm:max-w-lg">
              {detail && (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      {detail.type === "RETURN" ? (
                        <RotateCcw className="h-4 w-4 text-primary" />
                      ) : (
                        <Repeat2 className="h-4 w-4 text-primary" />
                      )}
                      {detail.type === "RETURN" ? "Return" : "Exchange"} · Order {detail.orderNumber}
                    </DialogTitle>
                    <DialogDescription>
                      {detail.customer?.name} · {detail.customer?.email} · {formatDateTime(detail.createdAt)}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex items-center gap-2">
                    <Badge className={`text-[11px] ${STATUS_STYLE[detail.status] ?? ""}`}>{detail.status}</Badge>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reason</p>
                      <p className="mt-1">{detail.reason}</p>
                      {detail.details && <p className="mt-1 text-xs text-muted-foreground">{detail.details}</p>}
                      {detail.adminNote && (
                        <p className="mt-2 rounded-md bg-accent/50 p-2 text-xs text-muted-foreground">
                          <span className="font-semibold">Admin note:</span> {detail.adminNote}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
                      <ul className="mt-1 space-y-0.5">
                        {detail.items.map((i, idx) => (
                          <li key={idx}>
                            {i.productName} · {i.variantName} × {i.quantity}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {markButtons(detail)}
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
