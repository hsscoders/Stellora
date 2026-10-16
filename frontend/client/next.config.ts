import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Dev-only: allow the HMR websocket / dev resources from these hosts.
  // Without this, Next 16 blocks /_next/hmr as "cross-origin" and hydration
  // never completes (pages render but no client interactivity).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  typescript: { ignoreBuildErrors: false },
  async rewrites() {
    return [
      // All API calls proxy to the Express backend — browser stays same-origin,
      // so httpOnly session cookies work without any CORS complexity.
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      // Uploaded media served by the backend
      { source: "/uploads/:path*", destination: `${BACKEND}/api/media/:path*` },
      // Admin console is a separate Next.js app on port 3001, proxied in so the
      // whole site is reachable from a single external origin.
      { source: "/admin-console/:path*", destination: `http://127.0.0.1:3001/admin-console/:path*` },
      { source: "/admin-console", destination: `http://127.0.0.1:3001/admin-console` },
    ];
  },
  async headers() {
    return [{ source: "/((?!_next/static|_next/image|favicon.ico|images).*)", headers: securityHeaders }];
  },
};

export default nextConfig;
