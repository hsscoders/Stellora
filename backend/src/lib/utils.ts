export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Unique-enough order number; DB unique index guards against the rare collision. */
export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const rand = randomTokenSafe();
  return `STL-${year}-${rand}`;
}

function randomTokenSafe(): string {
  const bytes = randomBytesLocal(4);
  return bytes.toString("hex").toUpperCase().slice(0, 6);
}

import { randomBytes } from "crypto";
function randomBytesLocal(n: number): Buffer {
  return randomBytes(n);
}
