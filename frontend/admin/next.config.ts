import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
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
      // Direct access on :3001 — proxy API calls to the backend.
      // When served through the frontend proxy on :3000, the frontend's own
      // rewrite handles /api before this one is consulted.
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      // Legacy uploaded-media URLs (older rows stored /uploads/<name>) — mirror
      // the storefront's mapping so the admin never shows a broken image.
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
