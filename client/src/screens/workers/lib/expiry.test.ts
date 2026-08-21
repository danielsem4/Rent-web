import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { documentHealth, yearsSince } from "./expiry";

// Freeze "now" so day/year math is deterministic.
const NOW = new Date("2026-08-21T12:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

const past = "2020-01-01T00:00:00.000Z";
const soon = "2026-09-10T00:00:00.000Z"; // ~20 days out → expiring
const far = "2030-01-01T00:00:00.000Z";

describe("documentHealth", () => {
  it("returns ok with zero count when every date is comfortably valid", () => {
    expect(
      documentHealth({ passportExpiry: far, visaExpiry: far, insuranceExpiry: far }),
    ).toEqual({ severity: "ok", count: 0 });
  });

  it("ignores unset dates", () => {
    expect(
      documentHealth({ passportExpiry: far, visaExpiry: null, insuranceExpiry: undefined }),
    ).toEqual({ severity: "ok", count: 0 });
  });

  it("reports 'expiring' and counts near-term dates", () => {
    expect(documentHealth({ passportExpiry: soon, visaExpiry: far })).toEqual({
      severity: "expiring",
      count: 1,
    });
  });

  it("prefers 'expired' over 'expiring' and counts both", () => {
    expect(documentHealth({ passportExpiry: past, visaExpiry: soon, insuranceExpiry: far })).toEqual(
      { severity: "expired", count: 2 },
    );
  });
});

describe("yearsSince", () => {
  it("returns null for a missing or invalid date", () => {
    expect(yearsSince(null)).toBeNull();
    expect(yearsSince(undefined)).toBeNull();
    expect(yearsSince("not-a-date")).toBeNull();
  });

  it("counts whole years, not yet crediting an anniversary still to come", () => {
    expect(yearsSince("2000-01-01T00:00:00.000Z")).toBe(26);
    // Anniversary later this year (Dec) → still one year short.
    expect(yearsSince("2000-12-31T00:00:00.000Z")).toBe(25);
  });

  it("never returns a negative for a future date", () => {
    expect(yearsSince("2030-01-01T00:00:00.000Z")).toBe(0);
  });
});
