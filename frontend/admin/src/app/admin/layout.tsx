import { redirect } from "next/navigation";
import { adminMe, storefrontBaseUrl } from "@/lib/server-api";
import { AdminShell } from "@/components/stellora/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await adminMe();
  if (!user) {
    // Admins sign in ONLY at the dedicated /admin/login page — never the
    // storefront customer login. The login page always carries
    // ?next=/admin-console and bounces straight back here on success.
    const base = await storefrontBaseUrl();
    redirect(`${base}/admin/login?next=/admin-console`);
  }
  if (user.role !== "ADMIN") {
    const base = await storefrontBaseUrl();
    redirect(`${base}/?denied=admin`);
  }

  return (
    <AdminShell user={{ name: user.name, email: user.email, role: user.role }}>
      {children}
    </AdminShell>
  );
}
