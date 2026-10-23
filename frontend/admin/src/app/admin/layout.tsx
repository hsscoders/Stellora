import { redirect } from "next/navigation";
import { adminMe, storefrontBaseUrl } from "@/lib/server-api";
import { AdminShell } from "@/components/stellora/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await adminMe();
  if (!user) {
    // Admins sign in ONLY at the storefront's /admin/login page — never the
    // storefront customer login. The login page always carries ?next=/admin-console
    // and bounces straight back here on success.
    // NOTE: always redirect to the STOREFRONT origin (the login page lives in the
    // client app) — never the request host, which is the admin origin (:3001)
    // when the console is opened directly and would 404.
    const base = process.env.STOREFRONT_URL || (await storefrontBaseUrl()).replace(/:\d+$/, ":3000");
    redirect(`${base}/admin/login?next=/admin-console`);
  }
  if (user.role !== "ADMIN") {
    const base = process.env.STOREFRONT_URL || (await storefrontBaseUrl()).replace(/:\d+$/, ":3000");
    redirect(`${base}/?denied=admin`);
  }

  return (
    <AdminShell user={{ name: user.name, email: user.email, role: user.role }}>
      {children}
    </AdminShell>
  );
}
