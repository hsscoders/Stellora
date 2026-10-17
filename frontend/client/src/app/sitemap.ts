import type { MetadataRoute } from "next";
import { apiProducts, apiCategories } from "@/lib/server-api";
import { fetchSeoConfig, resolveSiteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

type SitemapEntry = MetadataRoute.Sitemap[number];

function productEntries(slugs: string[], siteUrl: string): SitemapEntry[] {
  return slugs.map((slug) => ({
    url: `${siteUrl}/product/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Canonical origin comes from the admin panel's SEO settings when set.
  const seo = await fetchSeoConfig();
  const SITE_URL = resolveSiteUrl(seo);

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/shop",
    "/about",
    "/contact",
    "/faq",
    "/support",
    "/track-order",
    "/policies/shipping",
    "/policies/returns",
    "/policies/privacy",
    "/policies/terms",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" || path === "/shop" ? ("daily" as const) : ("monthly" as const),
    priority: path === "" ? 1 : path === "/shop" ? 0.9 : 0.5,
  }));

  try {
    const [categories, firstPage] = await Promise.all([
      apiCategories().catch(() => []),
      apiProducts({ page: 1 }).catch(() => null),
    ]);

    const categoryUrls: MetadataRoute.Sitemap = categories.map((c) => ({
      url: `${SITE_URL}/category/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    if (!firstPage) return [...staticRoutes, ...categoryUrls];

    let productUrls = productEntries(firstPage.products.map((p) => p.slug), SITE_URL);

    // Walk remaining pages (capped) so the sitemap covers the catalogue.
    const totalPages = Math.min(Number(firstPage.pages ?? 1), 10);
    for (let page = 2; page <= totalPages; page++) {
      const res = await apiProducts({ page }).catch(() => null);
      if (!res) break;
      productUrls = productUrls.concat(productEntries(res.products.map((p) => p.slug), SITE_URL));
    }

    return [...staticRoutes, ...categoryUrls, ...productUrls];
  } catch {
    return staticRoutes;
  }
}
