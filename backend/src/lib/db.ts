import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

/**
 * MySQL data-access singleton (replaces the Mongoose connection).
 *
 *  - One PrismaClient per process (dev hot-reload safe via globalThis).
 *  - `newId()` generates 24-char lowercase-hex identifiers — the exact
 *    format of Mongo ObjectIds — so IDs migrated from MongoDB remain
 *    indistinguishable from freshly created ones and every place that
 *    treated ids as opaque 24-hex strings keeps working unchanged.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** 24-hex id, same shape as a Mongo ObjectId. */
export function newId(): string {
  return randomBytes(12).toString("hex");
}

/** True when the value looks like one of our Char(24) hex ids. */
export function isValidId(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{24}$/.test(value);
}

/**
 * Normalize Prisma `Decimal` (and arrays/objects containing them) into
 * plain JSON-safe values so API responses keep the exact same shapes the
 * Mongoose version produced (money fields as numbers, not strings).
 * Applied centrally in lib/http.ts ok()/created() helpers.
 */
export function normalizeJson<T>(value: T): T {
  return _normalize(value, new WeakSet()) as T;
}

function _normalize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "number" || t === "boolean" || t === "string") return value;
  if (t === "bigint") return Number(value);
  // Prisma Decimal: duck-type on toFixed/toNumber to avoid importing the class
  if (t === "object") {
    const anyVal = value as Record<string, unknown>;
    if (
      typeof anyVal.toFixed === "function" &&
      typeof anyVal.toNumber === "function" &&
      typeof anyVal.d === "object" &&
      typeof anyVal.s === "number" &&
      typeof anyVal.e === "number"
    ) {
      return (anyVal.toNumber as () => number).call(value);
    }
    if (value instanceof Date) return value;
    if (Array.isArray(value)) {
      return value.map((v) => _normalize(v, seen));
    }
    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = _normalize(v, seen);
    }
    // Backtrack: `seen` must track the current DFS *path*, not every object
    // ever visited. Payloads legitimately contain the same row twice (e.g.
    // POS lookup returns { product, variant } where variant is ALSO inside
    // product.variants) — with a global set the second occurrence was
    // replaced by the string "[Circular]" and the POS scanner broke.
    seen.delete(value as object);
    return out;
  }
  return value;
}

/**
 * Format a Prisma error into a safe, non-sensitive message for API
 * responses (never leaks connection strings or SQL).
 */
export function safeDbError(err: unknown): { code: string; message: string } {
  const e = err as { code?: string; message?: string };
  switch (e?.code) {
    case "P1001":
      return { code: "DB_UNREACHABLE", message: "Database is unreachable. Please try again shortly." };
    case "P2002":
      return { code: "DUPLICATE", message: "A record with the same unique value already exists." };
    case "P2003":
      return { code: "BAD_REFERENCE", message: "Referenced record does not exist." };
    case "P2025":
      return { code: "NOT_FOUND", message: "Record not found." };
    case "P2024":
      return { code: "DB_TIMEOUT", message: "Database timed out. Please retry." };
    default:
      return { code: "DB_ERROR", message: "A database error occurred." };
  }
}
