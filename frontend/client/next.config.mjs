// Plain-JS config (.mjs) on purpose: `next start` loads a .ts config through
// SWC, and on hosts where the native SWC binary can't load (old glibc) the
// server would crash at boot. .mjs loads without SWC.
/** @type {import('next').NextConfig} */

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";
// Admin console origin. Local dev: the sibling Next app on :3001.
// Production: the sibling Next app on :3001 (proxied through the storefront).
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

const nextConfig = {
  reactStrictMode: false,
  // Socket.IO needs the exact path /socket.io/ (trailing slash) to reach the
  // backend engine.io listener — Next's automatic trailing-slash redirect
  // would strip it (308 → /socket.io → backend 404). Skipping the redirect
  // lets the rewrites below pass the path through byte-for-byte. The app's
  // own pages never use trailing slashes, so nothing else changes.
  skipTrailingSlashRedirect: true,
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
      // Socket.IO realtime (polling + websocket upgrade) — same-origin proxy,
      // so the session cookie rides the handshake and auth is automatic.
      { source: "/socket.io/:path*", destination: `${BACKEND}/socket.io/:path*` },
      { source: "/socket.io/", destination: `${BACKEND}/socket.io/` },
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
