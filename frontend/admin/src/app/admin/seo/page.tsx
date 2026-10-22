"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { SectionCard } from "@/components/stellora/advanced/widgets";
import { Sparkles, X, Search, Globe, MapPin, Share2, ShieldCheck, Settings2 } from "lucide-react";

/* ---------- Types (mirror backend SeoConfig) ---------- */

interface SeoConfig {
  siteName: string;
  defaultTitle: string;
  titleTemplate: string;
  metaDescription: string;
  keywords: string[];

  businessName: string;
  businessType: string;
  streetAddress: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  geoLat: string;
  geoLng: string;
  openingHours: string;
  priceRange: string;
  citiesServed: string[];

  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterHandle: string;

  googleSiteVerification: string;
  bingSiteVerification: string;
  gaMeasurementId: string;

  canonicalBaseUrl: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  schemaEnabled: boolean;
}

/* ---------- Chip list (keywords / cities) ---------- */

function ChipList({
  values,
  onChange,
  placeholder,
  ariaLabel,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const v = raw.replace(/\s+/g, " ").trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  }

  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="max-w-full gap-1 py-1 pr-1 text-xs">
            <span className="truncate">{v}</span>
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="h-8 min-w-[160px] flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">Type and press Enter (or comma) to add.</p>
    </div>
  );
}

/* ---------- Field helper ---------- */

function Field({
  id,
  label,
  hint,
  children,
  wide,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ---------- Page ---------- */

export default function AdminSeoPage() {
  const [seo, setSeo] = useState<SeoConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/seo")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setSeo(j.data);
        else toast.error(j.error?.message ?? "Could not load SEO settings");
      })
      .catch(() => toast.error("Could not load SEO settings"));
  }, []);

  const set = <K extends keyof SeoConfig>(key: K, value: SeoConfig[K]) =>
    setSeo((s) => (s ? { ...s, [key]: value } : s));

  /* ---- live Google preview ---- */
  const previewUrl = useMemo(() => {
    const raw = seo?.canonicalBaseUrl?.trim();
    if (raw) {
      try {
        return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname;
      } catch {
        /* fall through */
      }
    }
    return typeof window === "undefined" ? "yourstore.com" : window.location.host;
  }, [seo?.canonicalBaseUrl]);

  const titleLen = seo?.defaultTitle?.length ?? 0;
  const descLen = seo?.metaDescription?.length ?? 0;

  /* ---- one-click local keyword generator ---- */
  function generateLocalKeywords() {
    if (!seo) return;
    const cities = seo.citiesServed.map((c) => c.trim()).filter(Boolean);
    if (cities.length === 0) {
      toast.error("Add target cities first (Local business → Cities served)");
      return;
    }
    setGenBusy(true);
    const type = (seo.businessType || "Jewellery Store").toLowerCase();
    const brand = (seo.businessName || seo.siteName).toLowerCase();
    const isJewellery = /jewel/i.test(type);
    const patterns: ((c: string) => string)[] = [
      (c) => `best ${type} in ${c}`,
      (c) => `${type} in ${c}`,
      (c) => `top ${type} ${c}`,
      (c) => `${type} near me in ${c}`,
      (c) => `online ${type} ${c}`,
      (c) => `${brand} ${c}`,
    ];
    if (isJewellery) {
      patterns.push(
        (c) => `artificial jewellery ${c}`,
        (c) => `silver jewellery ${c}`,
        (c) => `jewellery shop ${c} price`
      );
    }
    const generated = new Set<string>();
    for (const c of cities) for (const p of patterns) generated.add(p(c));
    const existing = new Set(seo.keywords.map((k) => k.toLowerCase()));
    const additions = [...generated].filter((k) => !existing.has(k.toLowerCase()));
    if (additions.length === 0) {
      toast.info("All suggested keywords are already in the list");
    } else {
      set("keywords", [...seo.keywords, ...additions].slice(0, 60));
      toast.success(`${additions.length} local keywords added — review and save`);
    }
    setGenBusy(false);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!seo) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/seo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seo),
      });
      const json = await res.json();
      if (json.ok) {
        setSeo(json.data);
        toast.success("SEO settings saved — live on the website immediately");
      } else {
        toast.error(json.error?.message ?? "Could not save SEO settings");
      }
    } catch {
      toast.error("Could not save SEO settings");
    }
    setBusy(false);
  }

  if (!seo) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <PageHeader
        icon={Search}
        title="SEO & Rankings"
        subtitle="Full control of how the website appears on Google — titles, descriptions, city keywords, business details and search-engine verification. Changes go live immediately after saving."
      />

      {/* ---------- Google preview ---------- */}
      <SectionCard title="Google search preview" icon={Search}>
          <div className="mx-auto max-w-2xl rounded-xl bg-white p-4 shadow-sm dark:bg-muted/40">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                {seo.siteName.slice(0, 1)}
              </span>
              <span className="truncate">{previewUrl}</span>
            </div>
            <p className="mt-1 truncate text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
              {seo.defaultTitle || "—"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-[#4d5156] dark:text-[#bdc1c6]">
              {seo.metaDescription || "—"}
            </p>
          </div>
          <div className="mx-auto mt-3 flex max-w-2xl flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className={titleLen > 65 ? "text-amber-600 dark:text-amber-400" : ""}>
              Title: {titleLen}/65 chars {titleLen > 65 ? "— may get cut on Google" : ""}
            </span>
            <span className={descLen > 165 ? "text-amber-600 dark:text-amber-400" : ""}>
              Description: {descLen}/165 chars {descLen > 165 ? "— may get cut" : ""}
            </span>
          </div>
      </SectionCard>

      {/* ---------- General meta ---------- */}
      <SectionCard title="Site title & description" icon={Globe} bodyClassName="grid gap-4 sm:grid-cols-2">
          <Field id="siteName" label="Site name" hint="Used across tags and structured data">
            <Input id="siteName" value={seo.siteName} onChange={(e) => set("siteName", e.target.value)} maxLength={80} />
          </Field>
          <Field
            id="titleTemplate"
            label="Inner-page title template"
            hint='Use %s for the page name, e.g. "%s · Stellora"'
          >
            <Input id="titleTemplate" value={seo.titleTemplate} onChange={(e) => set("titleTemplate", e.target.value)} maxLength={100} />
          </Field>
          <Field
            id="defaultTitle"
            label="Home page title (most important ranking line)"
            wide
            hint="Put your main search phrase here — e.g. “Stellora — Best Jewellery Shop in Kichha | Artificial & Silver Jewellery”"
          >
            <Input id="defaultTitle" value={seo.defaultTitle} onChange={(e) => set("defaultTitle", e.target.value)} maxLength={200} />
          </Field>
          <Field id="metaDescription" label="Home page meta description" wide hint="Shown under the title on Google — write it like an ad for your shop">
            <Textarea id="metaDescription" value={seo.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} rows={3} maxLength={400} />
          </Field>
          <Field
            id="keywords"
            label="SEO keywords"
            wide
            hint="City + product phrases people search for. Use the generator below to build these automatically."
          >
            <ChipList values={seo.keywords} onChange={(v) => set("keywords", v)} placeholder="e.g. best jewellery shop in kichha" ariaLabel="Add keyword" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={generateLocalKeywords} disabled={genBusy} className="min-h-11">
              <Sparkles className="h-4 w-4" aria-hidden />
              Generate local keywords from cities
            </Button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Builds phrases like “best jewellery shop in Kichha”, “artificial jewellery Haldwani” for every city you list below.
            </p>
          </div>
      </SectionCard>

      {/* ---------- Local business ---------- */}
      <SectionCard title="Local business (Google Business style)" icon={MapPin} bodyClassName="grid gap-4 sm:grid-cols-2">
          <Field id="businessName" label="Business name">
            <Input id="businessName" value={seo.businessName} onChange={(e) => set("businessName", e.target.value)} maxLength={120} />
          </Field>
          <Field id="businessType" label="Business type" hint='e.g. "Jewellery Store"'>
            <Input id="businessType" value={seo.businessType} onChange={(e) => set("businessType", e.target.value)} maxLength={80} />
          </Field>
          <Field id="streetAddress" label="Street address" wide>
            <Input id="streetAddress" value={seo.streetAddress} onChange={(e) => set("streetAddress", e.target.value)} maxLength={200} placeholder="Shop no, road / landmark" />
          </Field>
          <Field id="city" label="City (main)">
            <Input id="city" value={seo.city} onChange={(e) => set("city", e.target.value)} maxLength={80} placeholder="Kichha" />
          </Field>
          <Field id="region" label="State / region">
            <Input id="region" value={seo.region} onChange={(e) => set("region", e.target.value)} maxLength={80} placeholder="Uttarakhand" />
          </Field>
          <Field id="postalCode" label="PIN code">
            <Input id="postalCode" value={seo.postalCode} onChange={(e) => set("postalCode", e.target.value)} maxLength={20} />
          </Field>
          <Field id="phone" label="Business phone" hint="Shown in Google's business panel structured data">
            <Input id="phone" value={seo.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} placeholder="+91 …" />
          </Field>
          <Field id="geoLat" label="Latitude" hint="From Google Maps → right-click the shop → coordinates">
            <Input id="geoLat" value={seo.geoLat} onChange={(e) => set("geoLat", e.target.value)} maxLength={24} placeholder="28.9216" />
          </Field>
          <Field id="geoLng" label="Longitude">
            <Input id="geoLng" value={seo.geoLng} onChange={(e) => set("geoLng", e.target.value)} maxLength={24} placeholder="79.5150" />
          </Field>
          <Field id="openingHours" label="Opening hours" hint='Schema format, e.g. "Mo-Sa 10:00-20:00"'>
            <Input id="openingHours" value={seo.openingHours} onChange={(e) => set("openingHours", e.target.value)} maxLength={120} />
          </Field>
          <Field id="priceRange" label="Price range">
            <Input id="priceRange" value={seo.priceRange} onChange={(e) => set("priceRange", e.target.value)} maxLength={10} placeholder="₹₹" />
          </Field>
          <Field id="citiesServed" label="Cities / areas served" wide hint="These power “near <city>” ranking signals and the keyword generator">
            <ChipList values={seo.citiesServed} onChange={(v) => set("citiesServed", v)} placeholder="e.g. Rudarpur — press Enter" ariaLabel="Add city" />
          </Field>
      </SectionCard>

      {/* ---------- Social sharing ---------- */}
      <SectionCard title="Social sharing (WhatsApp / Facebook / Instagram previews)" icon={Share2} bodyClassName="grid gap-4 sm:grid-cols-2">
          <Field id="ogTitle" label="Share title" wide>
            <Input id="ogTitle" value={seo.ogTitle} onChange={(e) => set("ogTitle", e.target.value)} maxLength={200} />
          </Field>
          <Field id="ogDescription" label="Share description" wide>
            <Textarea id="ogDescription" value={seo.ogDescription} onChange={(e) => set("ogDescription", e.target.value)} rows={2} maxLength={400} />
          </Field>
          <Field id="ogImage" label="Share image" hint="Path like /images/banners/category-jewellery.jpg or a full https URL (1200×630 works best)">
            <Input id="ogImage" value={seo.ogImage} onChange={(e) => set("ogImage", e.target.value)} maxLength={300} />
          </Field>
          <Field id="twitterHandle" label="X / Twitter handle" hint="Optional, with @">
            <Input id="twitterHandle" value={seo.twitterHandle} onChange={(e) => set("twitterHandle", e.target.value)} maxLength={40} placeholder="@yourstore" />
          </Field>
      </SectionCard>

      {/* ---------- Verification & analytics ---------- */}
      <SectionCard title="Search console & analytics" icon={ShieldCheck} bodyClassName="grid gap-4 sm:grid-cols-2">
          <Field
            id="googleSiteVerification"
            label="Google Search Console verification"
            wide
            hint="Search Console → verify via HTML tag → paste only the code from content=“…” — this is how you submit your sitemap to Google"
          >
            <Input id="googleSiteVerification" value={seo.googleSiteVerification} onChange={(e) => set("googleSiteVerification", e.target.value)} maxLength={200} />
          </Field>
          <Field id="bingSiteVerification" label="Bing Webmaster verification" wide>
            <Input id="bingSiteVerification" value={seo.bingSiteVerification} onChange={(e) => set("bingSiteVerification", e.target.value)} maxLength={200} />
          </Field>
          <Field id="gaMeasurementId" label="Google Analytics 4 ID" wide hint='Starts with "G-" — tracks visitors and the searches that bring them'>
            <Input id="gaMeasurementId" value={seo.gaMeasurementId} onChange={(e) => set("gaMeasurementId", e.target.value)} maxLength={40} placeholder="G-XXXXXXXXXX" />
          </Field>
      </SectionCard>

      {/* ---------- Technical ---------- */}
      <SectionCard title="Technical SEO" icon={Settings2} bodyClassName="space-y-5">
          <Field
            id="canonicalBaseUrl"
            label="Canonical site URL"
            wide
            hint="Your real domain, e.g. https://www.stellora.in — used in sitemap, robots.txt and share links. Leave empty to use this server's address."
          >
            <Input id="canonicalBaseUrl" value={seo.canonicalBaseUrl} onChange={(e) => set("canonicalBaseUrl", e.target.value)} maxLength={200} placeholder="https://www.yourdomain.com" />
          </Field>
          <Separator />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="robotsIndex" className="text-sm">Allow Google to index</Label>
                <p className="text-[11px] text-muted-foreground">Turn OFF only while the site should be hidden</p>
              </div>
              <Switch id="robotsIndex" checked={seo.robotsIndex} onCheckedChange={(v) => set("robotsIndex", v)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="robotsFollow" className="text-sm">Follow links</Label>
                <p className="text-[11px] text-muted-foreground">Lets Google follow links between pages</p>
              </div>
              <Switch id="robotsFollow" checked={seo.robotsFollow} onCheckedChange={(v) => set("robotsFollow", v)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="schemaEnabled" className="text-sm">Local business data</Label>
                <p className="text-[11px] text-muted-foreground">Address, geo &amp; hours in Google's rich results</p>
              </div>
              <Switch id="schemaEnabled" checked={seo.schemaEnabled} onCheckedChange={(v) => set("schemaEnabled", v)} />
            </div>
          </div>
      </SectionCard>

      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-6">
        <Button type="submit" disabled={busy} size="lg" className="min-h-12 shadow-lg">
          {busy ? "Saving…" : "Save SEO settings"}
        </Button>
      </div>
    </form>
  );
}
