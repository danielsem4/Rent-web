import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
// Property-detail data-group hooks — stubbed empty so panels render without a
// network/QueryClient. (Radix Tabs only mount the active panel, but stub all.)
const emptyQuery = { data: [], isLoading: false, isError: false };
vi.mock("./hooks/queries/usePropertyGroups", () => ({
  propertyGroupKey: (id: number | undefined, g: string) => ["properties", id, g],
  usePropertyBills: () => emptyQuery,
  usePropertyGuarantees: () => emptyQuery,
  usePropertyExpenses: () => emptyQuery,
  usePropertyInspections: () => emptyQuery,
  usePropertyRentHistory: () => emptyQuery,
}));
vi.mock("./hooks/queries/usePropertyEquipment", () => ({
  usePropertyEquipment: () => emptyQuery,
  useCreateEquipment: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteEquipment: () => ({ mutate: vi.fn(), isPending: false }),
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
  maxCapacity: 3,
  total: 1,
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
  it("renders the property fields on the default Overview tab, including entryCode", () => {
    renderDetail();
    expect(screen.getByText("Tel Aviv, 1 Herzl St")).toBeInTheDocument();
    expect(screen.getByText("Owner One")).toBeInTheDocument();
    expect(screen.getByText("SECRET-1234")).toBeInTheDocument();
  });

  it("switches to the Finances tab and shows the rent history section", () => {
    renderDetail();
    // Radix Tabs activates on mouseDown, not click.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Finances" }));
    expect(screen.getByText("Monthly rent history")).toBeInTheDocument();
    expect(screen.getByText("No rent payments recorded yet.")).toBeInTheDocument();
  });

  it("switches to the Bills tab and shows the utility-bills empty state", () => {
    renderDetail();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Bills" }));
    expect(screen.getByText("No bills recorded yet.")).toBeInTheDocument();
  });

  it("shows occupancy (current / max) in the overview", () => {
    h.query = { data: property({ total: 2, maxCapacity: 5 }), isLoading: false, isError: false };
    renderDetail();
    // "2 / 5" appears in both the hero occupancy bar and the profile field.
    expect(screen.getAllByText("2 / 5").length).toBeGreaterThan(0);
  });

  it("shows an Edit link for a manager, pointing at the edit route", () => {
    renderDetail();
    const edit = screen.getByText("Edit").closest("a");
    expect(edit).toHaveAttribute("href", "/properties/1/edit");
  });

  it("hides the Edit link for a worker (UX gating)", () => {
    h.role = "COMPANY_WORKER";
    renderDetail();
    expect(screen.getByText("Tel Aviv, 1 Herzl St")).toBeInTheDocument();
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
