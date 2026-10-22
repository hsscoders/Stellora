"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarClock, Eye, ScrollText, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow } from "@/components/stellora/advanced/widgets";
import { formatDateTime } from "@/lib/utils";

type AuditLog = {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [viewing, setViewing] = useState<AuditLog | null>(null);

  useEffect(() => {
    fetch("/api/admin/audit-logs")
      .then((r) => r.json())
      .then((j) => setLogs(j.ok ? j.data : []))
      .catch(() => setLogs([]));
  }, []);

  /* Distinct actions derived from the data → filter chips */
  const distinctActions = useMemo(
    () => [...new Set((logs ?? []).map((l) => l.action))].sort(),
    [logs]
  );
  const actionOptions = useMemo(() => ["ALL", ...distinctActions], [distinctActions]);
  const actionCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: (logs ?? []).length };
    for (const l of logs ?? []) c[l.action] = (c[l.action] ?? 0) + 1;
    return c;
  }, [logs]);

  const filtered = useMemo(
    () => (logs ?? []).filter((l) => actionFilter === "ALL" || l.action === actionFilter),
    [logs, actionFilter]
  );

  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return {
      total: filtered.length,
      today: filtered.filter((l) => new Date(l.createdAt).getTime() >= todayStart.getTime()).length,
      actors: new Set(filtered.map((l) => l.actorEmail ?? "system")).size,
      actions: new Set(filtered.map((l) => l.action)).size,
    };
  }, [filtered]);

  const columns: Column<AuditLog>[] = useMemo(
    () => [
      {
        key: "when",
        header: "When",
        sortValue: (l) => new Date(l.createdAt).getTime(),
        searchValue: (l) => formatDateTime(l.createdAt),
        cell: (l) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</span>
        ),
      },
      {
        key: "actor",
        header: "Actor",
        sortValue: (l) => l.actorEmail ?? "system",
        searchValue: (l) => `${l.actorEmail ?? "system"} ${l.ip ?? ""}`,
        cell: (l) => <span className="block max-w-52 truncate text-sm">{l.actorEmail ?? "system"}</span>,
      },
      {
        key: "action",
        header: "Action",
        sortValue: (l) => l.action,
        searchValue: (l) => l.action,
        cell: (l) => (
          <span className="whitespace-nowrap rounded bg-accent px-2 py-0.5 font-mono text-xs text-accent-foreground">
            {l.action}
          </span>
        ),
      },
      {
        key: "entity",
        header: "Entity",
        sortValue: (l) => l.entityType,
        searchValue: (l) => `${l.entityType} ${l.entityId ?? ""}`,
        hideBelow: "md",
        cell: (l) => (
          <span className="text-xs text-muted-foreground">
            {l.entityType}
            {l.entityId ? ` · ${l.entityId.slice(0, 10)}…` : ""}
          </span>
        ),
      },
      {
        key: "ip",
        header: "IP",
        sortValue: (l) => l.ip ?? "",
        searchValue: (l) => l.ip ?? "",
        hideBelow: "lg",
        cell: (l) => <span className="font-mono text-xs text-muted-foreground">{l.ip ?? "—"}</span>,
      },
      {
        key: "metadata",
        header: "Details",
        sortValue: (l) => (l.metadata ? JSON.stringify(l.metadata) : ""),
        cell: (l) =>
          l.metadata ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewing(l);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title="View metadata JSON"
            >
              <Eye className="h-3 w-3" aria-hidden="true" /> JSON
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ScrollText}
        title="Audit Logs"
        subtitle="Sensitive administrative actions, sign-ins and account changes — append-only."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Events in view" value={stats.total} icon={ScrollText} />
        <StatCard label="Today" value={stats.today} icon={CalendarClock} accent="text-amber-600" />
        <StatCard label="Unique actors" value={stats.actors} icon={Users} accent="text-sky-600" />
        <StatCard label="Distinct actions" value={stats.actions} icon={Activity} accent="text-violet-600" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Action</span>
        <ChipRow
          label="Audit action"
          value={actionFilter}
          options={actionOptions}
          onChange={setActionFilter}
          counts={actionCounts}
          size="sm"
        />
      </div>

      <AdvancedTable
        columns={columns}
        rows={logs}
        getKey={(l) => l.id}
        searchable
        searchPlaceholder="Search actor, action or entity…"
        initialSort={{ key: "when", dir: "desc" }}
        csvName="audit-logs"
        printTitle="Audit logs"
        loading={logs === null}
        onRowClick={(l) => {
          if (l.metadata) setViewing(l);
        }}
        emptyMessage="No audit entries yet."
      />

      {/* Metadata pretty-view */}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif">Event details</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="rounded bg-accent px-2 py-0.5 font-mono text-accent-foreground">
                  {viewing.action}
                </span>
                <span>{viewing.actorEmail ?? "system"}</span>
                <span>{formatDateTime(viewing.createdAt)}</span>
                <span>
                  {viewing.entityType}
                  {viewing.entityId ? ` · ${viewing.entityId}` : ""}
                </span>
                {viewing.ip && <span>IP {viewing.ip}</span>}
              </div>
              <pre className="max-h-[55vh] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed">
                {JSON.stringify(viewing.metadata, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
