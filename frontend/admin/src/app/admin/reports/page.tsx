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
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  AreaChart,
  BarList,
  ColumnChart,
  DonutChart,
} from "@/components/stellora/advanced/charts";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCardGrid } from "@/components/stellora/advanced/stat-card";
import { SectionCard } from "@/components/stellora/advanced/widgets";
import { PrintButton } from "@/components/stellora/advanced/print-button";
import { BarChart3, Printer, TrendingUp, ShoppingCart, IndianRupee, Ticket, TriangleAlert, Package2 } from "lucide-react";

export const dynamic = "force-dynamic";

const DAY_OPTIONS = [7, 14, 30] as const;

function dayLabel(iso: string): string {
  return `${iso.slice(8)}/${iso.slice(5, 7)}`;
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
  const chartTotal = series.reduce((n, d) => n + d.revenue, 0);
  const ordersTotal = series.reduce((n, d) => n + d.orders, 0);

  // Category breakdown shares
  const catTotal = r.categories.reduce((s, c) => s + c.revenue, 0) || 1;
  const payTotal = Object.values(r.paymentSplit).reduce((s, p) => s + p.total, 0) || 1;
  const payLabels: Record<string, string> = {
    PAY_ON_CONFIRMATION: "Pay on confirmation",
    GATEWAY: "Online gateway",
  };

  return (
    <div className="space-y-8">
      <PageHeader
        iconNode={<BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />}
        title="Reports & Analytics"
        subtitle={`Database-backed figures for the last ${days} days. Cancelled orders are excluded from revenue.`}
        actions={
          <>
            <div className="flex overflow-hidden rounded-full border border-border">
              {DAY_OPTIONS.map((d) => (
                <Link
                  key={d}
                  href={`/admin/reports${d === 14 ? "" : `?days=${d}`}`}
                  className={`px-3.5 py-1.5 text-xs font-medium transition ${
                    d === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {d}d
                </Link>
              ))}
            </div>
            <PrintButton
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm transition hover:border-primary hover:text-primary"
              label="Print"
              icon={<Printer className="h-4 w-4" />}
            />
          </>
        }
      />

      {/* KPI cards with period-over-period deltas */}
      <StatCardGrid
        className="sm:grid-cols-2 xl:grid-cols-4"
        items={[
          { label: "Revenue", value: formatINR(r.kpi.revenue), icon: "rupee", deltaPct: r.kpi.revenueDeltaPct, spark: series.map((d) => d.revenue) },
          { label: "Orders", value: String(r.kpi.orders), icon: "cart", deltaPct: r.kpi.ordersDeltaPct, spark: series.map((d) => d.orders) },
          { label: "Avg. order value", value: formatINR(r.kpi.aov), icon: "trending", deltaPct: r.kpi.aovDeltaPct },
          { label: "Units sold", value: String(r.categories.reduce((s, c) => s + c.units, 0)), icon: "package2", deltaLabel: "in period" },
        ]}
      />

      {/* Revenue + orders charts */}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <SectionCard
          title={`Revenue — last ${days} days`}
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
          action={<span className="text-xs text-muted-foreground tnum">Total {formatINR(chartTotal)}</span>}
        >
          <AreaChart data={series.map((d) => ({ label: dayLabel(d.date), value: d.revenue }))} format="inr" height={240} />
        </SectionCard>
        <SectionCard title="Orders per day" icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}>
          <ColumnChart data={series.map((d) => ({ label: dayLabel(d.date), value: d.orders }))} height={240} format="num" />
          <p className="mt-3 text-center text-xs text-muted-foreground tnum">{ordersTotal} orders in this window</p>
        </SectionCard>
      </div>

      {/* Category breakdown + payment split */}
      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Category sales breakdown" icon={<Package2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />} className="xl:col-span-2">
          <div className="grid gap-6 md:grid-cols-[1fr_240px]">
            <div className="space-y-4">
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
                      <div className="h-full rounded-full bg-primary/80 transition-all duration-500" style={{ width: `${Math.max(2, share)}%` }} />
                    </div>
                  </div>
                );
              })}
              {r.categories.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No sales in this window yet.</p>
              )}
            </div>
            {r.categories.length > 0 && (
              <DonutChart
                data={r.categories.map((c) => ({ label: c.category, value: c.revenue }))}
                format="inr"
                centerLabel="revenue"
                size={170}
                thickness={24}
              />
            )}
          </div>
        </SectionCard>

        <SectionCard title="Payment mix" icon={<IndianRupee className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}>
          {Object.keys(r.paymentSplit).length > 0 ? (
            <DonutChart
              data={Object.entries(r.paymentSplit).map(([method, v]) => ({ label: payLabels[method] ?? method, value: v.total }))}
              format="inr"
              centerLabel="collected"
              size={170}
              thickness={24}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
          )}
        </SectionCard>
      </div>

      {/* Top products + coupons + low stock */}
      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Top products (by units)" icon={<TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />} className="xl:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <BarList
              data={r.topItems.slice(0, 7).map((t) => ({ label: t.productName, value: t.quantity }))}
              format="num"
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.topItems.slice(0, 7).map((t) => (
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
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Top coupons used" icon={<Ticket className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}>
            {r.topCoupons.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No coupon redemptions in this window.</p>
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
          </SectionCard>

          <SectionCard title="Low stock (≤ 5 units)" icon={<TriangleAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />} action={<Link href="/admin/inventory" className="text-xs text-primary hover:underline">Restock</Link>}>
            <ul className="divide-y divide-border text-sm">
              {r.lowStock.slice(0, 6).map((v) => (
                <li key={v.sku} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{v.product.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{v.variantName}</span>
                  </span>
                  <span className={`tnum shrink-0 font-semibold ${v.stock === 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                    {v.stock}
                  </span>
                </li>
              ))}
              {r.lowStock.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">Nothing low. Good stocking!</li>
              )}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
