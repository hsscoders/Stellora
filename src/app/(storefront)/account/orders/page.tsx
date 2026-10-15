import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { formatINR, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/stellora/empty-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order History" };

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  PROCESSING: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  SHIPPED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  DELIVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export default async function OrdersPage() {
  const user = await getCurrentUser();
  const orders = await db.order.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    include: { items: { take: 3 } },
  });

  if (orders.length === 0) {
    return (
      <div>
        <h1 className="font-serif text-3xl font-medium">Orders</h1>
        <EmptyState
          icon="package"
          title="No orders yet"
          description="When you place an order, it will appear here with live status."
          actionLabel="Browse the collection"
          actionHref="/shop"
          className="mt-6 border border-dashed border-border rounded-lg"
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium">Order History</h1>
      <div className="mt-6 space-y-4">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/account/orders/${o.orderNumber}`}
            className="block rounded-lg border border-border/70 bg-card p-5 transition hover:border-primary/50"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{o.orderNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(o.createdAt)} · {o.items.length}{" "}
                  {o.items.length === 1 ? "line" : "lines"}
                </p>
              </div>
              <Badge className={STATUS_COLOR[o.status] ?? ""}>{o.status}</Badge>
              <p className="font-semibold tnum">{formatINR(o.grandTotal)}</p>
            </div>
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {o.items.map((i) => i.productName).join(", ")}
              {o.items.length > 0 ? "…" : ""}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
