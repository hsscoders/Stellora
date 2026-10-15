import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export function fail(
  code: string,
  message: string,
  status = 400,
  fields?: Record<string, string>
) {
  return NextResponse.json(
    { ok: false, error: { code, message, fields } },
    { status }
  );
}

/** Wrap a route handler with uniform error handling; never leaks internals. */
export async function handle(
  fn: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".");
        if (!fields[key]) fields[key] = issue.message;
      }
      return fail("VALIDATION_ERROR", "Please check the highlighted fields.", 422, fields);
    }
    if (err instanceof HttpError) {
      return fail(err.code, err.message, err.status);
    }
    console.error("[api] unhandled error:", err);
    return fail(
      "INTERNAL_ERROR",
      "Something went wrong. Please try again.",
      500
    );
  }
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

/** Same-origin check for state-changing requests (CSRF defense alongside SameSite=Lax). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients / same-origin form posts without Origin
  const host = req.headers.get("host");
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) {
      throw new HttpError("FORBIDDEN", "Cross-origin request rejected.", 403);
    }
  } catch {
    throw new HttpError("FORBIDDEN", "Cross-origin request rejected.", 403);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError("UNAUTHENTICATED", "Please sign in to continue.", 401);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new HttpError("FORBIDDEN", "Administrator access required.", 403);
  }
  return user;
}
