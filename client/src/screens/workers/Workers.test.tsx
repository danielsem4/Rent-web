import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import type { IWorkerListItem } from "@/common/types/worker";

const h = vi.hoisted(() => ({
  role: "COMPANY_MANAGER" as string,
  list: { data: [] as IWorkerListItem[], isLoading: false, isError: false },
}));

vi.mock("./hooks/queries/useWorkers", () => ({
  useWorkers: () => h.list,
  useWorker: () => ({ data: undefined, isLoading: false }),
  workersKey: ["workers"],
}));
vi.mock("./hooks/queries/useWorkerMutations", () => ({
  useDeleteWorker: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/screens/properties/hooks/queries/useProperties", () => ({
  useProperties: () => ({ data: [{ id: 7, city: "Tel Aviv", address: "1 Herzl St" }] }),
}));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: h.role } }),
}));

import Workers from "./Workers";

// A date N days from a fixed "today" is awkward without faking time; use explicit
// far-future / past ISO dates and assert on the derived text instead.
const soon = new Date(Date.now() + 20 * 864e5).toISOString(); // ~20 days out → alert

const row = (over: Partial<IWorkerListItem> = {}): IWorkerListItem => ({
  id: 1,
  companyId: 1,
  nameHe: "סיריפורן",
  nameEn: "Siriporn",
  nationality: "Thailand",
  propertyId: 7,
  passportExpiry: null,
  visaExpiry: null,
  insuranceExpiry: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const renderList = () =>
  render(
    <MemoryRouter>
      <Workers />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.role = "COMPANY_MANAGER";
  h.list = { data: [], isLoading: false, isError: false };
});

describe("Workers list", () => {
  it("renders a row per worker with Hebrew + English name and resolved apartment", () => {
    h.list = { data: [row(), row({ id: 2, nameEn: "Kumar", nationality: "India" })], isLoading: false, isError: false };
    renderList();
    expect(screen.getByText("Siriporn")).toBeInTheDocument();
    expect(screen.getByText("Kumar")).toBeInTheDocument();
    expect(screen.getAllByText("Tel Aviv, 1 Herzl St").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no workers", () => {
    renderList();
    expect(screen.getByText("No workers yet.")).toBeInTheDocument();
  });

  it("renders an expiry alert badge for a soon-to-expire document", () => {
    h.list = { data: [row({ visaExpiry: soon })], isLoading: false, isError: false };
    renderList();
    // The nearest-alert badge text uses the interpolated day count.
    expect(screen.getByText(/Expires in/)).toBeInTheDocument();
  });

  it("shows write controls for a COMPANY_MANAGER", () => {
    h.list = { data: [row()], isLoading: false, isError: false };
    renderList();
    expect(screen.getByText("Add worker")).toBeInTheDocument();
    expect(screen.getByLabelText("View")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete")).toBeInTheDocument();
  });

  it("links the View action to the worker detail page", () => {
    h.list = { data: [row({ id: 42 })], isLoading: false, isError: false };
    renderList();
    expect(screen.getByLabelText("View").closest("a")).toHaveAttribute("href", "/workers/42");
  });

  it("shows View but hides write controls for a COMPANY_WORKER (UX gating)", () => {
    h.role = "COMPANY_WORKER";
    h.list = { data: [row()], isLoading: false, isError: false };
    renderList();
    expect(screen.getByText("Siriporn")).toBeInTheDocument();
    expect(screen.getByLabelText("View")).toBeInTheDocument();
    expect(screen.queryByText("Add worker")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });
});
