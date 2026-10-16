"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Trash2, EyeOff, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const TABS = ["PENDING", "APPROVED", "REJECTED"] as const;

export default function AdminReviewsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("PENDING");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = (status: string) =>
    fetch(`/api/admin/reviews?status=${status}`)
      .then((r) => r.json())
      .then((j) => {
        setRows(j.ok ? j.data.reviews : []);
        setTotal(j.ok ? j.data.total : 0);
      })
      .catch(() => setRows([]));

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-medium">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Moderate customer ratings before they appear on the storefront.
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-border p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Star className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No {tab.toLowerCase()} reviews right now.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="min-w-[240px]">Review</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    <p className="font-medium">{r.product?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.authorName}</p>
                  </TableCell>
                  <TableCell>
                    <StarRating value={r.rating} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <p className="font-medium">{r.title || "—"}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{r.body}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {r.status}
                    </Badge>
                    {r.isVerifiedPurchase && (
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Verified
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(r.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{total} review(s) in this view.</p>
    </div>
  );
}
