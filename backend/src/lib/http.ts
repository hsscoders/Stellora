import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

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
      console.error("[api] unhandled error:", err);
      return fail(res, "INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
    });
  };
}

/** Same-origin check for state-changing requests (CSRF defense alongside SameSite=Lax). */
export function assertSameOrigin(req: Request & { headers: Record<string, unknown> }) {
  const origin = req.headers.origin;
  if (!origin) return; // non-browser clients / same-origin posts without Origin
  // Behind the Next.js rewrite proxy the Host header is rewritten to the
  // backend's own host:port — the original host arrives in x-forwarded-host.
  const fwdHost = req.headers["x-forwarded-host"];
  const host =
    (typeof fwdHost === "string" && fwdHost.split(",")[0].trim()) ||
    (typeof req.headers.host === "string" ? req.headers.host : undefined);
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) {
      throw new HttpError("FORBIDDEN", "Cross-origin request rejected.", 403);
    }
  } catch {
    throw new HttpError("FORBIDDEN", "Cross-origin request rejected.", 403);
  }
}
