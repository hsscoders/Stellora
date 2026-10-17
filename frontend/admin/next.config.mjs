// Plain-JS config (.mjs) on purpose: `next start` loads a .ts config through
// SWC, and on hosts where the native SWC binary can't load (old glibc) the
// server would crash at boot. .mjs loads without SWC.
/** @type {import('next').NextConfig} */

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

const nextConfig = {
  reactStrictMode: false,
  basePath: "/admin-console",
  // Serve admin images as-is. The production image optimizer self-fetches
  // relative URLs WITHOUT the basePath (Next internal-fetch quirk with
  // basePath'd apps), so every product/banner thumbnail 404'd behind the
  // storefront proxy ("internal image response failed … 404"). Admin renders
  // small thumbnails from the same static files the storefront ships, so
  // skipping re-encoding is both correct and lighter here.
  images: { unoptimized: true },
  // Dev-only: allow the HMR websocket / dev resources from these hosts.
  // Wildcards cover sandbox preview hosts (preview-*.space-z.ai) so the admin
  // console also hydrates when opened through the preview panel.
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.space-z.ai", "*.z.ai"],
  typescript: { ignoreBuildErrors: false },
  async rewrites() {
    return [
      // Direct access on :3001 — proxy API calls to the backend, in BOTH
      // spellings: the basePath'd one (client XHRs via the api() helper) and
      // the bare one (relative <Image>/media URLs, which never get the
      // basePath). basePath:false keeps a source unprefixed; the second pair
      // is auto-prefixed by Next to /admin-console/….
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*`, basePath: false },
      { source: "/uploads/:path*", destination: `${BACKEND}/api/media/:path*`, basePath: false },
      // Static product/banner art lives in the storefront's public/ — on the
      // admin origin, Next only serves public under the basePath, so bounce
      // the bare /images/* paths to the basePath'd public route (self-fetch).
      { source: "/images/:path*", destination: `http://127.0.0.1:${process.env.PORT ?? 3001}/admin-console/images/:path*`, basePath: false },
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/uploads/:path*", destination: `${BACKEND}/api/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
