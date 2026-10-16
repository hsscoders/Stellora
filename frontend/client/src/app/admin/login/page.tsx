import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, BarChart3, ScanBarcode, Layers, ArrowLeft } from "lucide-react";
import { AuthForm } from "@/components/stellora/auth-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Master Control — Sign in | Stellora",
  robots: { index: false, follow: false },
};

/**
 * Dedicated admin login at /admin/login. Always carries ?next=/admin-console so
 * AuthForm performs its cross-app hard navigation straight into the console.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "";
  if (!next.startsWith("/admin-console")) {
    redirect("/admin/login?next=/admin-console");
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background:radial-gradient(60%_50%_at_20%_10%,rgba(255,255,255,0.35),transparent),radial-gradient(45%_40%_at_85%_85%,rgba(212,175,55,0.45),transparent)]" />
        <div className="relative p-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-primary-foreground/70 transition hover:text-primary-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to storefront
          </Link>
        </div>
        <div className="relative px-10 pb-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/25 backdrop-blur">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-6 font-serif text-4xl font-medium leading-tight">
            Stellora
            <br />
            Master Control
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-primary-foreground/80">
            One panel to run the entire store — catalogue, counter billing, stock,
            orders, customers and analytics. Access is restricted and every action
            is audit-logged.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-primary-foreground/85">
            {[
              { icon: ScanBarcode, text: "Point-of-Sale counter billing with printable receipts" },
              { icon: Layers, text: "Live stock management, low-stock alerts & movement history" },
              { icon: BarChart3, text: "Revenue analytics — online & in-store side by side" },
            ].map((f) => (
              <li key={f.text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
                  <f.icon className="h-3.5 w-3.5" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative px-10 text-[10px] uppercase tracking-[0.3em] text-primary-foreground/50">
          Stellora · Premium Finds
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Storefront
            </Link>
          </div>
          <div className="mb-8 text-center">
            <span className="eyebrow-row text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
              Restricted area
            </span>
            <h2 className="mt-3 font-serif text-3xl font-medium">Admin sign in</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Authorised store operators only. Sessions expire automatically.
            </p>
            <div className="mx-auto mt-4 h-px w-16 gold-line" />
          </div>
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
            <AuthForm mode="login" />
          </Suspense>
          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Protected by rate limiting &amp; full audit logging
          </p>
        </div>
      </main>
    </div>
  );
}
