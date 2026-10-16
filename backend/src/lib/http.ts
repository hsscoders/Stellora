import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { env } from "../env";

/** Success envelope: { ok: true, data } */
export function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ ok: true, data });
}

/** Error envelope: { ok: false, error: { code, message, fields? } } */
export function fail(
  res: Response,
  code: string,
  message: string,
  status = 400,
  fields?: Record<string, string>
) {
  return res.status(status).json({ ok: false, error: { code, message, fields } });
}

export class HttpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wrap an async route handler with uniform error handling; never leaks internals. */
export function handle(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((err) => {
      if (err instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of err.issues) {
          const key = issue.path.join(".");
          if (!fields[key]) fields[key] = issue.message;
        }
        return fail(res, "VALIDATION_ERROR", "Please check the highlighted fields.", 422, fields);
      }
      if (err instanceof HttpError) {
        return fail(res, err.code, err.message, err.status);
      }
      // Malformed Mongo ids (e.g. /products/not-an-objectid) arrive as CastError —
      // treat them as "record not found" instead of leaking a 500.
      if (err instanceof mongoose.Error.CastError) {
        return fail(res, "NOT_FOUND", "The requested record was not found.", 404);
      }
      console.error("[api] unhandled error:", err);
      return fail(res, "INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
    });
  };
}

function safeHostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Same-origin check for state-changing requests (CSRF defense alongside SameSite=Lax).
 *
 * The browser's Origin must resolve to a host this API is actually reached from.
 * Behind the Next.js rewrite proxy the Host header is rewritten to the backend's
 * own host:port, so the browser-visible host arrives in x-forwarded-host — one
 * entry per proxy hop (comma-separated). Dynamic preview/sandbox subdomains
 * (e.g. preview-<id>.space-z.ai) are covered by the ORIGIN_SUFFIXES dot-suffix
 * allowlist, since their hostnames cannot be enumerated ahead of time.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) return; // non-browser clients / same-origin posts without Origin
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
    if (!originHost) throw new Error("empty host");
  } catch {
    throw new HttpError("FORBIDDEN", "Cross-origin request rejected.", 403);
  }

  // Every proxy hop's host is a legitimate "the browser was talking to this
  // site" candidate: x-forwarded-host entries first, then the direct Host.
  const candidates = new Set<string>();
  const fwd = req.headers["x-forwarded-host"];
  const fwdList = Array.isArray(fwd) ? fwd : typeof fwd === "string" ? [fwd] : [];
  for (const entry of fwdList) {
    for (const part of entry.split(",")) {
      const host = part.trim().toLowerCase();
      if (host) candidates.add(host);
    }
  }
  const direct = typeof req.headers.host === "string" ? req.headers.host.trim().toLowerCase() : "";
  if (direct) candidates.add(direct);
  const appHost = safeHostOf(env.APP_URL);
  if (appHost) candidates.add(appHost);

  if (candidates.has(originHost)) return;

  // Loopback development origins (any port) are trusted outside production.
  if (env.NODE_ENV !== "production") {
    try {
      const { hostname } = new URL(origin);
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname === "::1" ||
        hostname.endsWith(".localhost")
      ) {
        return;
      }
    } catch {
      throw new HttpError("FORBIDDEN", "Cross-origin request rejected.", 403);
    }
  }

  // Dynamic preview hosts (sandbox panels, staging subdomains).
  const suffixes = env.ORIGIN_SUFFIXES.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const suffixOk = suffixes.some((suffix) => {
    const dotted = suffix.startsWith(".") ? suffix : `.${suffix}`;
    return originHost.endsWith(dotted);
  });
  if (suffixOk) return;

  throw new HttpError("FORBIDDEN", "Cross-origin request rejected.", 403);
}
