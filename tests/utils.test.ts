import { describe, it, expect } from "vitest";
import { slugify, generateOrderNumber, formatINR } from "@/lib/utils";

describe("utils", () => {
  it("slugifies product names", () => {
    expect(slugify("Aurelia Silver Pendant Necklace")).toBe("aurelia-silver-pendant-necklace");
    expect(slugify("  Ring — 92.5% Silver!  ")).toBe("ring-925-silver");
    expect(slugify("Multi   spaces___underscores")).toBe("multi-spaces-underscores");
  });

  it("generates order numbers in STL-YEAR-XXXXXX format", () => {
    const n = generateOrderNumber();
    expect(n).toMatch(/^STL-\d{4}-[A-Z0-9]{6}$/);
    expect(generateOrderNumber()).not.toBe(generateOrderNumber());
  });

  it("formats INR with Indian grouping", () => {
    expect(formatINR(1499)).toContain("1,499");
    expect(formatINR("123456")).toContain("1,23,456");
  });
});
