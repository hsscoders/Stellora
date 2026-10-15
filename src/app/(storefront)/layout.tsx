import { db } from "@/lib/db";
import { Header } from "@/components/stellora/header";
import { Footer } from "@/components/stellora/footer";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let announcement: string | null = null;
  let settings: Record<string, string> = {};
  try {
    const rows = await db.siteSetting.findMany();
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
