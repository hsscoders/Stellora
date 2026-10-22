"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/notify";
import { Trash2, EyeOff, RotateCcw, MessageCircleQuestion, Send, Clock3, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow, EmptyState, ErrorState } from "@/components/stellora/advanced/widgets";
import { formatDateTime } from "@/lib/utils";

interface QuestionRow {
  id: string;
  product: { name: string; slug: string } | null;
  customer: { name: string; email: string } | null;
  authorName: string;
  question: string;
  answer: string | null;
  status: string;
  createdAt: string;
  answeredAt: string | null;
}

const STATUS_FILTERS = ["ALL", "PENDING", "ANSWERED", "HIDDEN"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  ANSWERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  HIDDEN: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300",
};

export default function AdminQuestionsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [answerOpen, setAnswerOpen] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load every status in one call so the stat cards (total / pending /
  // answered) reflect the whole queue; filtering happens client-side.
  const load = () => {
    setError(null);
    fetch("/api/admin/questions")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data.questions : []))
      .catch(() => {
        setRows([]);
        setError("Could not load questions. Check your connection and try again.");
      });
  };

  useEffect(() => {
    // Defer to a macrotask so we never setState synchronously in the effect.
    const t = window.setTimeout(() => {
      setRows(null);
      load();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  async function submitAnswer(id: string) {
    const value = answerText.trim();
    if (value.length < 5) {
      toast.error("Answer must be at least 5 characters");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/questions/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: value }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      toast.success("Answer published on the product page");
      setAnswerOpen(null);
      setAnswerText("");
      load();
    } else {
      toast.error(json.error?.message ?? "Could not save the answer");
    }
  }

  async function setStatus(id: string, status: "PENDING" | "HIDDEN") {
    const res = await fetch(`/api/admin/questions/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(status === "HIDDEN" ? "Question hidden" : "Question restored");
      load();
    } else {
      toast.error(json.error?.message ?? "Action failed");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this question permanently?")) return;
    const res = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Question deleted");
      load();
    } else {
      toast.error("Delete failed");
    }
  }

  const filtered = useMemo(
    () => (rows ?? []).filter((q) => statusFilter === "ALL" || q.status === statusFilter),
    [rows, statusFilter]
  );

  const counts = useMemo(() => {
    const c: Partial<Record<StatusFilter, number>> = {};
    for (const q of rows ?? []) {
      const key = q.status as StatusFilter;
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      pending: list.filter((q) => q.status === "PENDING").length,
      answered: list.filter((q) => q.status === "ANSWERED").length,
      hidden: list.filter((q) => q.status === "HIDDEN").length,
    };
  }, [rows]);

  const columns: Column<QuestionRow>[] = [
    {
      key: "product",
      header: "Product",
      sortValue: (q) => q.product?.name ?? "",
      searchValue: (q) => `${q.product?.name ?? ""} ${q.customer?.name ?? q.authorName} ${q.customer?.email ?? ""}`,
      cell: (q) => (
        <span className="block max-w-48 truncate font-medium">{q.product?.name ?? "—"}</span>
      ),
    },
    {
      key: "question",
      header: "Question",
      sortValue: (q) => q.question,
      searchValue: (q) => `${q.question} ${q.answer ?? ""}`,
      cell: (q) => (
        <span className="block max-w-md">
          <span className="block line-clamp-2 font-medium">{q.question}</span>
          {q.answer && (
            <span className="mt-1 block line-clamp-2 text-xs text-primary">
              <span className="font-semibold">Answer:</span> {q.answer}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      sortValue: (q) => q.customer?.name ?? q.authorName,
      hideBelow: "md",
      cell: (q) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{q.customer?.name ?? q.authorName}</span>
          <span className="block truncate text-xs text-muted-foreground">{q.customer?.email ?? ""}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (q) => q.status,
      searchValue: (q) => q.status,
      cell: (q) => (
        <span className="block">
          <Badge className={`text-[11px] ${STATUS_STYLE[q.status] ?? ""}`}>{q.status}</Badge>
          {q.answeredAt && (
            <span className="mt-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
              {formatDateTime(q.answeredAt)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Received",
      sortValue: (q) => new Date(q.createdAt).getTime(),
      hideBelow: "lg",
      cell: (q) => <span className="text-xs text-muted-foreground">{formatDateTime(q.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (q) => (
        <div className="flex justify-end gap-1">
          <Dialog
            open={answerOpen === q.id}
            onOpenChange={(v) => {
              setAnswerOpen(v ? q.id : null);
              if (v) setAnswerText(q.answer ?? "");
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-full">
                <Send className="h-3.5 w-3.5" />
                {q.answer ? "Edit answer" : "Answer"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Answer customer question</DialogTitle>
              </DialogHeader>
              <div className="rounded-md bg-accent/50 p-3 text-sm">
                <p className="font-medium">{q.question}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {q.product?.name} · {q.customer?.name ?? q.authorName}
                </p>
              </div>
              <div>
                <Label htmlFor={`answer-${q.id}`}>Your answer (published as Stellora Team)</Label>
                <Textarea
                  id={`answer-${q.id}`}
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Write a helpful, friendly answer…"
                />
                <p className="mt-1 text-right text-xs text-muted-foreground tnum">
                  {answerText.length}/1000
                </p>
              </div>
              <Button
                onClick={() => submitAnswer(q.id)}
                disabled={busy || answerText.trim().length < 5}
                className="rounded-full bg-primary hover:bg-primary/90"
              >
                {busy ? "Publishing…" : "Publish answer"}
              </Button>
            </DialogContent>
          </Dialog>
          {q.status !== "HIDDEN" ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Hide"
              onClick={() => setStatus(q.id, "HIDDEN")}
              className="text-muted-foreground hover:text-destructive"
            >
              <EyeOff className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Restore"
              onClick={() => setStatus(q.id, "PENDING")}
              className="text-primary hover:bg-accent"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete"
            onClick={() => remove(q.id)}
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
        icon={MessageCircleQuestion}
        title="Product Q&A"
        subtitle="Answer customer questions — published answers build trust and convert browsers."
      />

      {error ? (
        <ErrorState title="Couldn't load questions" message={error} onRetry={load} />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label="Total questions" value={stats.total} icon={MessageCircleQuestion} />
            <StatCard label="Pending" value={stats.pending} icon={Clock3} accent="text-amber-600" />
            <StatCard label="Answered" value={stats.answered} icon={CheckCircle2} accent="text-emerald-600" />
            <StatCard label="Hidden" value={stats.hidden} icon={EyeOff} accent="text-muted-foreground" />
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
            <ChipRow
              label="Question status"
              value={statusFilter}
              options={STATUS_FILTERS}
              onChange={setStatusFilter}
              counts={counts}
            />
          </div>

          <AdvancedTable
            columns={columns}
            rows={rows === null ? null : filtered}
            getKey={(q) => q.id}
            searchable
            searchPlaceholder="Search product, question or customer…"
            initialSort={{ key: "createdAt", dir: "desc" }}
            csvName="questions"
            printTitle="Product Q&A"
            loading={rows === null}
            emptyMessage={
              <EmptyState
                icon={MessageCircleQuestion}
                title={
                  statusFilter === "ALL"
                    ? "No customer questions yet."
                    : `No ${statusFilter.toLowerCase()} questions right now.`
                }
                hint="Questions asked on product pages land here for answering."
              />
            }
          />
          <p className="text-xs text-muted-foreground">{filtered.length} question(s) in this view.</p>
        </>
      )}
    </div>
  );
}
