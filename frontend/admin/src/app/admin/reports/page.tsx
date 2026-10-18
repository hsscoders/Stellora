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
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export const dynamic = "force-dynamic";

const DAY_OPTIONS = [7, 14, 30] as const;

function Delta({ pct }: { pct: number }) {
  if (pct === 0) {
    return <span className="text-[11px] text-muted-foreground">— flat vs previous</span>;
  }
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${up ? "text-emerald-600" : "text-destructive"}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(pct)}%
      <span className="font-normal text-muted-foreground">vs prev {up ? "period" : "period"}</span>
    </span>
  );
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const parsed = Number(sp.days);
  const days = DAY_OPTIONS.includes(parsed as (typeof DAY_OPTIONS)[number]) ? parsed : 14;
  const r = await apiAdminReports(days);

  // Build a continuous day series from the backend's order data
  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (const o of r.daily) {
    const key = new Date(o.date).toISOString().slice(0, 10);
    const cur = byDay.get(key) ?? { revenue: 0, orders: 0 };
    cur.revenue += o.grandTotal;
    cur.orders += 1;
    byDay.set(key, cur);
  }
  const series: { date: string; revenue: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const v = byDay.get(d);
    series.push({ date: d, revenue: v?.revenue ?? 0, orders: v?.orders ?? 0 });
  }
  const maxRevenue = Math.max(...series.map((d) => d.revenue), 1);
  const chartTotal = series.reduce((n, d) => n + d.revenue, 0);

  // Category breakdown shares
  const catTotal = r.categories.reduce((s, c) => s + c.revenue, 0) || 1;
  const payTotal =
    Object.values(r.paymentSplit).reduce((s, p) => s + p.total, 0) || 1;
  const payLabels: Record<string, string> = {
    PAY_ON_CONFIRMATION: "Pay on confirmation",
    GATEWAY: "Online gateway",
  };

  const kpis = [
    { label: "Revenue", value: formatINR(r.kpi.revenue), delta: r.kpi.revenueDeltaPct },
    { label: "Orders", value: String(r.kpi.orders), delta: r.kpi.ordersDeltaPct },
    { label: "Avg. order value", value: formatINR(r.kpi.aov), delta: r.kpi.aovDeltaPct },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accurate, database-backed figures. Cancelled orders are excluded from revenue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border">
            {DAY_OPTIONS.map((d) => (
              <Link
                key={d}
                href={`/admin/reports${d === 14 ? "" : `?days=${d}`}`}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  d === days ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards with period-over-period deltas */}
      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="mt-1 font-serif text-2xl font-medium tnum">{k.value}</div>
              <div className="mt-2">
                <Delta pct={k.delta} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Revenue — last {days} days ({formatINR(chartTotal)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-end gap-1.5">
            {series.map((d) => (
              <div key={d.date} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-primary/80 transition-all group-hover:bg-primary"
                  style={{ height: `${Math.max(4, (d.revenue / maxRevenue) * 170)}px` }}
                />
                <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background opacity-0 transition group-hover:opacity-100">
                  {d.date.slice(5)} · {formatINR(d.revenue)} · {d.orders} ord
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{series[0].date.slice(5)}</span>
            <span>{series[series.length - 1].date.slice(5)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Category breakdown + payment split */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Category sales breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {r.categories.map((c) => {
              const share = (c.revenue / catTotal) * 100;
              return (
                <div key={c.category}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{c.category}</span>
                    <span className="tnum text-muted-foreground">
                      {formatINR(c.revenue)} · {c.units} units · {Math.round(share)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${Math.max(2, share)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {r.categories.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales in this window yet.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl">Payment mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(r.paymentSplit).map(([method, v]) => {
                const share = (v.total / payTotal) * 100;
                return (
                  <div key={method}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{payLabels[method] ?? method}</span>
                      <span className="tnum text-muted-foreground">
                        {formatINR(v.total)} · {v.count} orders · {Math.round(share)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{ width: `${Math.max(2, share)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl">Top coupons used</CardTitle>
            </CardHeader>
            <CardContent>
              {r.topCoupons.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">No coupon redemptions in this window.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {r.topCoupons.map((c) => (
                    <Badge key={c.code} variant="secondary" className="gap-1.5">
                      {c.code}
                      <span className="font-normal text-muted-foreground">
                        {c.orders}× · saved {formatINR(c.saved)}
                      </span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Existing tables */}
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
                {r.topItems.map((t) => (
                  <TableRow key={t.productName}>
                    <TableCell className="max-w-52 truncate text-sm font-medium">{t.productName}</TableCell>
                    <TableCell className="text-right tnum text-sm">{t.quantity}</TableCell>
                    <TableCell className="text-right tnum text-sm">{formatINR(t.lineTotal)}</TableCell>
                  </TableRow>
                ))}
                {r.topItems.length === 0 && (
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
                {r.lowStock.map((v) => (
                  <TableRow key={v.sku}>
                    <TableCell className="max-w-44 truncate text-sm font-medium">{v.product.name}</TableCell>
                    <TableCell className="text-sm">{v.variantName}</TableCell>
                    <TableCell className={`text-right tnum text-sm ${v.stock === 0 ? "text-destructive" : "text-amber-600"}`}>
                      {v.stock}
                    </TableCell>
                  </TableRow>
                ))}
                {r.lowStock.length === 0 && (
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
