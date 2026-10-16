import { Header } from "@/components/stellora/header";
import { Footer } from "@/components/stellora/footer";
import { apiSettings } from "@/lib/server-api";

// Every storefront page renders per-request data (settings, session, products).
export const dynamic = "force-dynamic";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let announcement: string | null = null;
  let settings: Record<string, string> = {};
  try {
    const rows = await apiSettings();
    settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    announcement = settings.announcement || null;
  } catch {
    // Settings unavailable — render without announcement
  }

  return (
    <>
      <Header announcement={announcement} />
      <main className="flex-1">{children}</main>
      <Footer settings={settings} />
    </>
  );
}
