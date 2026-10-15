import Link from "next/link";
import { db } from "@/lib/db";
import { formatINR, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [revAgg, rev7, ordersByStatus, productCount, lowStock, recentOrders] = await Promise.all([
    db.order.aggregate({
      where: { status: { not: "CANCELLED" }, createdAt: { gte: monthAgo } },
      _sum: { grandTotal: true },
      _count: true,
    }),
    db.order.aggregate({
      where: { status: { not: "CANCELLED" }, createdAt: { gte: dayAgo } },
      _sum: { grandTotal: true },
    }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.product.count({ where: { status: { not: "ARCHIVED" } } }),
    db.productVariant.findMany({
      where: { isActive: true },
      orderBy: [{ stock: "asc" }],
      take: 8,
      include: { product: { select: { name: true, slug: true } } },
    }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const revenue30 = revAgg._sum.grandTotal ? Number(revAgg._sum.grandTotal) : 0;
  const revenue24 = rev7._sum.grandTotal ? Number(rev7._sum.grandTotal) : 0;
  const lowStockItems = lowStock.filter((v) => v.stock <= v.lowStockThreshold);

  const stats = [
    { label: "Revenue (30 days)", value: formatINR(revenue30), sub: `${revAgg._count} orders` },
    { label: "Revenue (24 hours)", value: formatINR(revenue24), sub: "last day" },
    {
      label: "Open orders",
      value: String(
        ordersByStatus
          .filter((s) => ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"].includes(s.status))
          .reduce((n, s) => n + s._count._all, 0)
      ),
      sub: "awaiting action",
    },
    { label: "Active products", value: String(productCount), sub: `${lowStockItems.length} low on stock` },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-medium">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live figures, straight from the database.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border/70 bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-2 font-serif text-2xl font-semibold tnum">{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-serif text-lg font-medium">Recent Orders</h2>
            <Link href="/admin/orders" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/admin/orders/${o.id}`} className="font-medium hover:text-primary">
                      {o.orderNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {o.user.name}
                    <p className="text-xs text-muted-foreground">{o.user.email}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tnum">
                    {formatINR(o.grandTotal)}
                  </TableCell>
                </TableRow>
              ))}
              {recentOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-serif text-lg font-medium">Low Stock</h2>
            <Link href="/admin/inventory" className="text-xs text-primary hover:underline">
              Manage
            </Link>
          </div>
          <ul className="divide-y divide-border p-2 text-sm">
            {lowStockItems.length === 0 && (
              <li className="px-3 py-6 text-center text-muted-foreground">All stocked up.</li>
            )}
            {lowStockItems.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{v.product.name}</p>
                  <p className="text-xs text-muted-foreground">{v.name}</p>
                </div>
                <span
                  className={`tnum text-sm font-semibold ${
                    v.stock === 0 ? "text-destructive" : v.stock <= v.lowStockThreshold ? "text-amber-600" : ""
                  }`}
                >
                  {v.stock} left
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
