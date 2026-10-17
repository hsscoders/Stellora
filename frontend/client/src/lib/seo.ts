import "server-only";

/**
 * Server-side fetch of the admin-managed SEO configuration (backend GET /api/seo).
 *
 * Deliberately does NOT use the shared server-api helper because that one
 * reads cookies() — which would force every page (including otherwise
 * static ones) into dynamic rendering. SEO config is public and identical
 * for every visitor, so a plain uncached fetch is both correct and safe.
 *
 * Never throws: on any failure the built-in defaults are returned, so the
 * site keeps rendering exact same <head> as before this feature existed.
 */

export interface SeoConfig {
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

/** Mirrors backend SEO_DEFAULTS — used when the backend is unreachable. */
export const SEO_FALLBACK: SeoConfig = {
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

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

export async function fetchSeoConfig(): Promise<SeoConfig> {
  try {
    const res = await fetch(`${BACKEND}/api/seo`, { cache: "no-store" });
    if (!res.ok) return { ...SEO_FALLBACK };
    const body = (await res.json()) as { ok: boolean; data?: Partial<SeoConfig> };
    if (!body.ok || !body.data) return { ...SEO_FALLBACK };
    return { ...SEO_FALLBACK, ...body.data };
  } catch {
    return { ...SEO_FALLBACK };
  }
}

/** canonicalBaseUrl if valid, else the storefront origin env. */
export function resolveSiteUrl(seo: SeoConfig): string {
  const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const raw = seo.canonicalBaseUrl.trim();
  if (!raw) return fallback;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return fallback;
    return u.origin;
  } catch {
    return fallback;
  }
}
