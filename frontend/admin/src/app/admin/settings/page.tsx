"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
        payload[f.key] = String(form.get(f.key) ?? "");
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
    <form onSubmit={save} className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-medium">Business Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These values are shown to customers. Leave fields empty until the real details are
          confirmed — nothing is invented for you.
        </p>
      </div>

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
                    ) : (
                      <Input
                        id={f.key}
                        name={f.key}
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
  );
}
