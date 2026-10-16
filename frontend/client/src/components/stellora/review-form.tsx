"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/stellora/stars";
import { cn } from "@/lib/utils";

/**
 * Product review composer. Signed-in customers only (the server rejects
 * guests); submissions enter moderation and the panel reflects that state.
 */
export function ReviewForm({
  productId,
  isLoggedIn,
  existingPending,
}: {
  productId: string;
  isLoggedIn: boolean;
  existingPending: { rating: number; title: string; body: string } | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(existingPending?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState(existingPending?.title ?? "");
  const [body, setBody] = useState(existingPending?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!isLoggedIn) {
    return (
      <div className="rounded-lg border border-border/70 bg-card p-5 text-sm">
        <p className="text-muted-foreground">
          <Button asChild variant="link" className="h-auto p-0 text-primary">
            <a href="/login?next=back">Sign in</a>
          </Button>{" "}
          to share your experience with this piece.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      toast.error("Please select a star rating");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, title, body }),
      });
      const json = await res.json();
      if (json.ok) {
        setDone(true);
        toast.success("Thank you! Your review is awaiting moderation.");
        router.refresh();
      } else {
        toast.error(json.error?.message ?? "Could not submit your review.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-lg border border-primary/30 bg-accent/40 p-5 text-sm text-accent-foreground">
        Thank you — your review has been submitted and will appear once our team approves it.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border/70 bg-card p-5">
      <p className="text-sm font-semibold">Write a review</p>
      <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i}
            aria-label={`${i} star${i > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(i)}
            className="p-0.5"
          >
            <Star
              className={cn(
                "h-6 w-6 transition-colors",
                (hover || rating) >= i ? "fill-primary text-primary" : "text-muted-foreground/40"
              )}
            />
          </button>
        ))}
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Headline (optional)"
        maxLength={120}
        className="mt-4"
        aria-label="Review headline"
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did you like about it? Fit, finish, packaging…"
        rows={4}
        maxLength={2000}
        className="mt-3"
        required
        aria-label="Your review"
      />
      <Button
        type="submit"
        disabled={busy || body.trim().length < 10}
        className="btn-press mt-4 rounded-full bg-primary px-6 hover:bg-primary/90"
      >
        {busy ? "Submitting…" : existingPending ? "Update review" : "Submit review"}
      </Button>
    </form>
  );
}
