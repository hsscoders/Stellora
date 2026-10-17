import { Header } from "@/components/stellora/header";
import { Footer } from "@/components/stellora/footer";
import { CartDrawer } from "@/components/stellora/cart-drawer";
import { BackToTop } from "@/components/stellora/back-to-top";
import { ScrollProgress } from "@/components/stellora/scroll-progress";
import { WhatsAppButton } from "@/components/stellora/whatsapp-button";
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
      <ScrollProgress />
      <Header announcement={announcement} />
      <main className="flex-1">{children}</main>
      <Footer settings={settings} />
      <WhatsAppButton phone={settings.whatsapp_number ?? null} />
      <CartDrawer />
      <BackToTop />
    </>
  );
}
