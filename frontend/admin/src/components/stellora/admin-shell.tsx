"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Tags,
  Layers,
  Store,
  ShoppingCart,
  Users,
  Ticket,
  Image as ImageIcon,
  Truck,
  Settings,
  ShieldCheck,
  ScrollText,
  BarChart3,
  Mail,
  ArrowUpRight,
  Star,
  RotateCcw,
  Send,
  MessageCircleQuestion,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Bell,
  Search,
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  Barcode,
  type LucideIcon,
} from "lucide-react";
import { formatINR } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type NavItem = { href: string; label: string; icon: LucideIcon; isNew?: boolean };
type NavSection = { section: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    section: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    section: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/categories", label: "Categories", icon: Tags },
      { href: "/admin/inventory", label: "Inventory", icon: Layers },
    ],
  },
  {
    section: "Selling",
    items: [
      { href: "/admin/pos", label: "Point of Sale", icon: Store, isNew: true },
      { href: "/admin/barcodes", label: "Barcode Studio", icon: Barcode, isNew: true },
      { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
      { href: "/admin/returns", label: "Returns & Exchanges", icon: RotateCcw },
      { href: "/admin/coupons", label: "Coupons", icon: Ticket },
    ],
  },
  {
    section: "Customers",
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "/admin/reviews", label: "Reviews", icon: Star },
      { href: "/admin/questions", label: "Product Q&A", icon: MessageCircleQuestion },
      { href: "/admin/newsletter", label: "Newsletter & Alerts", icon: Send },
    ],
  },
  {
    section: "Marketing",
    items: [
      { href: "/admin/banners", label: "Banners", icon: ImageIcon },
      { href: "/admin/shipping", label: "Shipping", icon: Truck },
    ],
  },
  {
    section: "System",
    items: [
      { href: "/admin/messages", label: "Messages", icon: Mail },
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/admin/users", label: "Admin Users", icon: ShieldCheck },
      { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
    ],
  },
];

const NAV_FLAT: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export type AdminShellUser = { name: string; email: string; role: string };

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return (parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "A").slice(0, 2);
}

function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-serif text-lg font-semibold text-primary-foreground shadow-sm shadow-primary/30"
        aria-hidden
      >
        S
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block font-serif text-[17px] font-semibold leading-tight tracking-[0.16em]">
            STELLORA
          </span>
          <span className="block text-[9px] font-medium uppercase leading-tight tracking-[0.28em] text-muted-foreground">
            Master Control
          </span>
        </span>
      )}
    </div>
  );
}

function NavGroups({
  collapsed = false,
  pathname,
  onNavigate,
}: {
  collapsed?: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="stellora-scroll flex-1 overflow-y-auto px-3 py-3 text-sm" aria-label="Admin sections">
      {NAV_SECTIONS.map((s, si) => (
        <div key={s.section} className={si === 0 ? "" : "mt-5"}>
          {collapsed ? (
            <div className="mx-3 mb-2 border-t border-border/70" aria-hidden />
          ) : (
            <p className="flex items-center gap-2 px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <span className="h-1 w-1 rotate-45 bg-primary/70" aria-hidden />
              {s.section}
            </p>
          )}
          <div className={collapsed ? "space-y-1" : "space-y-0.5"}>
            {s.items.map((n) => {
              const active = isActive(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={onNavigate}
                  title={collapsed ? n.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center rounded-lg transition-colors duration-200 ${
                    collapsed ? "h-10 justify-center px-0" : "gap-2.5 px-3 py-2"
                  } ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                      aria-hidden
                    />
                  )}
                  <n.icon className="h-4 w-4 shrink-0" aria-hidden />
                  {!collapsed && (
                    <>
                      <span className="min-w-0 flex-1 truncate">{n.label}</span>
                      {n.isNew && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
                          New
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UserBlock({
  user,
  collapsed = false,
  onLogout,
  loggingOut,
}: {
  user: AdminShellUser;
  collapsed?: boolean;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-t border-border p-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary"
          title={`${user.name} · ${user.role}`}
        >
          {initialsOf(user.name)}
        </span>
        <a
          href="/"
          title="View storefront"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          title="Logout"
          aria-label="Logout"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2.5 rounded-lg bg-accent/60 p-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary"
          aria-hidden
        >
          {initialsOf(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-foreground">{user.name}</span>
          <span className="block truncate text-[10px] leading-tight text-muted-foreground">
            {user.email}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary">
          {user.role}
        </span>
      </div>
      <div className="mt-2 flex items-stretch gap-1.5">
        <a
          href="/"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> Storefront
        </a>
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden /> {loggingOut ? "Signing out…" : "Logout"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Global search — debounced, abortable, grouped quick-find
   ============================================================ */

type SearchOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  grandTotal: number;
  createdAt: string;
};
type SearchProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  isActive: boolean;
  imageUrl: string | null;
};
type SearchCustomer = { id: string; name: string; email: string; createdAt: string };
type SearchResults = {
  orders: SearchOrder[];
  products: SearchProduct[];
  customers: SearchCustomer[];
};

const EMPTY_RESULTS: SearchResults = { orders: [], products: [], customers: [] };

// Status badge tints — mirrors the Orders page so the console stays consistent.
const STATUS_TINT: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CONFIRMED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  PROCESSING: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  SHIPPED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  DELIVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

/** Render `text` with every occurrence of `query` subtly emphasized. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;
  const end = at + needle.length;
  return (
    <>
      {text.slice(0, at)}
      <span className="font-medium text-foreground">{text.slice(at, end)}</span>
      {text.slice(end)}
    </>
  );
}

function SearchRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Skeleton className="h-8 w-8 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
    </div>
  );
}

function GlobalSearch() {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced lookup (~250ms); previous in-flight request is aborted so only
  // the newest keystroke's response can land.
  useEffect(() => {
    const trimmed = q.trim();
    const timer = setTimeout(() => {
      if (trimmed.length < 2) {
        abortRef.current?.abort();
        setResults(null);
        setLoading(false);
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`, {
        signal: ctrl.signal,
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((j) => {
          if (ctrl.signal.aborted) return;
          setResults(j?.ok ? (j.data as SearchResults) : EMPTY_RESULTS);
          setLoading(false);
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setResults(EMPTY_RESULTS);
          setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  // Escape + click-outside close while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Close whenever the route changes (also covers in-panel link taps).
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  const trimmed = q.trim();
  const panelVisible = open && trimmed.length >= 2;
  const hasResults =
    !!results && (results.orders.length > 0 || results.products.length > 0 || results.customers.length > 0);

  const groups: {
    key: string;
    label: string;
    icon: LucideIcon;
    items: { to: string; title: string; meta: React.ReactNode; badge?: string }[];
  }[] = results
    ? [
        {
          key: "orders",
          label: "Orders",
          icon: ShoppingCart,
          items: results.orders.map((o) => ({
            to: `/admin/orders/${o.id}`,
            title: o.orderNumber,
            meta: (
              <span className="flex items-center gap-1.5">
                <span className="tnum">{formatINR(Number(o.grandTotal) || 0)}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    STATUS_TINT[o.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {o.status}
                </span>
              </span>
            ),
          })),
        },
        {
          key: "products",
          label: "Products",
          icon: Package,
          items: results.products.map((p) => ({
            to: `/admin/products/${p.id}`,
            title: p.name,
            meta: (
              <span className="flex items-center gap-1.5">
                <span className="tnum">{formatINR(Number(p.price) || 0)}</span>
                {!p.isActive && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Inactive
                  </span>
                )}
              </span>
            ),
          })),
        },
        {
          key: "customers",
          label: "Customers",
          icon: Users,
          items: results.customers.map((c) => ({
            to: "/admin/customers",
            title: c.name,
            meta: <span className="truncate">{c.email}</span>,
          })),
        },
      ].filter((g) => g.items.length > 0)
    : [];

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search orders, products, customers…"
          aria-label="Search orders, products and customers"
          className="h-10 w-full rounded-lg border border-border bg-card/70 pl-9 pr-9 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ("");
              setResults(null);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {panelVisible && (
        <div
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/10 [animation:admin-fade-in_.16s_ease-out_both]"
        >
          {loading && !hasResults ? (
            <div className="py-1" aria-hidden>
              <SearchRowSkeleton />
              <SearchRowSkeleton />
              <SearchRowSkeleton />
            </div>
          ) : hasResults && results ? (
            <div className="stellora-scroll max-h-[70vh] overflow-y-auto py-1.5">
              {groups.map((g) => (
                <div key={g.key}>
                  <p className="flex items-center gap-1.5 px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    <g.icon className="h-3 w-3" aria-hidden /> {g.label}
                  </p>
                  {g.items.map((item) => (
                    <Link
                      key={item.to + item.title}
                      href={item.to}
                      className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <g.icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground/90">
                          <Highlight text={item.title} query={trimmed} />
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {item.meta}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{trimmed}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Notifications bell — actionable counts from /api/admin/stats
   ============================================================ */

type StatsPayload = {
  ordersByStatus?: Record<string, number>;
  pendingReviews?: number;
  pendingQuestions?: number;
  lowStock?: unknown[];
};

function NotificationsBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const pendingOrders = Number(stats?.ordersByStatus?.PENDING) || 0;
  const pendingReviews = Number(stats?.pendingReviews) || 0;
  const pendingQuestions = Number(stats?.pendingQuestions) || 0;
  const lowStockCount = Array.isArray(stats?.lowStock) ? stats!.lowStock.length : 0;
  const actionable = pendingOrders + pendingReviews + pendingQuestions + lowStockCount;

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/stats", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) setStats(j.data as StatsPayload);
    } catch {
      // Silent — the bell simply keeps its last known counts.
    }
  }, []);

  // Initial fetch so the badge is populated before the first open…
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(raf);
  }, [load]);

  // …then refreshed on every open.
  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next) void load();
      return next;
    });
  }, [load]);

  // Escape + click-outside close while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Close on route change.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  const rows = [
    {
      to: "/admin/orders?status=PENDING",
      icon: ShoppingCart,
      label: `${pendingOrders} pending order${pendingOrders === 1 ? "" : "s"}`,
      count: pendingOrders,
    },
    {
      to: "/admin/reviews",
      icon: Star,
      label: `${pendingReviews} review${pendingReviews === 1 ? "" : "s"} awaiting approval`,
      count: pendingReviews,
    },
    {
      to: "/admin/questions",
      icon: MessageCircleQuestion,
      label: `${pendingQuestions} question${pendingQuestions === 1 ? "" : "s"} to answer`,
      count: pendingQuestions,
    },
    {
      to: "/admin/inventory",
      icon: AlertTriangle,
      label: `${lowStockCount} variant${lowStockCount === 1 ? "" : "s"} low on stock`,
      count: lowStockCount,
    },
  ].filter((r) => r.count > 0);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Close notifications" : "Open notifications"}
        aria-expanded={open}
        aria-controls="admin-notifications"
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-accent lg:h-9 lg:w-9 ${
          open ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {actionable > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-background lg:right-0.5 lg:top-0.5">
            {actionable > 9 ? "9+" : actionable}
          </span>
        )}
      </button>

      {open && (
        <div
          id="admin-notifications"
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/10 [animation:admin-fade-in_.16s_ease-out_both]"
        >
          <p className="border-b border-border px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Notifications
          </p>
          <div className="stellora-scroll max-h-80 overflow-y-auto py-1.5">
            {rows.length === 0 ? (
              <p className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <span className="text-sm text-muted-foreground">All caught up</span>
              </p>
            ) : (
              rows.map((r) => (
                <Link
                  key={r.to}
                  href={r.to}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      r.icon === AlertTriangle
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <r.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{r.label}</span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary tnum">
                    {r.count}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Professional admin shell:
 * - Unified glass topbar on desktop AND mobile: global search (desktop),
 *   notifications bell, storefront link; hamburger + page title on mobile
 * - Desktop: collapsible sidebar (persisted), gold active indicators, user card + logout
 * - Mobile: the 3-line hamburger opens a slide-in drawer
 *   (backdrop blur, Escape / overlay / route-change close, body scroll lock)
 */
export function AdminShell({
  user,
  children,
}: {
  user: AdminShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Restore desktop sidebar collapse preference.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem("stellora-admin-collapsed");
    } catch {}
    const raf = requestAnimationFrame(() => setCollapsed(stored === "1"));
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem("stellora-admin-collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  }, []);

  // Close the drawer whenever the route changes (covers browser back/forward;
  // in-app link taps are already closed via onNavigate).
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawerOpen(false));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  // Drawer side-effects: body scroll lock + Escape to close.
  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the call fails, bounce to the console root — the server
      // layout will redirect to the storefront login when unauthenticated.
    }
    // Hard navigation is intentional: a full reload clears the RSC cache and
    // lets the server layout bounce to the storefront login when unauthenticated.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional hard navigation across the admin boundary after session teardown
    window.location.assign("/");
  }, [loggingOut]);

  const current = [...NAV_FLAT]
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) =>
      n.href === "/admin" ? pathname === "/admin" : pathname === n.href || pathname.startsWith(`${n.href}/`)
    );

  return (
    <div className="flex min-h-screen bg-muted/25">
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-300 ease-out lg:flex ${
          collapsed ? "w-[76px]" : "w-64"
        }`}
      >
        <div
          className={`flex items-center border-b border-border py-4 ${
            collapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
        >
          <Link href="/admin" aria-label="Admin dashboard">
            <BrandMark collapsed={collapsed} />
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse navigation"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        {collapsed && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand navigation"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
        <NavGroups collapsed={collapsed} pathname={pathname} />
        <UserBlock user={user} collapsed={collapsed} onLogout={logout} loggingOut={loggingOut} />
      </aside>

      {/* ---------------- Main column ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Unified glass topbar — search + bell on desktop, hamburger + title on mobile */}
        <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-background/85 px-3 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open admin menu"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition hover:bg-accent lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              {current?.label ?? "Dashboard"}
            </p>
            <p className="text-[9px] font-medium uppercase leading-tight tracking-[0.28em] text-muted-foreground">
              Stellora Admin
            </p>
          </div>
          <div className="hidden min-w-0 flex-1 lg:flex lg:max-w-md">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <NotificationsBell />
            <a
              href="/"
              aria-label="View storefront"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground lg:h-9 lg:w-9"
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* ---------------- Mobile slide drawer ---------------- */}
      {drawerOpen && (
        <div
          id="admin-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation"
          className="fixed inset-0 z-50 lg:hidden"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="drawer-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="drawer-panel absolute inset-y-0 left-0 flex w-[300px] max-w-[86vw] flex-col border-r border-border bg-card shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <BrandMark />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <NavGroups pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            <UserBlock user={user} onLogout={logout} loggingOut={loggingOut} />
          </aside>
        </div>
      )}
    </div>
  );
}
