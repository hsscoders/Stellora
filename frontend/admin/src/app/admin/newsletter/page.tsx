"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, Download, Mail, MailX, Send, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow, EmptyState, ErrorState } from "@/components/stellora/advanced/widgets";
import { formatDateTime } from "@/lib/utils";

interface Subscriber {
  id: string;
  email: string;
  source: string;
  subscribed: boolean;
  subscribedAt: string;
}

interface RestockAlert {
  id: string;
  email: string;
  product: { name: string; slug: string } | null;
  notifiedAt: string | null;
  requestedAt: string;
}

const SUB_FILTERS = ["ALL", "ACTIVE", "UNSUBSCRIBED"] as const;
type SubFilter = (typeof SUB_FILTERS)[number];

export default function AdminNewsletterPage() {
  const [subs, setSubs] = useState<Subscriber[] | null>(null);
  const [alerts, setAlerts] = useState<RestockAlert[] | null>(null);
  const [subFilter, setSubFilter] = useState<SubFilter>("ALL");
  const [subsError, setSubsError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/newsletter")
      .then((r) => r.json())
      .then((j) => {
        setSubs(j.ok ? j.data : []);
        setSubsError(null);
      })
      .catch(() => {
        setSubs([]);
        setSubsError("Could not load subscribers. Check your connection and try again.");
      });
    fetch("/api/admin/restock-alerts")
      .then((r) => r.json())
      .then((j) => {
        setAlerts(j.ok ? j.data : []);
        setAlertsError(null);
      })
      .catch(() => {
        setAlerts([]);
        setAlertsError("Could not load restock alerts. Check your connection and try again.");
      });
  };

  // Retry is a user event, so resetting loading/error state here is safe.
  const retry = () => {
    setSubs(null);
    setAlerts(null);
    setSubsError(null);
    setAlertsError(null);
    load();
  };

  useEffect(() => {
    load();
  }, []);

  async function markNotified(id: string) {
    const res = await fetch(`/api/admin/restock-alerts/${id}/notified`, { method: "POST" });
    if (res.ok) {
      load();
    } else {
      const json = await res.json().catch(() => null);
      alert(json?.error?.message ?? "Update failed");
    }
  }

  const filteredSubs = useMemo(
    () =>
      (subs ?? []).filter(
        (s) => subFilter === "ALL" || (subFilter === "ACTIVE" ? s.subscribed : !s.subscribed)
      ),
    [subs, subFilter]
  );

  const counts = useMemo(() => {
    const list = subs ?? [];
    return {
      ALL: list.length,
      ACTIVE: list.filter((s) => s.subscribed).length,
      UNSUBSCRIBED: list.filter((s) => !s.subscribed).length,
    } as Partial<Record<SubFilter, number>>;
  }, [subs]);

  const stats = useMemo(() => {
    const list = subs ?? [];
    const alertList = alerts ?? [];
    return {
      total: list.length,
      active: list.filter((s) => s.subscribed).length,
      unsubscribed: list.filter((s) => !s.subscribed).length,
      awaiting: alertList.filter((a) => !a.notifiedAt).length,
    };
  }, [subs, alerts]);

  const subColumns: Column<Subscriber>[] = [
    {
      key: "email",
      header: "Email",
      sortValue: (s) => s.email,
      searchValue: (s) => `${s.email} ${s.source}`,
      cell: (s) => <span className="font-medium">{s.email}</span>,
    },
    {
      key: "source",
      header: "Source",
      sortValue: (s) => s.source,
      hideBelow: "sm",
      cell: (s) => <span className="text-sm text-muted-foreground">{s.source}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (s) => (s.subscribed ? "ACTIVE" : "UNSUBSCRIBED"),
      searchValue: (s) => (s.subscribed ? "active" : "unsubscribed"),
      cell: (s) =>
        s.subscribed ? (
          <Badge className="bg-emerald-100 text-[11px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            Active
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[11px]">
            Unsubscribed
          </Badge>
        ),
    },
    {
      key: "subscribedAt",
      header: "Subscribed",
      sortValue: (s) => new Date(s.subscribedAt).getTime(),
      cell: (s) => <span className="text-xs text-muted-foreground">{formatDateTime(s.subscribedAt)}</span>,
    },
  ];

  const alertColumns: Column<RestockAlert>[] = [
    {
      key: "email",
      header: "Email",
      sortValue: (a) => a.email,
      searchValue: (a) => `${a.email} ${a.product?.name ?? ""}`,
      cell: (a) => <span className="font-medium">{a.email}</span>,
    },
    {
      key: "product",
      header: "Product",
      sortValue: (a) => a.product?.name ?? "",
      hideBelow: "sm",
      cell: (a) => <span className="text-sm">{a.product?.name ?? "—"}</span>,
    },
    {
      key: "requestedAt",
      header: "Requested",
      sortValue: (a) => new Date(a.requestedAt).getTime(),
      hideBelow: "md",
      cell: (a) => <span className="text-xs text-muted-foreground">{formatDateTime(a.requestedAt)}</span>,
    },
    {
      key: "notifiedAt",
      header: "Notified",
      align: "right",
      sortValue: (a) => (a.notifiedAt ? new Date(a.notifiedAt).getTime() : 0),
      cell: (a) =>
        a.notifiedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <Check className="h-3.5 w-3.5" /> {formatDateTime(a.notifiedAt)}
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => markNotified(a.id)} className="rounded-full text-xs">
            <BellRing className="h-3.5 w-3.5" /> Mark notified
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Mail}
        title="Newsletter"
        subtitle="Everyone subscribed through the storefront footer form."
        actions={
          <Button asChild variant="outline" className="rounded-full">
            <a href="/api/admin/newsletter/export">
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total subscribers" value={stats.total} icon={Mail} />
        <StatCard label="Active" value={stats.active} icon={UserCheck} accent="text-emerald-600" />
        <StatCard label="Unsubscribed" value={stats.unsubscribed} icon={UserX} accent="text-rose-500" />
        <StatCard label="Restock alerts waiting" value={stats.awaiting} icon={BellRing} accent="text-amber-600" />
      </div>

      {/* Subscribers */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
          <ChipRow
            label="Subscriber status"
            value={subFilter}
            options={SUB_FILTERS}
            onChange={setSubFilter}
            counts={counts}
          />
        </div>

        {subsError ? (
          <ErrorState title="Couldn't load subscribers" message={subsError} onRetry={retry} />
        ) : (
          <AdvancedTable
            columns={subColumns}
            rows={subs === null ? null : filteredSubs}
            getKey={(s) => s.id}
            searchable
            searchPlaceholder="Search email or source…"
            initialSort={{ key: "subscribedAt", dir: "desc" }}
            csvName="newsletter"
            printTitle="Newsletter subscribers"
            loading={subs === null}
            emptyMessage={
              <EmptyState
                icon={Send}
                title={subFilter === "ALL" ? "No subscribers yet." : `No ${subFilter.toLowerCase()} subscribers.`}
                hint="Storefront footer sign-ups will appear here."
              />
            }
          />
        )}
      </section>

      {/* Back-in-stock alerts */}
      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-2xl font-medium">Back-in-Stock Alerts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Customers waiting for sold-out pieces to return. Mark rows once you've emailed them.
          </p>
        </div>
        {alertsError ? (
          <ErrorState title="Couldn't load restock alerts" message={alertsError} onRetry={retry} />
        ) : (
          <AdvancedTable
            columns={alertColumns}
            rows={alerts}
            getKey={(a) => a.id}
            searchable
            searchPlaceholder="Search email or product…"
            initialSort={{ key: "requestedAt", dir: "desc" }}
            csvName="restock-alerts"
            printTitle="Back-in-Stock alerts"
            loading={alerts === null}
            emptyMessage={
              <EmptyState
                icon={MailX}
                title="No restock alerts requested."
                hint="Customers can subscribe to alerts from any sold-out product page."
              />
            }
          />
        )}
      </section>
    </div>
  );
}
