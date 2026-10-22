"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Inbox, MailOpen, MessageSquare } from "lucide-react";
import { toast } from "@/components/ui/notify";
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

interface Message {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

const MSG_FILTERS = ["ALL", "NEW", "HANDLED"] as const;
type MsgFilter = (typeof MSG_FILTERS)[number];

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  HANDLED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export default function AdminMessagesPage() {
  const [rows, setRows] = useState<Message[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<MsgFilter>("ALL");
  const [view, setView] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/admin/messages-list")
      .then((r) => r.json())
      .then((j) => {
        setRows(j.ok ? j.data : []);
        setError(null);
      })
      .catch(() => {
        setRows([]);
        setError("Could not load messages. Check your connection and try again.");
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

  async function markHandled(id: string) {
    const res = await fetch(`/api/admin/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "HANDLED" }),
    });
    if (res.ok) {
      toast.success("Marked as handled");
      setView(null);
      load();
    }
  }

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (m) => statusFilter === "ALL" || (statusFilter === "NEW" ? m.status === "NEW" : m.status !== "NEW")
      ),
    [rows, statusFilter]
  );

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      ALL: list.length,
      NEW: list.filter((m) => m.status === "NEW").length,
      HANDLED: list.filter((m) => m.status !== "NEW").length,
    } as Partial<Record<MsgFilter, number>>;
  }, [rows]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      unread: list.filter((m) => m.status === "NEW").length,
      handled: list.filter((m) => m.status !== "NEW").length,
    };
  }, [rows]);

  const columns: Column<Message>[] = [
    {
      key: "from",
      header: "From",
      sortValue: (m) => m.name,
      searchValue: (m) => `${m.name} ${m.email}`,
      cell: (m) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{m.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
        </span>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      sortValue: (m) => m.subject,
      searchValue: (m) => `${m.subject} ${m.message}`,
      cell: (m) => (
        <span className="block max-w-md">
          <span className="block truncate font-medium">{m.subject}</span>
          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{m.message}</span>
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Received",
      sortValue: (m) => new Date(m.createdAt).getTime(),
      hideBelow: "md",
      cell: (m) => <span className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (m) => m.status,
      searchValue: (m) => m.status,
      cell: (m) => <Badge className={`text-[11px] ${STATUS_STYLE[m.status] ?? ""}`}>{m.status}</Badge>,
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      cell: (m) =>
        m.status === "NEW" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              markHandled(m.id);
            }}
          >
            <Check className="h-3.5 w-3.5" /> Mark handled
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageSquare}
        title="Customer Messages"
        subtitle="Contact-form submissions from the storefront — triage, read and mark handled."
      />

      {error ? (
        <ErrorState title="Couldn't load messages" message={error} onRetry={retry} />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            <StatCard label="Total messages" value={stats.total} icon={MessageSquare} />
            <StatCard label="Unread" value={stats.unread} icon={Inbox} accent="text-amber-600" />
            <StatCard label="Handled" value={stats.handled} icon={MailOpen} accent="text-emerald-600" />
          </div>

          {/* Unread / handled filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
            <ChipRow
              label="Message status"
              value={statusFilter}
              options={MSG_FILTERS}
              onChange={setStatusFilter}
              counts={counts}
            />
          </div>

          <AdvancedTable
            columns={columns}
            rows={rows}
            getKey={(m) => m.id}
            searchable
            searchPlaceholder="Search name, email or subject…"
            initialSort={{ key: "createdAt", dir: "desc" }}
            csvName="messages"
            printTitle="Customer messages"
            loading={rows === null}
            onRowClick={(m) => setView(m)}
            emptyMessage={
              <EmptyState
                icon={Inbox}
                title={statusFilter === "NEW" ? "No unread messages — inbox zero!" : "No messages yet."}
                hint="Messages sent through the storefront contact form appear here."
              />
            }
          />

          {/* Detail dialog */}
          <Dialog open={view !== null} onOpenChange={(v) => { if (!v) setView(null); }}>
            <DialogContent className="sm:max-w-lg">
              {view && (
                <>
                  <DialogHeader>
                    <DialogTitle>{view.subject}</DialogTitle>
                    <DialogDescription>
                      {view.name} · {view.email} · {formatDateTime(view.createdAt)}
                    </DialogDescription>
                  </DialogHeader>
                  <Badge className={`w-fit text-[11px] ${STATUS_STYLE[view.status] ?? ""}`}>{view.status}</Badge>
                  <div className="whitespace-pre-wrap rounded-md bg-accent/50 p-3 text-sm leading-relaxed">
                    {view.message}
                  </div>
                  {view.status === "NEW" && (
                    <Button onClick={() => markHandled(view.id)} className="rounded-full bg-primary hover:bg-primary/90">
                      <Check className="h-4 w-4" /> Mark handled
                    </Button>
                  )}
                </>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
