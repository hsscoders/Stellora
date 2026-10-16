"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircleQuestion, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ApiQuestionItem } from "@/lib/server-api";
import { cn } from "@/lib/utils";

/**
 * Product Q&A — customers ask, the store answers, everyone benefits.
 * Answered questions render for everyone; a signed-in shopper also sees
 * their own still-pending asks. SSR-seeded for instant paint and SEO.
 */
export function QaSection({
  productId,
  initialQuestions,
  isLoggedIn,
}: {
  productId: string;
  initialQuestions: ApiQuestionItem[];
  isLoggedIn: boolean;
}) {
  const [questions, setQuestions] = useState<ApiQuestionItem[]>(initialQuestions);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const openCount = questions.filter((q) => q.status === "PENDING").length;
  const answeredCount = questions.filter((q) => q.status === "ANSWERED").length;

  async function submitQuestion() {
    const value = text.trim();
    if (value.length < 10) {
      toast.error("Please write at least 10 characters");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${productId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value }),
      });
      const json = await res.json();
      if (json.ok) {
        setQuestions((prev) => [
          {
            id: `local-${Date.now()}`,
            author: "You",
            question: value,
            answer: null,
            answeredAt: null,
            status: "PENDING",
            isMine: true,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setText("");
        setAsking(false);
        toast.success("Question submitted — our team usually replies within a day.");
      } else if (res.status === 401) {
        toast.info("Please sign in to ask a question");
      } else {
        toast.error(json.error?.message ?? "Could not submit your question");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Questions and answers">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-medium">Questions &amp; Answers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {answeredCount > 0
              ? `${answeredCount} answered question${answeredCount === 1 ? "" : "s"} from real shoppers.`
              : "Ask anything — sizing, materials, delivery — our team answers every question."}
          </p>
        </div>
        {isLoggedIn ? (
          <Button
            variant="outline"
            className="rounded-full border-primary/50"
            onClick={() => setAsking((v) => !v)}
          >
            <MessageCircleQuestion className="h-4 w-4" />
            {asking ? "Cancel" : "Ask a question"}
          </Button>
        ) : (
          <Button asChild variant="outline" className="rounded-full border-primary/50">
            <Link href="/login">
              <MessageCircleQuestion className="h-4 w-4" /> Sign in to ask
            </Link>
          </Button>
        )}
      </div>

      {asking && (
        <div className="anim-fade-up mt-5 rounded-lg border border-border/70 bg-card p-4">
          <label htmlFor="qa-question" className="text-sm font-medium">
            Your question
          </label>
          <Textarea
            id="qa-question"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Is this piece waterproof? What is the delivery time to Mumbai?"
            rows={3}
            maxLength={500}
            className="mt-2"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground tnum">{text.length}/500</p>
            <Button
              onClick={submitQuestion}
              disabled={busy || text.trim().length < 10}
              className="rounded-full bg-primary hover:bg-primary/90"
            >
              {busy ? "Sending…" : "Submit question"}
            </Button>
          </div>
        </div>
      )}

      {questions.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
          <MessageCircleQuestion className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No questions yet — be the first to ask. We reply to every single one.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {questions.map((q) => (
            <li
              key={q.id}
              className={cn(
                "rounded-lg border border-border/70 bg-card p-4 sm:p-5",
                q.status === "PENDING" && "border-dashed bg-accent/20"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-medium leading-relaxed">Q. {q.question}</p>
                {q.status === "PENDING" && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    Awaiting answer
                  </span>
                )}
              </div>
              {q.answer && (
                <div className="mt-3 rounded-md bg-accent/40 p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    <BadgeCheck className="h-3.5 w-3.5" /> Stellora Team
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">A. {q.answer}</p>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {q.isMine ? "You" : q.author}
                {openCount > 0 && q.isMine && q.status === "PENDING"
                  ? " · we will notify you here once answered"
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
