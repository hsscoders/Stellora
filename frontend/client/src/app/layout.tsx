import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Playfair_Display, Manrope } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "Stellora — Sterling & Artificial Jewellery, Hair Extensions, Vanity & Handbags",
    template: "%s · Stellora",
  },
  description:
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
  applicationName: "Stellora",
  authors: [{ name: "Stellora" }],
  creator: "Stellora",
  publisher: "Stellora",
  formatDetection: { telephone: false, email: false, address: false },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Stellora",
    locale: "en_IN",
    url: SITE_URL,
    title: "Stellora — Premium Jewellery, Hair Extensions, Vanity & Handbags",
    description:
      "Curated sterling and artificial jewellery, hair extensions, vanity essentials and handbags. Quiet luxury, every day.",
    images: [
      {
        url: "/images/banners/category-jewellery.jpg",
        width: 1200,
        height: 630,
        alt: "The Stellora collection",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stellora — Premium Jewellery, Hair Extensions, Vanity & Handbags",
    description:
      "Curated sterling and artificial jewellery, hair extensions, vanity essentials and handbags.",
    images: ["/images/banners/category-jewellery.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#801d3f" },
    { media: "(prefers-color-scheme: dark)", color: "#120a0d" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** Organization + WebSite structured data for rich results. */
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Stellora",
      url: SITE_URL,
      description:
        "Premium retail destination for sterling and artificial jewellery, hair extensions, vanity essentials and handbags.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Stellora",
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-IN",
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${playfair.variable} ${manrope.variable} min-h-screen flex flex-col`}>
        {/* Marks JS availability before first paint — CSS scroll-reveal only
            hides content when this class is present, so no-JS visitors and
            non-hydrated previews always see the full page. */}
        <Script id="stellora-js-class" strategy="beforeInteractive">
          {"document.documentElement.classList.add('js')"}
        </Script>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
        <script
          type="application/ld+json"
          async
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </body>
    </html>
  );
}
