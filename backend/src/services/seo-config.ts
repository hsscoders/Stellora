import { SiteSetting } from "../models";

/**
 * Website-wide SEO configuration.
 *
 * Everything here is managed from the admin panel (Marketing → SEO & Rankings)
 * and stored as ONE JSON document under the SiteSetting key "seo.config".
 * Unlike payment.* keys, SEO settings are meant to be PUBLIC — they are
 * rendered into <head> meta tags, robots.txt and JSON-LD structured data.
 *
 * The storefront reads these via GET /api/seo and falls back to the defaults
 * below whenever the setting is missing or unparseable, so a fresh install
 * keeps ranking exactly as before the admin touches anything.
 */

export const SEO_SETTING_KEY = "seo.config";

export interface SeoConfig {
  /* ---------- General ---------- */
  siteName: string;
  defaultTitle: string; // <title> of the home page — the main ranking line
  titleTemplate: string; // e.g. "%s · Stellora" (applied to inner pages)
  metaDescription: string;
  keywords: string[]; // global + local city keywords ("best jewellery shop in kichha", …)

  /* ---------- Local business (Google Business profile style) ---------- */
  businessName: string;
  businessType: string; // "Jewellery Store", "Boutique", …
  streetAddress: string;
  city: string;
  region: string; // state / province
  postalCode: string;
  country: string; // ISO code, e.g. "IN"
  phone: string;
  geoLat: string;
  geoLng: string;
  openingHours: string; // schema.org style, e.g. "Mo-Sa 10:00-20:00"
  priceRange: string; // e.g. "₹₹"
  citiesServed: string[]; // areaServed in LocalBusiness schema

  /* ---------- Social sharing ---------- */
  ogTitle: string;
  ogDescription: string;
  ogImage: string; // path (served by the storefront) or absolute URL
  twitterHandle: string;

  /* ---------- Search console & analytics ---------- */
  googleSiteVerification: string;
  bingSiteVerification: string;
  gaMeasurementId: string; // GA4 "G-XXXXXXX"

  /* ---------- Technical ---------- */
  canonicalBaseUrl: string; // e.g. https://yourdomain.com (empty = storefront origin)
  robotsIndex: boolean; // false => noindex the whole site
  robotsFollow: boolean;
  schemaEnabled: boolean; // emit LocalBusiness JSON-LD
}

export const SEO_DEFAULTS: SeoConfig = {
  siteName: "Stellora",
  defaultTitle:
    "Stellora — Sterling & Artificial Jewellery, Hair Extensions, Vanity & Handbags",
  titleTemplate: "%s · Stellora",
  metaDescription:
    "Stellora is a premium retail destination for sterling and artificial jewellery, hair extensions, vanity essentials and handbags — curated with care, delivered across India.",
  keywords: [
    "sterling silver jewellery",
    "artificial jewellery",
    "premium jewellery India",
    "hair extensions",
    "vanity essentials",
    "designer handbags",
    "Stellora",
  ],

  businessName: "Stellora",
  businessType: "Jewellery Store",
  streetAddress: "",
  city: "",
  region: "",
  postalCode: "",
  country: "IN",
  phone: "",
  geoLat: "",
  geoLng: "",
  openingHours: "",
  priceRange: "₹₹",
  citiesServed: [],

  ogTitle: "Stellora — Premium Jewellery, Hair Extensions, Vanity & Handbags",
  ogDescription:
    "Curated sterling and artificial jewellery, hair extensions, vanity essentials and handbags. Quiet luxury, every day.",
  ogImage: "/images/banners/category-jewellery.jpg",
  twitterHandle: "",

  googleSiteVerification: "",
  bingSiteVerification: "",
  gaMeasurementId: "",

  canonicalBaseUrl: "",
  robotsIndex: true,
  robotsFollow: true,
  schemaEnabled: true,
};

const MAX_KEYWORDS = 60;
const MAX_CITIES = 40;
const MAX_STR = 400;

/** Clean one keyword/city chip: trim, collapse spaces, cap length, drop empties. */
function cleanChip(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function cleanList(v: unknown, max: number): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : [];
  const out: string[] = [];
  for (const item of raw) {
    const c = cleanChip(item);
    if (!c) continue;
    if (out.some((x) => x.toLowerCase() === c.toLowerCase())) continue; // dedupe (case-insensitive)
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

function cleanStr(v: unknown, max = MAX_STR): string {
  return String(v ?? "").trim().slice(0, max);
}

/** Normalize any incoming partial config into a full, safe SeoConfig. */
export function normalizeSeoConfig(input: unknown): SeoConfig {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  return {
    siteName: cleanStr(raw.siteName, 80) || SEO_DEFAULTS.siteName,
    defaultTitle: cleanStr(raw.defaultTitle, 200) || SEO_DEFAULTS.defaultTitle,
    titleTemplate: cleanStr(raw.titleTemplate, 100) || SEO_DEFAULTS.titleTemplate,
    metaDescription: cleanStr(raw.metaDescription, 400) || SEO_DEFAULTS.metaDescription,
    keywords: cleanList(raw.keywords, MAX_KEYWORDS).length
      ? cleanList(raw.keywords, MAX_KEYWORDS)
      : SEO_DEFAULTS.keywords,

    businessName: cleanStr(raw.businessName, 120) || SEO_DEFAULTS.businessName,
    businessType: cleanStr(raw.businessType, 80) || SEO_DEFAULTS.businessType,
    streetAddress: cleanStr(raw.streetAddress, 200),
    city: cleanStr(raw.city, 80),
    region: cleanStr(raw.region, 80),
    postalCode: cleanStr(raw.postalCode, 20),
    country: cleanStr(raw.country, 4) || SEO_DEFAULTS.country,
    phone: cleanStr(raw.phone, 30),
    geoLat: cleanStr(raw.geoLat, 24),
    geoLng: cleanStr(raw.geoLng, 24),
    openingHours: cleanStr(raw.openingHours, 120),
    priceRange: cleanStr(raw.priceRange, 10) || SEO_DEFAULTS.priceRange,
    citiesServed: cleanList(raw.citiesServed, MAX_CITIES),

    ogTitle: cleanStr(raw.ogTitle, 200) || SEO_DEFAULTS.ogTitle,
    ogDescription: cleanStr(raw.ogDescription, 400) || SEO_DEFAULTS.ogDescription,
    ogImage: cleanStr(raw.ogImage, 300) || SEO_DEFAULTS.ogImage,
    twitterHandle: cleanStr(raw.twitterHandle, 40),

    googleSiteVerification: cleanStr(raw.googleSiteVerification, 200),
    bingSiteVerification: cleanStr(raw.bingSiteVerification, 200),
    gaMeasurementId: cleanStr(raw.gaMeasurementId, 40),

    canonicalBaseUrl: cleanStr(raw.canonicalBaseUrl, 200),
    robotsIndex: raw.robotsIndex === undefined ? SEO_DEFAULTS.robotsIndex : !!raw.robotsIndex,
    robotsFollow: raw.robotsFollow === undefined ? SEO_DEFAULTS.robotsFollow : !!raw.robotsFollow,
    schemaEnabled:
      raw.schemaEnabled === undefined ? SEO_DEFAULTS.schemaEnabled : !!raw.schemaEnabled,
  };
}

/** Read the SEO config (DB → defaults). Never throws. */
export async function getSeoConfig(): Promise<SeoConfig> {
  try {
    const row = await SiteSetting.findOne({ key: SEO_SETTING_KEY }).lean<{ value: string } | null>();
    if (!row?.value) return { ...SEO_DEFAULTS };
    return normalizeSeoConfig(JSON.parse(row.value));
  } catch {
    return { ...SEO_DEFAULTS };
  }
}

/** Persist a (partial) config on top of the current one. Returns the saved doc. */
export async function saveSeoConfig(partial: unknown): Promise<SeoConfig> {
  const current = await getSeoConfig();
  const merged = normalizeSeoConfig({ ...current, ...(typeof partial === "object" && partial !== null ? partial : {}) });
  await SiteSetting.updateOne(
    { key: SEO_SETTING_KEY },
    { value: JSON.stringify(merged) },
    { upsert: true }
  );
  return merged;
}
