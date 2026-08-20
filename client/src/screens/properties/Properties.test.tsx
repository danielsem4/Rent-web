import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import type { IPropertyListItem } from "@/common/types/property";

// Controllable state shared with the mocked hooks/store (hoisted so the vi.mock
// factories can close over it).
const h = vi.hoisted(() => ({
  role: "COMPANY_MANAGER" as string,
  list: { data: [] as IPropertyListItem[], isLoading: false, isError: false },
}));

vi.mock("./hooks/queries/useProperties", () => ({
  useProperties: () => h.list,
  useProperty: () => ({ data: undefined, isLoading: false }),
  propertiesKey: ["properties"],
}));
vi.mock("./hooks/queries/usePropertyMutations", () => ({
  useDeleteProperty: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: h.role } }),
}));

import Properties from "./Properties";

const row = (over: Partial<IPropertyListItem> = {}): IPropertyListItem => ({
  id: 1,
  companyId: 1,
  city: "Tel Aviv",
  address: "1 Herzl St",
  ownerName: "Owner One",
  monthlyRent: 5000,
  capacity: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const renderList = () =>
  render(
    <MemoryRouter>
      <Properties />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.role = "COMPANY_MANAGER";
  h.list = { data: [], isLoading: false, isError: false };
});

describe("Properties list", () => {
  it("renders a row for each property", () => {
    h.list = { data: [row(), row({ id: 2, city: "Haifa" })], isLoading: false, isError: false };
    renderList();
    expect(screen.getByText("Tel Aviv")).toBeInTheDocument();
    expect(screen.getByText("Haifa")).toBeInTheDocument();
  });

  it("shows the empty state when there are no properties", () => {
    renderList();
    expect(screen.getByText("No properties yet.")).toBeInTheDocument();
  });

  it("shows the Add button for a COMPANY_MANAGER", () => {
    h.list = { data: [row()], isLoading: false, isError: false };
    renderList();
    expect(screen.getByText("Add property")).toBeInTheDocument();
    // Edit/delete controls are present for a manager.
    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete")).toBeInTheDocument();
  });

  it("hides write controls for a COMPANY_WORKER (UX gating)", () => {
    h.role = "COMPANY_WORKER";
    h.list = { data: [row()], isLoading: false, isError: false };
    renderList();
    // Data is still visible (read-only), but no create/edit/delete affordances.
    expect(screen.getByText("Tel Aviv")).toBeInTheDocument();
    expect(screen.queryByText("Add property")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });
});
