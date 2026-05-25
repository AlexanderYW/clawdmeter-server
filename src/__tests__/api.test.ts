import { describe, expect, test } from "bun:test";
import { pct, resetMinutes } from "../api.js";

describe("pct", () => {
  test("returns 0 for null/empty", () => {
    expect(pct(null)).toBe(0);
    expect(pct("")).toBe(0);
  });

  test("converts a fractional utilization string to a rounded percent", () => {
    expect(pct("0.5")).toBe(50);
    expect(pct("0.123")).toBe(12);
    expect(pct("0.125")).toBe(13);
    expect(pct("1")).toBe(100);
    expect(pct("0")).toBe(0);
  });

  test("returns 0 for non-numeric input", () => {
    expect(pct("not a number")).toBe(0);
    expect(pct("NaN")).toBe(0);
  });
});

describe("resetMinutes", () => {
  const now = 1_700_000_000;

  test("returns 0 for null/empty/non-numeric", () => {
    expect(resetMinutes(null, now)).toBe(0);
    expect(resetMinutes("", now)).toBe(0);
    expect(resetMinutes("garbage", now)).toBe(0);
  });

  test("returns rounded minutes until reset for a future timestamp", () => {
    expect(resetMinutes(String(now + 600), now)).toBe(10);
    expect(resetMinutes(String(now + 90), now)).toBe(2);
    expect(resetMinutes(String(now + 89), now)).toBe(1);
  });

  test("returns 0 for a reset that is in the past or now", () => {
    expect(resetMinutes(String(now - 60), now)).toBe(0);
    expect(resetMinutes(String(now), now)).toBe(0);
  });
});
