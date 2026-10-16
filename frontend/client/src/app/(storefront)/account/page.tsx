import Link from "next/link";
import { Sparkles } from "lucide-react";
import { apiMe, apiMyOrders, apiLoyalty } from "@/lib/server-api";
import { formatINR, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  PROCESSING: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  SHIPPED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  DELIVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const REASON_LABEL: Record<string, string> = {
  EARN: "Earned from order",
  REDEEM: "Redeemed at checkout",
  REFUND_EARN: "Reversed (order cancelled)",
  REFUND_REDEEM: "Refunded (order cancelled)",
  ADJUST: "Adjusted by store",
};

export default async function AccountOverviewPage() {
  const { user } = await apiMe();
  const allOrders = await apiMyOrders();
  const orders = allOrders.slice(0, 5);

  // Rewards are optional — a failure here must never break the page.
  let loyalty: Awaited<ReturnType<typeof apiLoyalty>> | null = null;
  try {
    loyalty = await apiLoyalty();
  } catch {
    loyalty = null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-medium">Hello, {user!.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is a snapshot of your Stellora activity.
        </p>
      </div>

      {/* Stellora Rewards */}
      {loyalty && (
        <section className="overflow-hidden rounded-lg border border-primary/25 brand-gradient text-primary-foreground">
          <div className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] opacity-90">
                <Sparkles className="h-4 w-4" /> Stellora Rewards
              </p>
              <p className="mt-2 text-4xl font-bold tnum">
                {loyalty.points.toLocaleString("en-IN")}
                <span className="ml-2 text-sm font-medium opacity-90">points</span>
              </p>
              <p className="mt-1 text-xs opacity-90 tnum">
                Worth ₹{loyalty.points.toLocaleString("en-IN")} at checkout · {loyalty.earnRate} ·
                redeem up to {Math.round(loyalty.maxRedeemPct * 100)}% per order
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-primary-foreground/40 bg-background/10 text-primary-foreground hover:bg-background/20"
            >
              <Link href="/shop">Earn more points</Link>
            </Button>
          </div>
          {loyalty.history.length > 0 && (
            <div className="border-t border-primary-foreground/20 bg-background/10 px-6 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
                Recent activity
              </p>
              <ul className="mt-2 space-y-1.5 text-xs tnum">
                {loyalty.history.slice(0, 4).map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3">
                    <span className="opacity-90">
                      {REASON_LABEL[h.reason] ?? h.reason}
                      {h.orderNumber ? ` · ${h.orderNumber}` : ""}
                    </span>
                    <span className={h.delta >= 0 ? "font-semibold text-emerald-200" : "font-semibold text-rose-200"}>
                      {h.delta >= 0 ? "+" : ""}
                      {h.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-border/70 bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-medium">Recent Orders</h2>
          <Button asChild variant="link" className="text-primary">
            <Link href="/account/orders">View all</Link>
          </Button>
        </div>
        {orders.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No orders yet.{" "}
            <Link href="/shop" className="text-primary underline">
              Start shopping
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link
                    href={`/account/orders/${o.orderNumber}`}
                    className="font-medium hover:text-primary"
                  >
                    {o.orderNumber}
                  </Link>
                  <p className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</p>
                </div>
                <Badge className={STATUS_COLOR[o.status] ?? ""}>{o.status}</Badge>
                <p className="font-medium tnum">{formatINR(o.grandTotal)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
