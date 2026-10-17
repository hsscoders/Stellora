import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Playfair_Display, Manrope } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { fetchSeoConfig, resolveSiteUrl, type SeoConfig } from "@/lib/seo";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Website-wide <head> metadata — fully controlled from the admin panel
 * (Admin → Marketing → SEO & Rankings, stored via backend GET/PUT /api/seo).
 * Falls back to the original hardcoded values when the backend is down or
 * the admin has not customised anything, so nothing can break rendering.
 */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await fetchSeoConfig();
  const siteUrl = resolveSiteUrl(seo);

  const geoOther: Record<string, string> = {};
  if (seo.city) geoOther["geo.placename"] = seo.city;
  if (seo.geoLat && seo.geoLng) {
    geoOther["geo.position"] = `${seo.geoLat};${seo.geoLng}`;
    geoOther["ICBM"] = `${seo.geoLat}, ${seo.geoLng}`;
  }

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: seo.defaultTitle,
      template: seo.titleTemplate.includes("%s") ? seo.titleTemplate : `%s · ${seo.siteName}`,
    },
    description: seo.metaDescription,
    keywords: seo.keywords,
    applicationName: seo.siteName,
    authors: [{ name: seo.siteName }],
    creator: seo.siteName,
    publisher: seo.siteName,
    formatDetection: { telephone: false, email: false, address: false },
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: seo.siteName,
      locale: "en_IN",
      url: siteUrl,
      title: seo.ogTitle || seo.defaultTitle,
      description: seo.ogDescription || seo.metaDescription,
      images: [
        {
          url: seo.ogImage || "/images/banners/category-jewellery.jpg",
          width: 1200,
          height: 630,
          alt: `${seo.siteName} collection`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle || seo.defaultTitle,
      description: seo.ogDescription || seo.metaDescription,
      images: [seo.ogImage || "/images/banners/category-jewellery.jpg"],
      ...(seo.twitterHandle ? { site: seo.twitterHandle } : {}),
    },
    robots: {
      index: seo.robotsIndex,
      follow: seo.robotsFollow,
      googleBot: {
        index: seo.robotsIndex,
        follow: seo.robotsFollow,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    ...(seo.googleSiteVerification || seo.bingSiteVerification
      ? {
          verification: {
            ...(seo.googleSiteVerification ? { google: seo.googleSiteVerification } : {}),
            ...(seo.bingSiteVerification ? { other: { "msvalidate.01": seo.bingSiteVerification } } : {}),
          },
        }
      : {}),
    ...(Object.keys(geoOther).length ? { other: geoOther } : {}),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#801d3f" },
    { media: "(prefers-color-scheme: dark)", color: "#120a0d" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Organization + WebSite + LocalBusiness structured data for rich results.
 * The LocalBusiness node (address, geo, opening hours, cities served) is what
 * helps Google connect the shop with "best jewellery shop in <city>" searches.
 */
function buildJsonLd(seo: SeoConfig, siteUrl: string) {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: seo.siteName,
      url: siteUrl,
      description: seo.metaDescription,
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: seo.siteName,
      publisher: { "@id": `${siteUrl}/#organization` },
      inLanguage: "en-IN",
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];

  if (seo.schemaEnabled) {
    const isJewellery = /jewel/i.test(seo.businessType);
    const business: Record<string, unknown> = {
      "@type": isJewellery ? "JewelryStore" : "LocalBusiness",
      "@id": `${siteUrl}/#localbusiness`,
      name: seo.businessName || seo.siteName,
      url: siteUrl,
      image: `${siteUrl}${seo.ogImage}`,
      priceRange: seo.priceRange,
      description: seo.metaDescription,
      parentOrganization: { "@id": `${siteUrl}/#organization` },
    };
    if (seo.streetAddress || seo.city || seo.region || seo.postalCode) {
      business.address = {
        "@type": "PostalAddress",
        ...(seo.streetAddress ? { streetAddress: seo.streetAddress } : {}),
        ...(seo.city ? { addressLocality: seo.city } : {}),
        ...(seo.region ? { addressRegion: seo.region } : {}),
        ...(seo.postalCode ? { postalCode: seo.postalCode } : {}),
        addressCountry: seo.country || "IN",
      };
    }
    if (seo.phone) business.telephone = seo.phone;
    const lat = Number(seo.geoLat);
    const lng = Number(seo.geoLng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && seo.geoLat && seo.geoLng) {
      business.geo = { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
    }
    if (seo.openingHours) business.openingHours = seo.openingHours;
    if (seo.citiesServed.length) {
      business.areaServed = seo.citiesServed.map((c) => ({ "@type": "City", name: c }));
    }
    graph.push(business);
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const seo = await fetchSeoConfig();
  const siteUrl = resolveSiteUrl(seo);

  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${playfair.variable} ${manrope.variable} min-h-screen flex flex-col`}>
        {/* Scroll-reveal ENGINE — runs before paint, independent of React.
            Content is hidden by CSS (.js .reveal) only until this engine flips
            .is-visible, so a slow or failed hydration can NEVER leave sections
            blank on reload (Collections / Shop by Category bug). */}
        <Script id="stellora-reveal-engine" strategy="beforeInteractive">
          {`
            document.documentElement.classList.add('js');
            (function () {
              var doc = document;
              var io = 'IntersectionObserver' in window
                ? new IntersectionObserver(function (entries) {
                    entries.forEach(function (en) {
                      if (en.isIntersecting) reveal(en.target);
                    });
                  }, { threshold: 0, rootMargin: '0px 0px 12% 0px' })
                : null;
              function reveal(el) {
                if (el.__revealed) return;
                el.__revealed = true;
                el.classList.add('is-visible');
                if (io) io.unobserve(el);
              }
              function attach(el) {
                if (el.__rv) return;
                el.__rv = true;
                if (io) io.observe(el);
                else reveal(el);
              }
              function scan(node) {
                if (!node || node.nodeType !== 1) return;
                if (node.classList && node.classList.contains('reveal')) attach(node);
                var list = node.querySelectorAll ? node.querySelectorAll('.reveal:not(.is-visible)') : [];
                for (var i = 0; i < list.length; i++) attach(list[i]);
              }
              var mo = new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                  var added = muts[i].addedNodes;
                  for (var j = 0; j < added.length; j++) scan(added[j]);
                }
              });
              function start() {
                scan(doc.body);
                mo.observe(doc.body, { childList: true, subtree: true });
                // Insurance: anything at or inside the current viewport must
                // NEVER stay hidden — covers IO edge cases, blocked hydration,
                // bfcache restores and fast anchor jumps.
                setInterval(function () {
                  var vh = window.innerHeight;
                  var hidden = doc.querySelectorAll('.reveal:not(.is-visible)');
                  for (var i = 0; i < hidden.length; i++) {
                    var r = hidden[i].getBoundingClientRect();
                    if (r.top < vh && r.bottom > -80) reveal(hidden[i]);
                  }
                }, 1500);
              }
              if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
              else start();
              window.addEventListener('pageshow', function (e) { if (e.persisted) scan(doc.body); });
            })();
          `}
        </Script>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          {/* Premium toast shell — cards come from ui/notify.tsx */}
          <Toaster />
        </ThemeProvider>
        <script
          type="application/ld+json"
          async
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(seo, siteUrl)) }}
        />
        {/* Google Analytics 4 — only when the admin has configured an ID */}
        {seo.gaMeasurementId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(seo.gaMeasurementId)}`}
              strategy="afterInteractive"
            />
            <Script id="stellora-ga4" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${seo.gaMeasurementId.replace(/['"\\\\]/g, "")}');
              `}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
