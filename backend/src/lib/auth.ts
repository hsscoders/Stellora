import type { Request, Response } from "express";
import { randomToken, sha256 } from "./password";
import { HttpError } from "./http";
import { Session, User } from "../models";

export const SESSION_COOKIE = "stellora_session";
export const CART_COOKIE = "stellora_cart";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const isProd = process.env.NODE_ENV === "production";
const cookieBase = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: false, // sandbox preview terminates TLS upstream; keep false so cookies work over proxied https
  path: "/",
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "CUSTOMER" | "ADMIN";
  phone: string | null;
};

/** Create a DB-backed session for a user and set the session cookie. */
export async function createSession(
  res: Response,
  userId: string,
  meta: { ip?: string; userAgent?: string } = {}
): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await Session.create({
    tokenHash: sha256(token),
    userId,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieBase, expires: expiresAt });
}

/** Destroy the current session (if any). */
export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await Session.deleteMany({ tokenHash: sha256(token) }).catch(() => {});
  }
  res.cookie(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

/** Get the currently authenticated user, or null. */
export async function getCurrentUser(req: Request): Promise<SessionUser | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: sha256(token) }).lean();
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await Session.deleteOne({ _id: session._id }).catch(() => {});
    return null;
  }
  const user = await User.findById(session.userId).lean();
  if (!user || !user.isActive) return null;
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone ?? null,
  };
}

/** Get or create a guest cart key, set via cookie. */
export function getOrCreateCartKey(req: Request, res: Response): string {
  const existing = req.cookies?.[CART_COOKIE];
  if (existing) return existing;
  const key = randomToken(24);
  res.cookie(CART_COOKIE, key, {
    ...cookieBase,
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
  });
  return key;
}

export function readCartKey(req: Request): string | null {
  return req.cookies?.[CART_COOKIE] ?? null;
}

export async function requireUser(req: Request): Promise<SessionUser> {
  const user = await getCurrentUser(req);
  if (!user) throw new HttpError("UNAUTHENTICATED", "Please sign in to continue.", 401);
  return user;
}

export async function requireAdmin(req: Request): Promise<SessionUser> {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") {
    throw new HttpError("FORBIDDEN", "Administrator access required.", 403);
  }
  return user;
}
