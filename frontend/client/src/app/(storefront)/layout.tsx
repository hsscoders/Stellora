import { Header } from "@/components/stellora/header";
import { Footer } from "@/components/stellora/footer";
import { CartDrawer } from "@/components/stellora/cart-drawer";
import { BackToTop } from "@/components/stellora/back-to-top";
import { ScrollProgress } from "@/components/stellora/scroll-progress";
import { WhatsAppButton } from "@/components/stellora/whatsapp-button";
import { RealtimeProvider } from "@/components/stellora/realtime";
import { SupportChat } from "@/components/stellora/support-chat";
import { apiSettings } from "@/lib/server-api";

// Every storefront page renders per-request data (settings, session, products).
export const dynamic = "force-dynamic";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let announcement: string | null = null;
  let sale: { text: string; endsAt: string } | null = null;
  let settings: Record<string, string> = {};
  try {
    const rows = await apiSettings();
    settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    announcement = settings.announcement || null;
    // Flash sale (Admin → Business Settings → Flash sale countdown) takes
    // priority over the plain announcement while it is running.
    const endsAtMs = settings.sale_ends_at ? new Date(settings.sale_ends_at).getTime() : NaN;
    if (settings.sale_text && Number.isFinite(endsAtMs) && endsAtMs > Date.now()) {
      sale = { text: settings.sale_text, endsAt: settings.sale_ends_at };
    }
  } catch {
    // Settings unavailable — render without announcement
  }

  return (
    <RealtimeProvider>
      <ScrollProgress />
      <Header announcement={announcement} sale={sale} />
      <main className="flex-1">{children}</main>
      <Footer settings={settings} />
      <WhatsAppButton phone={settings.whatsapp ?? settings.whatsapp_number ?? null} />
      <SupportChat />
      <CartDrawer />
      <BackToTop />
    </RealtimeProvider>
  );
}
