import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  LayoutDashboard,
  Package,
  Tags,
  Layers,
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
} from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/categories", label: "Categories", icon: Tags },
  { href: "/admin/inventory", label: "Inventory", icon: Layers },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/banners", label: "Banners", icon: ImageIcon },
  { href: "/admin/shipping", label: "Shipping", icon: Truck },
  { href: "/admin/messages", label: "Messages", icon: Mail },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/users", label: "Admin Users", icon: ShieldCheck },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/?denied=admin");

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="border-b border-border px-5 py-5">
          <Link href="/" className="font-serif text-lg font-semibold tracking-[0.18em]">
            STELLORA
          </Link>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Admin Panel
          </p>
        </div>
        <nav className="stellora-scroll flex-1 space-y-0.5 overflow-y-auto p-3 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
          >
            View storefront <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {/* Mobile admin nav */}
        <div className="stellora-scroll flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 text-xs lg:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-muted-foreground"
            >
              <n.icon className="h-3.5 w-3.5" /> {n.label}
            </Link>
          ))}
        </div>
        <div className="p-4 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
