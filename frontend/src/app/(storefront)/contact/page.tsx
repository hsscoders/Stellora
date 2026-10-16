import { apiSettings } from "@/lib/server-api";
import { ContactForm } from "@/components/stellora/contact-form";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact Us" };

export default async function ContactPage() {
  const rows = await apiSettings();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const details = [
    { icon: Mail, label: "Email", value: s.contact_email },
    { icon: Phone, label: "Phone", value: s.contact_phone },
    {
      icon: MapPin,
      label: "Store",
      value: [s.address_line1, s.address_city].filter(Boolean).join(", ") || undefined,
    },
    { icon: Clock, label: "Store hours", value: s.store_hours },
  ].filter((d) => d.value);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <h1 className="font-serif text-4xl font-medium">Contact Us</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Questions about an order, a product, or anything at all — we are listening.
        </p>
        <div className="mx-auto mt-5 h-px w-24 gold-line" />
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border/70 bg-card p-6 sm:p-8">
          <h2 className="font-serif text-xl font-medium">Send a message</h2>
          <div className="mt-5">
            <ContactForm />
          </div>
        </div>
        <aside className="space-y-4">
          {details.length > 0 ? (
            details.map((d) => (
              <div key={d.label} className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-4">
                <d.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-medium">{d.label}</p>
                  <p className="mt-0.5 break-words text-muted-foreground">{d.value}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Contact details coming soon</p>
              <p className="mt-1.5 leading-relaxed">
                The store is finalising its published contact information. In the meantime, send us
                a message here and it will reach the team directly.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
