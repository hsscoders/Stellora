import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, sha256, randomToken } from "@/lib/auth/password";

describe("password hashing (scrypt)", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("Stellora#2026");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Stellora#2026", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces unique salts per call", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored hashes safely", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "scrypt$onlysalt")).toBe(false);
  });
});

describe("token utilities", () => {
  it("generates url-safe random tokens", () => {
    const t = randomToken(32);
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(randomToken()).not.toBe(randomToken());
  });

  it("hashes deterministically with sha256", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
});
