import type { MetadataRoute } from "next";
import { fetchSeoConfig, resolveSiteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * robots.txt — honours the admin panel's index/follow switches
 * (Admin → Marketing → SEO & Rankings). "noindex site" fully blocks crawlers.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await fetchSeoConfig();
  const siteUrl = resolveSiteUrl(seo);

  if (!seo.robotsIndex) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin-console", "/account", "/checkout", "/api/", "/login", "/register"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
