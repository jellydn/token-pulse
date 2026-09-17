import { describe, expect, test } from "bun:test";
import { clampPercent, duration, relative } from "../src/ui";

describe("duration", () => {
  test("returns Reset unknown for null, empty, and unparseable input", () => {
    expect(duration(null)).toBe("Reset unknown");
    expect(duration("")).toBe("Reset unknown");
    expect(duration("garbage")).toBe("Reset unknown");
    expect(duration("not-a-date")).toBe("Reset unknown");
  });
});

describe("relative", () => {
  test("returns Unknown for null, empty, and unparseable input", () => {
    expect(relative(null)).toBe("Unknown");
    expect(relative("")).toBe("Unknown");
    expect(relative("garbage")).toBe("Unknown");
  });
});

describe("clampPercent", () => {
  test("returns 0 for null, NaN, and non-finite input", () => {
    expect(clampPercent(null)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampPercent(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  test("clamps finite values to 1..100", () => {
    expect(clampPercent(0)).toBe(1);
    expect(clampPercent(-5)).toBe(1);
    expect(clampPercent(0.4)).toBe(1);
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(100)).toBe(100);
    expect(clampPercent(150)).toBe(100);
  });
});
