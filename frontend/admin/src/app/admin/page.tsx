import { Suspense } from "react";
import Link from "next/link";
import { apiAdminStats } from "@/lib/server-api";
import { formatINR, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AutomationCard } from "@/components/stellora/automation-card";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCardGrid } from "@/components/stellora/advanced/stat-card";
import { DonutChart } from "@/components/stellora/advanced/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IndianRupee,
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  Store,
  Trophy,
  AlertTriangle,
  ClipboardList,
  BarChart3,
  Plus,
  Layers,
  LayoutDashboard,
  Ticket,
  Star,
} from "lucide-react";

export const dynamic = "force-dynamic";

/* ---------------- Types (API shape — coerced before use) ---------------- */

type DailyPoint = { date: string; total: number; count: number };
type TopProduct = { productId: string | null; name: string; qty: number; revenue: number };
type LowStockVariant = {
  variantId: string;
  variantName: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
  product: { name: string; slug: string };
};
type RecentOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  grandTotal: number;
  createdAt: string;
  source: "POS" | "ONLINE";
  user: { name: string; email: string } | null;
};
type DashboardStats = {
  revenue30d: number;
  orders30d: number;
  revenue24h: number;
  ordersByStatus: Record<string, number>;
  productCount: number;
  customerCount: number;
  pendingReviews: number;
  pendingQuestions: number;
  posVsOnline: { POS: { total: number; count: number }; ONLINE: { total: number; count: number } };
  dailyRevenue: DailyPoint[];
  topProducts: TopProduct[];
  lowStock: LowStockVariant[];
  recentOrders: RecentOrder[];
};

/* ---------------- Coercion helpers ---------------- */

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function coerceStats(raw: unknown): DashboardStats {
  const r = asObject(raw);
  const pvo = asObject(r.posVsOnline);
  const POS = asObject(pvo.POS);
  const ONLINE = asObject(pvo.ONLINE);
  return {
    revenue30d: num(r.revenue30d),
    orders30d: num(r.orders30d),
    revenue24h: num(r.revenue24h),
    ordersByStatus: Object.fromEntries(
      Object.entries(asObject(r.ordersByStatus)).map(([k, v]) => [k, num(v)])
    ),
    productCount: num(r.productCount),
    customerCount: num(r.customerCount),
    pendingReviews: num(r.pendingReviews),
    pendingQuestions: num(r.pendingQuestions),
    posVsOnline: {
      POS: { total: num(POS.total), count: num(POS.count) },
      ONLINE: { total: num(ONLINE.total), count: num(ONLINE.count) },
    },
    dailyRevenue: asArray<DailyPoint>(r.dailyRevenue).map((d) => ({
      date: String(asObject(d).date ?? ""),
      total: num(asObject(d).total),
      count: num(asObject(d).count),
    })),
    topProducts: asArray<TopProduct>(r.topProducts).map((p) => ({
      productId: asObject(p).productId == null ? null : String(asObject(p).productId),
      name: String(asObject(p).name ?? "Unknown product"),
      qty: num(asObject(p).qty),
      revenue: num(asObject(p).revenue),
    })),
    lowStock: asArray<LowStockVariant>(r.lowStock).map((v) => ({
      variantId: String(asObject(v).variantId ?? ""),
      variantName: String(asObject(v).variantName ?? ""),
      sku: String(asObject(v).sku ?? ""),
      stock: num(asObject(v).stock),
      lowStockThreshold: num(asObject(v).lowStockThreshold),
      product: {
        name: String(asObject(asObject(v).product).name ?? "Unknown"),
        slug: String(asObject(asObject(v).product).slug ?? ""),
      },
    })),
    recentOrders: asArray<RecentOrder>(r.recentOrders).map((o) => ({
      id: String(asObject(o).id ?? ""),
      orderNumber: String(asObject(o).orderNumber ?? ""),
      status: String(asObject(o).status ?? ""),
      paymentStatus: String(asObject(o).paymentStatus ?? ""),
      grandTotal: num(asObject(o).grandTotal),
      createdAt: String(asObject(o).createdAt ?? ""),
      source: asObject(o).source === "POS" ? "POS" : "ONLINE",
      user:
        asObject(o).user && typeof asObject(o).user === "object"
          ? {
              name: String(asObject(asObject(o).user).name ?? ""),
              email: String(asObject(asObject(o).user).email ?? ""),
            }
          : null,
    })),
  };
}

/* ---------------- 14-day series (UTC buckets — matches backend $dateToString) ---------------- */

function buildDailySeries(sparse: DailyPoint[]): DailyPoint[] {
  const map = new Map(sparse.filter((d) => d.date).map((d) => [d.date, d]));
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days: DailyPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(todayUtc - i * 86400000).toISOString().slice(0, 10);
    const hit = map.get(key);
    days.push({ date: key, total: num(hit?.total), count: num(hit?.count) });
  }
  return days;
}

function utcDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}
function weekdayShort(iso: string): string {
  return utcDay(iso).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
}

/* ---------------- Status styling ---------------- */

const STATUS_STYLES: Record<string, string> = {
  PENDING: "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  CONFIRMED: "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  PROCESSING: "border-primary/40 bg-primary/10 text-primary",
  SHIPPED: "border-primary/50 bg-primary/15 text-primary",
  DELIVERED: "border-transparent bg-emerald-600/90 text-white",
  CANCELLED: "border-destructive/40 bg-destructive/10 text-destructive",
};

const PIPELINE: { status: string; label: string }[] = [
  { status: "PENDING", label: "Pending" },
  { status: "CONFIRMED", label: "Confirmed" },
  { status: "PROCESSING", label: "Processing" },
  { status: "SHIPPED", label: "Shipped" },
  { status: "DELIVERED", label: "Delivered" },
  { status: "CANCELLED", label: "Cancelled" },
];

/* ---------------- Small building blocks ---------------- */

function DashCard({
  title,
  caption,
  action,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-border/70 bg-card ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-serif text-lg font-medium">
            {Icon && <Icon className="h-4 w-4 text-primary" />}
            {title}
          </h2>
          {caption && <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}

/* ---------------- Page ---------------- */

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  let stats: DashboardStats | null = null;
  let loadError: string | null = null;
  try {
    stats = coerceStats(await apiAdminStats());
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load dashboard stats";
  }

  if (!stats) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-serif text-3xl font-medium">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live figures, straight from the database.</p>
        </div>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
          <p className="font-medium text-destructive">Could not load dashboard stats</p>
          <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
        </div>
      </div>
    );
  }

  const {
    revenue30d,
    orders30d,
    revenue24h,
    ordersByStatus,
    productCount,
    customerCount,
    pendingReviews,
    pendingQuestions,
    posVsOnline,
    topProducts,
    lowStock,
    recentOrders,
  } = stats;

  const series = buildDailySeries(stats.dailyRevenue);
  const maxDay = Math.max(...series.map((d) => d.total), 0);
  const seriesTotal = series.reduce((n, d) => n + d.total, 0);
  const seriesOrders = series.reduce((n, d) => n + d.count, 0);

  const lowStockItems = lowStock.filter((v) => v.stock <= v.lowStockThreshold);
  const openOrders = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"].reduce(
    (n, s) => n + (ordersByStatus[s] ?? 0),
    0
  );

  const pos = posVsOnline?.POS ?? { total: 0, count: 0 };
  const online = posVsOnline?.ONLINE ?? { total: 0, count: 0 };
  const channelTotal = pos.total + online.total;
  const onlinePct = channelTotal > 0 ? Math.round((online.total / channelTotal) * 100) : 0;
  const posPct = channelTotal > 0 ? 100 - onlinePct : 0;

  const aov = orders30d > 0 ? revenue30d / orders30d : 0;
  const revSpark = series.map((d) => d.total);
  const ordSpark = series.map((d) => d.count);

  return (
    <div className="space-y-8">
      <PageHeader
        iconNode={<LayoutDashboard className="h-5 w-5 text-primary" aria-hidden="true" />}
        title="Dashboard"
        subtitle="Live figures, straight from the database. Cancelled orders are excluded from revenue."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        }
      />

      {/* Quick actions — one-tap jump to the most-used console flows */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {[
          { href: "/admin/products/new", label: "New product", icon: Plus },
          { href: "/admin/pos", label: "Open POS", icon: Store },
          { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
          { href: "/admin/inventory", label: "Inventory", icon: Layers },
          { href: "/admin/reports", label: "Reports", icon: BarChart3 },
          { href: "/admin/coupons", label: "Coupons", icon: Ticket },
          { href: "/admin/customers", label: "Customers", icon: Users },
          { href: "/admin/reviews", label: "Reviews", icon: Star },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-border/70 bg-card p-2 text-center text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent/50 hover:text-primary sm:min-h-20 sm:text-xs"
          >
            <a.icon className="h-5 w-5 text-primary" aria-hidden />
            {a.label}
          </Link>
        ))}
      </div>

      {/* KPI row */}
      <StatCardGrid
        items={[
          { label: "Revenue · 30 days", value: formatINR(revenue30d), icon: "rupee", spark: revSpark },
          { label: "Revenue · 24 hours", value: formatINR(revenue24h), icon: "trending" },
          { label: "Orders · 30 days", value: String(orders30d), icon: "cart", spark: ordSpark },
          { label: "Avg. order value", value: formatINR(aov), icon: "trending" },
          { label: "Customers", value: String(customerCount), icon: "users" },
          { label: "Products", value: String(productCount), icon: "package" },
        ]}
      />

      {/* Auto-pilot — unattended automation sweeps */}
      <AutomationCard />

      {/* Revenue chart — pure CSS/SVG, no chart library */}
      <DashCard
        title="Revenue — last 14 days"
        caption={`14-day total ${formatINR(seriesTotal)} · ${seriesOrders} orders`}
        icon={BarChart3}
        action={
          <Link href="/admin/reports" className="shrink-0 text-xs text-primary hover:underline">
            Full reports
          </Link>
        }
      >
        <div className="p-5 sm:p-6">
          {maxDay === 0 && (
            <p className="mb-4 text-xs text-muted-foreground">
              No revenue recorded in the last 14 days yet — bars will fill as orders land.
            </p>
          )}
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[560px]">
              <div className="relative h-44 border-b border-border">
                {[25, 50, 75].map((pct) => (
                  <div
                    key={pct}
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/50"
                    style={{ bottom: `${pct}%` }}
                  />
                ))}
                <div className="absolute inset-0 flex items-end gap-1 sm:gap-1.5">
                  {series.map((d, i) => {
                    const isToday = i === series.length - 1;
                    const pct = maxDay > 0 ? Math.max((d.total / maxDay) * 100, 0) : 0;
                    const tip = `${isToday ? "Today" : weekdayShort(d.date)} ${d.date.slice(8)} · ${formatINR(d.total)} · ${d.count} order${d.count === 1 ? "" : "s"}`;
                    return (
                      <div
                        key={d.date}
                        title={tip}
                        className="group flex h-full flex-1 cursor-default flex-col justify-end"
                      >
                        <div
                          className={`w-full rounded-t-[3px] transition-colors ${
                            isToday
                              ? "bg-gradient-to-t from-amber-600 via-amber-500 to-yellow-400"
                              : d.total > 0
                                ? "bg-primary/25 group-hover:bg-primary/45"
                                : "bg-border/60 group-hover:bg-border"
                          }`}
                          style={{ height: `${pct}%`, minHeight: 2 }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-1.5 flex gap-1 sm:gap-1.5">
                {series.map((d, i) => {
                  const isToday = i === series.length - 1;
                  return (
                    <div key={d.date} className="flex-1 text-center leading-tight">
                      <span
                        className={`block text-[9px] ${isToday ? "font-semibold text-primary" : "text-muted-foreground/70"}`}
                      >
                        {weekdayShort(d.date).charAt(0)}
                      </span>
                      <span
                        className={`block text-[10px] tnum ${isToday ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                      >
                        {d.date.slice(8)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </DashCard>

      {/* Channels / best sellers / pipeline */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <DashCard
          title="Online vs In-store"
          caption="Revenue share · last 30 days"
          icon={Store}
        >
          <div className="space-y-4 p-5">
            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-border/50"
              role="img"
              aria-label={`Online ${onlinePct}% · In-store ${posPct}%`}
            >
              {channelTotal > 0 && (
                <>
                  <div className="h-full bg-emerald-500/80" style={{ width: `${onlinePct}%` }} />
                  <div className="h-full bg-primary" style={{ width: `${posPct}%` }} />
                </>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                  Online
                  <span className="tnum text-xs text-muted-foreground">{online.count} orders</span>
                </span>
                <span className="tnum shrink-0 font-medium">{formatINR(online.total)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                  In-store (POS)
                  <span className="tnum text-xs text-muted-foreground">{pos.count} bills</span>
                </span>
                <span className="tnum shrink-0 font-medium">{formatINR(pos.total)}</span>
              </div>
              {pos.total === 0 && (
                <p className="text-xs italic text-muted-foreground">
                  No POS bills yet — ring up your first sale from{" "}
                  <Link href="/admin/pos" className="text-primary hover:underline">
                    Point of Sale
                  </Link>
                  .
                </p>
              )}
              {channelTotal === 0 && (
                <p className="text-xs italic text-muted-foreground">
                  No sales in the last 30 days.
                </p>
              )}
            </div>
          </div>
        </DashCard>

        <DashCard
          title="Top products (30d)"
          caption="Ranked by units sold"
          icon={Trophy}
        >
          <ol className="divide-y divide-border">
            {topProducts.map((p, i) => (
              <li key={`${p.productId ?? "x"}-${i}`} className="flex items-center gap-3 px-5 py-3">
                <span className="tnum w-5 shrink-0 text-center font-serif text-sm text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  {p.productId ? (
                    <Link
                      href={`/admin/products/${p.productId}`}
                      className="block truncate font-medium hover:text-primary"
                    >
                      {p.name}
                    </Link>
                  ) : (
                    <span className="block truncate font-medium">{p.name}</span>
                  )}
                </div>
                <Badge variant="secondary" className="tnum shrink-0 text-[10px]">
                  {p.qty} sold
                </Badge>
                <span className="tnum w-20 shrink-0 text-right text-sm font-medium">
                  {formatINR(p.revenue)}
                </span>
              </li>
            ))}
            {topProducts.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                No sales in the last 30 days.
              </li>
            )}
          </ol>
        </DashCard>

        <DashCard
          title="Order pipeline"
          caption="All-time orders by status"
          icon={ClipboardList}
          action={
            <Link href="/admin/orders" className="shrink-0 text-xs text-primary hover:underline">
              Manage
            </Link>
          }
        >
          <div className="flex flex-wrap gap-2 p-5">
            {PIPELINE.map((s) => {
              const count = ordersByStatus[s.status] ?? 0;
              return (
                <Link
                  key={s.status}
                  href={`/admin/orders?status=${s.status}`}
                  className={`tnum inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition hover:opacity-75 ${
                    STATUS_STYLES[s.status] ?? "border-border bg-card text-foreground"
                  } ${count === 0 ? "opacity-50" : ""}`}
                >
                  <span className="font-semibold">{count}</span>
                  {s.label}
                </Link>
              );
            })}
          </div>
          {openOrders + (ordersByStatus["CANCELLED"] ?? 0) > 0 && (
            <div className="border-t border-border px-5 py-4">
              <DonutChart
                data={PIPELINE.filter((s) => (ordersByStatus[s.status] ?? 0) > 0).map((s) => ({ label: s.label, value: ordersByStatus[s.status] ?? 0 }))}
                format="num"
                centerLabel="orders"
                size={150}
                thickness={22}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <Link href="/admin/reviews" className="hover:text-primary">
              {pendingReviews} review{pendingReviews === 1 ? "" : "s"} awaiting
            </Link>
            <Link href="/admin/questions" className="hover:text-primary">
              {pendingQuestions} question{pendingQuestions === 1 ? "" : "s"} awaiting
            </Link>
          </div>
        </DashCard>
      </div>

      {/* Recent orders + low stock */}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <DashCard
          title="Recent orders"
          action={
            <Link href="/admin/orders" className="shrink-0 text-xs text-primary hover:underline">
              View all
            </Link>
          }
        >
          <div className="hidden md:block">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {o.orderNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {o.user?.name ?? "Guest"}
                    <p className="text-xs text-muted-foreground">{o.user?.email ?? ""}</p>
                  </TableCell>
                  <TableCell>
                    {o.source === "POS" ? (
                      <Badge className="text-[10px]">POS</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        ONLINE
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${STATUS_STYLES[o.status] ?? ""}`}
                    >
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
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>

          {/* Mobile-friendly card list — same data, thumb-readable */}
          <ul className="divide-y divide-border md:hidden">
            {recentOrders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{o.orderNumber}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {o.user?.name ?? "Guest"} · {formatDateTime(o.createdAt)}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] ${STATUS_STYLES[o.status] ?? ""}`}
                  >
                    {o.status}
                  </Badge>
                  <span className="tnum shrink-0 text-sm font-semibold">
                    {formatINR(o.grandTotal)}
                  </span>
                </Link>
              </li>
            ))}
            {recentOrders.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                No orders yet.
              </li>
            )}
          </ul>
        </DashCard>

        <DashCard
          title="Low stock"
          caption="At or below threshold"
          icon={AlertTriangle}
          action={
            <Link href="/admin/inventory" className="shrink-0 text-xs text-primary hover:underline">
              Manage
            </Link>
          }
        >
          <ul className="divide-y divide-border p-2 text-sm">
            {lowStockItems.length === 0 && (
              <li className="px-3 py-6 text-center text-muted-foreground">All stocked up.</li>
            )}
            {lowStockItems.map((v) => (
              <li key={v.variantId} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <Link href="/admin/inventory" className="block truncate font-medium hover:text-primary">
                    {v.product.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.variantName}
                    {v.sku ? ` · ${v.sku}` : ""}
                  </p>
                </div>
                <span
                  className={`tnum shrink-0 text-sm font-semibold ${
                    v.stock === 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {v.stock === 0 ? "Out" : `${v.stock} left`}
                </span>
              </li>
            ))}
          </ul>
        </DashCard>
      </div>
    </div>
  );
}
