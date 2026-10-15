import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/auth/password";

export const SESSION_COOKIE = "stellora_session";
export const CART_COOKIE = "stellora_cart";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const cookieBase = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "CUSTOMER" | "ADMIN";
  phone: string | null;
};

/** Create a session for a user and set the session cookie. */
export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string } = {}
): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...cookieBase, expires: expiresAt });
}

/** Destroy the current session (if any). */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  jar.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

/** Get the currently authenticated user, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.user.isActive) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    phone: session.user.phone,
  };
}

/** Get or create a guest cart key, set via cookie. */
export async function getOrCreateCartKey(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing) return existing;
  const key = randomToken(24);
  jar.set(CART_COOKIE, key, {
    ...cookieBase,
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
  });
  return key;
}

export async function readCartKey(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CART_COOKIE)?.value ?? null;
}
