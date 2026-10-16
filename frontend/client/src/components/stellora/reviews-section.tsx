import { StarRating } from "@/components/stellora/stars";
import { ReviewForm } from "@/components/stellora/review-form";
import { formatDateTime } from "@/lib/utils";

export type ReviewSummary = {
  average: number;
  count: number;
  distribution: Record<string, number>;
};

export type ReviewItem = {
  id: string;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  status: string;
  isMine: boolean;
  createdAt: string;
};

/** Server-rendered ratings + reviews block for the product page. */
export function ReviewsSection({
  productId,
  summary,
  reviews,
  isLoggedIn,
  myPendingReview,
}: {
  productId: string;
  summary: ReviewSummary;
  reviews: ReviewItem[];
  isLoggedIn: boolean;
  myPendingReview: { rating: number; title: string; body: string } | null;
}) {
  return (
    <section id="reviews" className="mt-16">
      <h2 className="text-center font-serif text-3xl font-medium">Ratings &amp; Reviews</h2>
      <div className="mx-auto mt-4 h-px w-24 gold-line" />

      <div className="mt-10 grid gap-10 lg:grid-cols-[280px_1fr]">
        {/* Summary */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-lg border border-border/70 bg-card p-6 text-center">
            <p className="font-sans text-5xl font-bold tnum">
              {summary.count ? summary.average.toFixed(1) : "—"}
            </p>
            <StarRating value={summary.average} size="md" className="mt-2 justify-center" />
            <p className="mt-2 text-xs text-muted-foreground">
              {summary.count === 0
                ? "No reviews yet"
                : `${summary.count} verified customer review${summary.count === 1 ? "" : "s"}`}
            </p>
            {summary.count > 0 && (
              <div className="mt-4 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const n = Number(summary.distribution[String(star)] ?? 0);
                  const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs tnum">
                      <span className="w-3 text-muted-foreground">{star}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full brand-gradient" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-7 text-right text-muted-foreground">{n}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-4">
            <ReviewForm
              productId={productId}
              isLoggedIn={isLoggedIn}
              existingPending={myPendingReview}
            />
          </div>
        </div>

        {/* List */}
        <div>
          {reviews.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Be the first to review this piece — your honest experience helps other shoppers.
            </p>
          ) : (
            <ul className="space-y-5">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-lg border border-border/70 bg-card p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StarRating value={r.rating} />
                    <p className="text-sm font-semibold">{r.title || "Verified feedback"}</p>
                    {r.isVerifiedPurchase && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                        Verified purchase
                      </span>
                    )}
                    {r.status === "PENDING" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Awaiting approval
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {r.authorName} · {formatDateTime(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
