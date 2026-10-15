"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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

const GROUPS: { title: string; fields: { key: string; label: string; textarea?: boolean; placeholder?: string }[] }[] = [
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
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setSettings(Object.fromEntries(j.data.map((s: Setting) => [s.key, s.value])));
        }
      });
  }, []);

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
    <form onSubmit={save} className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-medium">Business Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These values are shown to customers. Leave fields empty until the real details are
          confirmed — nothing is invented for you.
        </p>
      </div>

      {GROUPS.map((g) => (
        <Card key={g.title}>
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
                    rows={5}
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

      <Button type="submit" disabled={busy} className="rounded-full bg-primary px-8 hover:bg-primary/90">
        {busy ? "Saving…" : "Save all settings"}
      </Button>
    </form>
  );
}
