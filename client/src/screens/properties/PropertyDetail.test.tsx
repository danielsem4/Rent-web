import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import "@/i18n";
import type { IProperty } from "@/common/types/property";

const h = vi.hoisted(() => ({
  role: "COMPANY_MANAGER" as string,
  query: {
    data: undefined as IProperty | undefined,
    isLoading: false,
    isError: false,
  },
}));

vi.mock("./hooks/queries/useProperties", () => ({
  useProperty: () => h.query,
  useProperties: () => ({ data: [], isLoading: false, isError: false }),
  propertiesKey: ["properties"],
}));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: h.role } }),
}));

import PropertyDetail from "./PropertyDetail";

const property = (over: Partial<IProperty> = {}): IProperty => ({
  id: 1,
  companyId: 1,
  city: "Tel Aviv",
  address: "1 Herzl St",
  entryCode: "SECRET-1234",
  electricMeter: "E-1",
  waterMeter: "W-1",
  ownerName: "Owner One",
  ownerPhone: "050-0000000",
  contractStart: "2026-01-01T00:00:00.000Z",
  contractEnd: "2026-12-31T00:00:00.000Z",
  monthlyRent: 5200,
  capacity: 3,
  notes: "Nice place",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={["/properties/1"]}>
      <Routes>
        <Route path="/properties/:id" element={<PropertyDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.role = "COMPANY_MANAGER";
  h.query = { data: property(), isLoading: false, isError: false };
});

describe("PropertyDetail", () => {
  it("renders the property fields, including entryCode", () => {
    renderDetail();
    expect(screen.getByText("1 Herzl St")).toBeInTheDocument();
    expect(screen.getByText("Owner One")).toBeInTheDocument();
    expect(screen.getByText("SECRET-1234")).toBeInTheDocument();
  });

  it("shows an Edit link for a manager, pointing at the edit route", () => {
    renderDetail();
    const edit = screen.getByText("Edit").closest("a");
    expect(edit).toHaveAttribute("href", "/properties/1/edit");
  });

  it("hides the Edit link for a worker (UX gating)", () => {
    h.role = "COMPANY_WORKER";
    renderDetail();
    expect(screen.getByText("1 Herzl St")).toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("shows the loading state", () => {
    h.query = { data: undefined, isLoading: true, isError: false };
    renderDetail();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows the error state with a back link", () => {
    h.query = { data: undefined, isLoading: false, isError: true };
    renderDetail();
    expect(screen.getByText("Could not load properties.")).toBeInTheDocument();
    expect(screen.getByText("Back").closest("a")).toHaveAttribute("href", "/properties");
  });
});
