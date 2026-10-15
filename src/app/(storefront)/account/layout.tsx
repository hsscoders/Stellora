import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { UserRound, MapPin, Package, Heart } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Account" };

const NAV = [
  { href: "/account", label: "Overview", icon: Package },
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
];

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="lg:w-60 lg:shrink-0">
          <div className="rounded-lg border border-border/70 bg-card p-5">
            <p className="font-serif text-lg font-medium">{user.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
            <nav className="mt-5 space-y-1 text-sm">
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
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
