import { apiAdminReports } from "@/lib/server-api";
import { formatINR } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const { daily, topItems, lowStock } = await apiAdminReports();

  // Build a continuous 14-day series from the backend's order data
  const byDay = new Map<string, number>();
  for (const o of daily) {
    const key = new Date(o.date).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + o.grandTotal);
  }
  const days: { date: string; revenue: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    days.push({ date: d, revenue: byDay.get(d) ?? 0 });
  }
  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);
  const total14 = days.reduce((n, d) => n + d.revenue, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-medium">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accurate, database-backed figures. Cancelled orders are excluded from revenue.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Revenue — last 14 days ({formatINR(total14)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-end gap-1.5">
            {days.map((d) => (
              <div key={d.date} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-primary/80 transition-all group-hover:bg-primary"
                  style={{ height: `${Math.max(4, (d.revenue / maxRevenue) * 170)}px` }}
                />
                <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background opacity-0 transition group-hover:opacity-100">
                  {d.date.slice(5)} · {formatINR(d.revenue)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{days[0].date.slice(5)}</span>
            <span>{days[days.length - 1].date.slice(5)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Top products (by units sold)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topItems.map((t) => (
                  <TableRow key={t.productName}>
                    <TableCell className="max-w-52 truncate text-sm font-medium">{t.productName}</TableCell>
                    <TableCell className="text-right tnum text-sm">{t.quantity}</TableCell>
                    <TableCell className="text-right tnum text-sm">{formatINR(t.lineTotal)}</TableCell>
                  </TableRow>
                ))}
                {topItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      No sales yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Low stock (≤ 5 units)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.map((v) => (
                  <TableRow key={v.sku}>
                    <TableCell className="max-w-44 truncate text-sm font-medium">{v.product.name}</TableCell>
                    <TableCell className="text-sm">{v.variantName}</TableCell>
                    <TableCell className={`text-right tnum text-sm ${v.stock === 0 ? "text-destructive" : "text-amber-600"}`}>
                      {v.stock}
                    </TableCell>
                  </TableRow>
                ))}
                {lowStock.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      Nothing low. Good stocking!
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
