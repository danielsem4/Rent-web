import { describe, it, expect } from "vitest";
import { ticketLevel, paymentStatus, formatOccupancy, formatDate } from "./indicators";

describe("ticketLevel", () => {
  it("is green (none) for 0 or fewer", () => {
    expect(ticketLevel(0)).toBe("none");
    expect(ticketLevel(-3)).toBe("none");
  });
  it("is orange (low) for exactly 1", () => {
    expect(ticketLevel(1)).toBe("low");
  });
  it("is red (high) for 2 or more", () => {
    expect(ticketLevel(2)).toBe("high");
    expect(ticketLevel(9)).toBe("high");
  });
});

describe("paymentStatus", () => {
  it('defaults to "future" until the ledger slice exists', () => {
    expect(paymentStatus()).toBe("future");
  });
});

describe("formatOccupancy", () => {
  it("renders occupied/capacity", () => {
    expect(formatOccupancy(0, 4)).toBe("0/4");
    expect(formatOccupancy(3, 4)).toBe("3/4");
  });
});

describe("formatDate", () => {
  it("returns yyyy-mm-dd for a valid ISO date", () => {
    expect(formatDate("2026-08-31T00:00:00.000Z")).toBe("2026-08-31");
  });
  it("returns null for null or invalid input", () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate("not-a-date")).toBeNull();
  });
});
