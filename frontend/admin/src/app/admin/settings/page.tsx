"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentGatewayCard } from "@/components/stellora/payment-gateway-card";

interface Setting {
  key: string;
  value: string;
}

type SettingField = {
  key: string;
  label: string;
  textarea?: boolean;
  placeholder?: string;
  rows?: number;
  /** Render a datetime-local picker; stored as ISO in the DB. */
  datetime?: boolean;
  /** Render a dropdown with these options. */
  select?: { value: string; label: string }[];
  /** Mask the input (API keys) — value is still stored as plain text server-side. */
  secret?: boolean;
};

type SettingGroup = { title: string; fields: SettingField[] };

const GROUPS: SettingGroup[] = [
  {
    title: "Storefront",
    fields: [
      { key: "announcement", label: "Announcement bar (empty to hide)" },
    ],
  },
  {
    title: "Flash sale countdown",
    fields: [
      {
        key: "sale_text",
        label: "Flash sale text (replaces the announcement bar while active)",
        placeholder: "Diwali Sale — up to 25% off, ends tonight!",
      },
      {
        key: "sale_ends_at",
        label: "Flash sale ends at (live countdown shows on the storefront)",
        datetime: true,
      },
    ],
  },
  {
    title: "Contact details",
    fields: [
      { key: "contact_email", label: "Contact email", placeholder: "care@yourstore.com" },
      { key: "contact_phone", label: "Contact phone", placeholder: "+91 …" },
      { key: "address_line1", label: "Store address (line)" },
      { key: "address_city", label: "Store city" },
      { key: "store_hours", label: "Store hours", placeholder: "Mon–Sat, 10 AM – 8 PM" },
    ],
  },
  {
    title: "Social",
    fields: [
      { key: "instagram", label: "Instagram URL" },
      { key: "facebook", label: "Facebook URL" },
      { key: "whatsapp", label: "WhatsApp number" },
    ],
  },
  {
    title: "Notes shown to customers",
    fields: [
      { key: "shipping_note", label: "Shipping note", textarea: true },
      { key: "return_note", label: "Returns note", textarea: true },
    ],
  },
  {
    title: "Policy pages (leave empty to show a \"being finalised\" notice)",
    fields: [
      { key: "policy_shipping", label: "Shipping Policy — full text", textarea: true },
      { key: "policy_returns", label: "Return & Refund Policy — full text", textarea: true },
      { key: "policy_privacy", label: "Privacy Policy — full text", textarea: true },
      { key: "policy_terms", label: "Terms of Service — full text", textarea: true },
    ],
  },
  {
    title: "Billing / POS receipt",
    fields: [
      { key: "pos_receipt_footer", label: "Receipt footer line (shown on POS printed bills)", textarea: true, rows: 3 },
    ],
  },
  {
    title: "Automation (Auto-pilot)",
    fields: [
      {
        key: "automation.staleOrderHours",
        label: "Auto-cancel unconfirmed orders after (hours)",
        placeholder: "24",
      },
    ],
  },
  {
    title: "Delivery partner",
    fields: [
      {
        key: "delivery.enabled",
        label: "Delivery partner tracking",
        select: [
          { value: "true", label: "Enabled (recommended)" },
          { value: "false", label: "Disabled" },
        ],
      },
      {
        key: "delivery.partner",
        label: "Default delivery partner (pre-selected when you mark an order shipped)",
        select: [
          { value: "shiprocket", label: "Shiprocket" },
          { value: "delhivery", label: "Delhivery" },
          { value: "bluedart", label: "Blue Dart" },
          { value: "dtdc", label: "DTDC" },
          { value: "ekart", label: "Ekart Logistics" },
          { value: "xpressbees", label: "XpressBees" },
          { value: "ecom_express", label: "Ecom Express" },
          { value: "india_post", label: "India Post" },
          { value: "custom", label: "Custom / local courier" },
        ],
      },
      {
        key: "delivery.eta_days",
        label: "Estimated delivery days (shown to customers on tracking)",
        placeholder: "4",
      },
      {
        key: "delivery.custom_name",
        label: "Custom courier name (when partner = Custom)",
        placeholder: "e.g. Kichha Fast Couriers",
      },
      {
        key: "delivery.custom_tracking_url",
        label: "Custom courier tracking URL ({awb} = tracking number)",
        placeholder: "https://mycourier.in/track?awb={awb}",
      },
      {
        key: "delivery.api_key",
        label: "Courier API key — optional, for future auto-sync (never shown to customers)",
        placeholder: "paste key from Shiprocket / Delhivery dashboard",
        secret: true,
      },
    ],
  },
  {
    title: "Homepage video",
    fields: [
      {
        key: "hero_video_url",
        label: "Brand film / homepage video URL (mp4 or YouTube link, empty to hide)",
        placeholder: "https://…/brand-film.mp4",
      },
    ],
  },
];

function groupId(index: number): string {
  return `settings-group-${index}`;
}

/** ISO string → value accepted by <input type="datetime-local"> (local time). */
function toLocalInputValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const loaded = settings !== null;

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setSettings(Object.fromEntries(j.data.map((s: Setting) => [s.key, s.value])));
        }
      });
  }, []);

  // Scroll-spy: highlight the section currently in view (state set in observer callback).
  useEffect(() => {
    if (!loaded) return;
    const els = GROUPS.map((_, i) => document.getElementById(groupId(i))).filter(
      (el): el is HTMLElement => el !== null
    );
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveGroup(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loaded]);

  function jumpTo(id: string) {
    setActiveGroup(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const payload: Record<string, string> = {};
    for (const group of GROUPS) {
      for (const f of group.fields) {
        let value = String(form.get(f.key) ?? "");
        if (f.datetime && value) {
          // datetime-local strings are naive — interpret as the admin's local time.
          const d = new Date(value);
          value = Number.isNaN(d.getTime()) ? "" : d.toISOString();
        }
        payload[f.key] = value;
      }
    }
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      toast.success("Settings saved");
    } else {
      toast.error(json.error?.message ?? "Could not save settings");
    }
  }

  if (!settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Payment gateways live outside the generic settings form — they have
          their own dedicated (masked) API and save button. */}
      <div>
        <h1 className="font-serif text-3xl font-medium">Business Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These values are shown to customers. Leave fields empty until the real details are
          confirmed — nothing is invented for you.
        </p>
      </div>

      <PaymentGatewayCard />

      <form onSubmit={save} className="space-y-8">
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        {/* Sticky section nav (desktop) */}
        <aside className="hidden lg:block">
          <nav className="sticky top-8 space-y-1" aria-label="Settings sections">
            <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Sections
            </p>
            {GROUPS.map((g, i) => {
              const id = groupId(i);
              const active = activeGroup === id;
              return (
                <button
                  key={g.title}
                  type="button"
                  onClick={() => jumpTo(id)}
                  aria-current={active ? "true" : undefined}
                  className={`block w-full rounded-md px-3 py-1.5 text-left text-xs leading-snug transition ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {g.title}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Setting groups */}
        <div className="min-w-0 space-y-6">
          {GROUPS.map((g, i) => (
            <Card key={g.title} id={groupId(i)} className="scroll-mt-6">
              <CardHeader>
                <CardTitle className="font-serif text-xl">{g.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <div key={f.key} className={f.textarea ? "sm:col-span-2" : undefined}>
                    <Label htmlFor={f.key}>{f.label}</Label>
                    {f.textarea ? (
                      <Textarea
                        id={f.key}
                        name={f.key}
                        defaultValue={settings[f.key] ?? ""}
                        rows={f.rows ?? 5}
                      />
                    ) : f.datetime ? (
                      <Input
                        id={f.key}
                        name={f.key}
                        type="datetime-local"
                        defaultValue={toLocalInputValue(settings[f.key])}
                      />
                    ) : f.select ? (
                      <select
                        id={f.key}
                        name={f.key}
                        defaultValue={settings[f.key] ?? f.select[0].value}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {f.select.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={f.key}
                        name={f.key}
                        type={f.secret ? "password" : undefined}
                        autoComplete={f.secret ? "off" : undefined}
                        defaultValue={settings[f.key] ?? ""}
                        placeholder={f.placeholder}
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={busy}
              className="rounded-full bg-primary px-8 hover:bg-primary/90"
            >
              {busy ? "Saving…" : "Save all settings"}
            </Button>
          </div>
        </div>
      </div>
      </form>
    </div>
  );
}
