"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/notify";
import { BadgeCheck, Check, EyeOff, Sparkles, Star, StarHalf, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { RatingBars } from "@/components/stellora/advanced/charts";
import { ChipRow, EmptyState, ErrorState, SectionCard } from "@/components/stellora/advanced/widgets";
import { StarRating } from "@/components/stellora/stars";
import { formatDateTime } from "@/lib/utils";

interface ReviewRow {
  id: string;
  product: { name: string; slug: string } | null;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  status: string;
  createdAt: string;
}

const STATUS_TABS = ["PENDING", "APPROVED", "REJECTED"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const RATING_FILTERS = ["ALL", "5★", "4★", "3★", "2★", "1★"] as const;
type RatingFilter = (typeof RATING_FILTERS)[number];

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export default function AdminReviewsPage() {
  const [tab, setTab] = useState<StatusTab>("PENDING");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("ALL");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = (status: string) => {
    setError(null);
    fetch(`/api/admin/reviews?status=${status}`)
      .then((r) => r.json())
      .then((j) => {
        setRows(j.ok ? j.data.reviews : []);
        setTotal(j.ok ? j.data.total : 0);
      })
      .catch(() => {
        setRows([]);
        setError("Could not load reviews. Check your connection and try again.");
      });
  };

  useEffect(() => {
    // Defer to a macrotask so we never setState synchronously in the effect.
    const t = window.setTimeout(() => {
      setRows(null);
      load(tab);
    }, 0);
    return () => window.clearTimeout(t);
  }, [tab]);

  async function setStatus(id: string, status: "APPROVED" | "REJECTED") {
    const res = await fetch(`/api/admin/reviews/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(status === "APPROVED" ? "Review approved" : "Review rejected");
      load(tab);
    } else {
      toast.error(json.error?.message ?? "Action failed");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this review permanently?")) return;
    const res = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Review deleted");
      load(tab);
    } else {
      toast.error("Delete failed");
    }
  }

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (ratingFilter === "ALL") return rows;
    const star = Number(ratingFilter.charAt(0));
    return rows.filter((r) => r.rating === star);
  }, [rows, ratingFilter]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const count = list.length;
    const avg = count ? list.reduce((n, r) => n + r.rating, 0) / count : 0;
    const five = list.filter((r) => r.rating === 5).length;
    const verified = list.filter((r) => r.isVerifiedPurchase).length;
    return { count, avg, five, verified };
  }, [rows]);

  const dist = useMemo(() => {
    const d = [0, 0, 0, 0, 0, 0];
    for (const r of rows ?? []) d[Math.min(5, Math.max(1, Math.round(r.rating)))] += 1;
    return d;
  }, [rows]);

  const ratingCounts = useMemo(() => {
    const c: Partial<Record<RatingFilter, number>> = {};
    for (const r of rows ?? []) {
      const key = `${r.rating}★` as RatingFilter;
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const columns: Column<ReviewRow>[] = [
    {
      key: "product",
      header: "Product",
      sortValue: (r) => r.product?.name ?? "",
      searchValue: (r) => `${r.product?.name ?? ""} ${r.authorName}`,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block max-w-52 truncate font-medium">{r.product?.name ?? "—"}</span>
          <span className="block truncate text-xs text-muted-foreground">{r.authorName}</span>
        </span>
      ),
    },
    {
      key: "rating",
      header: "Rating",
      sortValue: (r) => r.rating,
      searchValue: (r) => `${r.rating} star`,
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <StarRating value={r.rating} />
          <span className="tnum text-xs text-muted-foreground">{r.rating}</span>
        </span>
      ),
    },
    {
      key: "review",
      header: "Review",
      sortValue: (r) => r.title || "",
      searchValue: (r) => `${r.title} ${r.body}`,
      hideBelow: "md",
      cell: (r) => (
        <span className="block max-w-md">
          <span className="block truncate font-medium">{r.title || "—"}</span>
          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{r.body}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      searchValue: (r) => r.status,
      cell: (r) => (
        <span className="block">
          <Badge className={`text-[11px] ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</Badge>
          {r.isVerifiedPurchase && (
            <span className="mt-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Verified</span>
          )}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Received",
      sortValue: (r) => new Date(r.createdAt).getTime(),
      hideBelow: "lg",
      cell: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {r.status !== "APPROVED" && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Approve"
              onClick={() => setStatus(r.id, "APPROVED")}
              className="text-primary hover:bg-accent"
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          {r.status !== "REJECTED" && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Reject"
              onClick={() => setStatus(r.id, "REJECTED")}
              className="text-destructive hover:bg-destructive/10"
            >
              <EyeOff className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete"
            onClick={() => remove(r.id)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Star}
        title="Reviews"
        subtitle="Moderate customer ratings before they appear on the storefront."
      />

      {error ? (
        <ErrorState title="Couldn't load reviews" message={error} onRetry={() => load(tab)} />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label={`In view (${tab.toLowerCase()})`} value={stats.count} icon={Star} />
            <StatCard label="Average rating" value={stats.avg ? stats.avg.toFixed(1) : "—"} icon={StarHalf} accent="text-amber-600" />
            <StatCard label="5-star reviews" value={stats.five} icon={Sparkles} accent="text-emerald-600" />
            <StatCard label="Verified purchases" value={stats.verified} icon={BadgeCheck} accent="text-primary" />
          </div>

          {/* Rating distribution */}
          <SectionCard
            title="Rating distribution"
            icon={Star}
            action={<span className="text-xs text-muted-foreground tnum">{total} total for this status</span>}
          >
            <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
              <RatingBars dist={dist} total={stats.count} />
              <div className="text-center sm:border-l sm:border-border sm:pl-8">
                <p className="text-3xl font-semibold leading-none tnum">{stats.avg ? stats.avg.toFixed(1) : "—"}</p>
                <StarRating value={stats.avg} className="mt-2 justify-center" />
                <p className="mt-1.5 text-xs text-muted-foreground">Average of {stats.count} review(s) in view</p>
              </div>
            </div>
          </SectionCard>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
              <ChipRow label="Review status" value={tab} options={STATUS_TABS} onChange={setTab} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rating</span>
              <ChipRow
                label="Rating filter"
                value={ratingFilter}
                options={RATING_FILTERS}
                onChange={setRatingFilter}
                size="sm"
                counts={ratingCounts}
              />
            </div>
          </div>

          <AdvancedTable
            columns={columns}
            rows={rows === null ? null : filtered}
            getKey={(r) => r.id}
            searchable
            searchPlaceholder="Search product, reviewer or text…"
            initialSort={{ key: "createdAt", dir: "desc" }}
            csvName="reviews"
            printTitle="Reviews"
            loading={rows === null}
            emptyMessage={
              <EmptyState
                icon={Star}
                title={`No ${tab.toLowerCase()} reviews${ratingFilter === "ALL" ? "" : ` with ${ratingFilter} rating`} right now.`}
                hint="New customer reviews will land here for moderation."
              />
            }
          />
          <p className="text-xs text-muted-foreground">{total} review(s) in this view.</p>
        </>
      )}
    </div>
  );
}
