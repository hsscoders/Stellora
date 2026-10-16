import Link from "next/link";
import { apiMe, apiMyOrders } from "@/lib/server-api";
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

export default async function AccountOverviewPage() {
  const { user } = await apiMe();
  const allOrders = await apiMyOrders();
  const orders = allOrders.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-medium">Hello, {user!.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is a snapshot of your Stellora activity.
        </p>
      </div>

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
