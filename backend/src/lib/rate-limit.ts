// Simple in-memory rate limiter (single-node deployment).
// For multi-instance deployments, replace with a shared store (e.g., Redis).
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodic cleanup to avoid unbounded growth
let lastSweep = Date.now();
function sweep() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  sweep();
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function getClientIp(
  req: { ip?: string; headers: Record<string, unknown> }
): string {
  // Prefer Express's trust-proxy-aware value (app.set("trust proxy", 1)):
  // it uses the IP the proxy actually observed, so a client cannot rotate
  // its rate-limit bucket by injecting extra X-Forwarded-For entries.
  if (typeof req.ip === "string" && req.ip) return req.ip;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  return (typeof real === "string" && real) || "unknown";
}
