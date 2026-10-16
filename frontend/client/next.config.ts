import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";
// Admin console origin. Local dev: the sibling Next app on :3001.
// On Netlify: set ADMIN_URL to the admin site's own URL
// (e.g. https://stellora-admin.netlify.app) so /admin-console/* proxies there.
const ADMIN = process.env.ADMIN_URL ?? "http://127.0.0.1:3001";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // frame-ancestors * lets the sandbox preview panel embed the site in an
  // iframe (X-Frame-Options: DENY would render a blank preview for users).
  { key: "Content-Security-Policy", value: "frame-ancestors *" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Dev preview: serve original images directly. The on-demand sharp optimizer
  // makes first loads crawl in dev (each 1080px JPEG re-encoded per unique URL),
  // so product cards sit white/blank for seconds — the #1 "preview looks broken"
  // complaint. Production keeps full optimization.
  images: { unoptimized: process.env.NODE_ENV === "development" },
  // Dev-only: allow the HMR websocket / dev resources from these hosts.
  // Without this, Next 16 blocks /_next/hmr as "cross-origin" and hydration
  // never completes (pages render but no client interactivity). The wildcards
  // cover the sandbox preview hosts (preview-*.space-z.ai) — without them the
  // preview panel loads the page but every button stays dead with origin
  // errors in the console.
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.space-z.ai", "*.z.ai"],
  typescript: { ignoreBuildErrors: false },
  async rewrites() {
    return [
      // All API calls proxy to the Express backend — browser stays same-origin,
      // so httpOnly session cookies work without any CORS complexity.
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      // Uploaded media served by the backend
      { source: "/uploads/:path*", destination: `${BACKEND}/api/media/:path*` },
      // Admin console is a separate Next.js app, proxied in so the whole site
      // is reachable from a single external origin (cookies stay same-origin).
      { source: "/admin-console/:path*", destination: `${ADMIN}/admin-console/:path*` },
      { source: "/admin-console", destination: `${ADMIN}/admin-console` },
    ];
  },
  async headers() {
    return [{ source: "/((?!_next/static|_next/image|favicon.ico|images).*)", headers: securityHeaders }];
  },
};

export default nextConfig;
