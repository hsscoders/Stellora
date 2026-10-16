"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/notify";
import { Trash2, EyeOff, RotateCcw, MessageCircleQuestion, Send } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const TABS = ["PENDING", "ANSWERED", "HIDDEN"] as const;

export default function AdminQuestionsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("PENDING");
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [answerOpen, setAnswerOpen] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = (status: string) =>
    fetch(`/api/admin/questions?status=${status}`)
      .then((r) => r.json())
      .then((j) => {
        setRows(j.ok ? j.data.questions : []);
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
      load(tab);
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
      load(tab);
    } else {
      toast.error(json.error?.message ?? "Action failed");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this question permanently?")) return;
    const res = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Question deleted");
      load(tab);
    } else {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-medium">Product Q&amp;A</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Answer customer questions — published answers build trust and convert browsers.
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
          <MessageCircleQuestion className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No {tab.toLowerCase()} questions right now.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="min-w-[260px]">Question</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="text-sm">
                    <p className="font-medium">{q.product?.name ?? "—"}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    <p className="line-clamp-2 font-medium">{q.question}</p>
                    {q.answer && (
                      <p className="mt-1 line-clamp-2 text-xs text-primary">
                        <span className="font-semibold">Answer:</span> {q.answer}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <p className="font-medium">{q.customer?.name ?? q.authorName}</p>
                    <p className="text-xs text-muted-foreground">{q.customer?.email ?? ""}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {q.status}
                    </Badge>
                    {q.answeredAt && (
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {formatDateTime(q.answeredAt)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(q.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{rows?.length ?? 0} question(s) in this view.</p>
    </div>
  );
}
