import { describe, it, expect } from "vitest";
import { homePathForRole } from "./homePath";

describe("homePathForRole", () => {
  it("routes every known role to the dashboard today", () => {
    for (const role of ["SUPER_ADMIN", "COMPANY_MANAGER", "COMPANY_WORKER", "RENTER"]) {
      expect(homePathForRole(role)).toBe("/");
    }
  });

  it("defaults an unknown role to the dashboard", () => {
    expect(homePathForRole("SOMETHING_ELSE")).toBe("/");
  });
});
