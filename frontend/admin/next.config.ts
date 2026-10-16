import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  basePath: "/admin-console",
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
