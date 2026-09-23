import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import type { IPropertyListItem } from "@/common/types/property";
import type { IWorkerListItem } from "@/common/types/worker";
import type { IPaymentListItem } from "@/common/types/payment";
import type { IInspectionListItem } from "@/common/types/inspection";

const h = vi.hoisted(() => ({
  properties: { data: [] as IPropertyListItem[], isLoading: false, isError: false },
  workers: { data: [] as IWorkerListItem[], isLoading: false, isError: false },
  payments: { data: [] as IPaymentListItem[], isLoading: false, isError: false },
  inspections: { data: [] as IInspectionListItem[], isLoading: false, isError: false },
}));

vi.mock("@/screens/properties/hooks/queries/useProperties", () => ({
  useProperties: () => h.properties,
  propertiesKey: ["properties"],
}));
vi.mock("@/screens/workers/hooks/queries/useWorkers", () => ({
  useWorkers: () => h.workers,
  workersKey: ["workers"],
}));
vi.mock("@/hooks/queries/usePayments", () => ({
  usePayments: () => h.payments,
  paymentsKey: ["payments"],
}));
vi.mock("@/hooks/queries/useInspections", () => ({
  useInspections: () => h.inspections,
  inspectionsKey: ["inspections"],
}));

import WorkerDashboard from "./WorkerDashboard";

const prop = (id: number): IPropertyListItem => ({ id }) as IPropertyListItem;
const worker = (id: number): IWorkerListItem => ({ id }) as IWorkerListItem;

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

const payment = (over: Partial<IPaymentListItem> = {}): IPaymentListItem => ({
  id: 1,
  companyId: 1,
  propertyId: 1,
  amount: 5000,
  dueDate: iso(-10),
  paidAt: null,
  status: "PENDING",
  property: { id: 1, city: "Tel Aviv", address: "1 Herzl St", total: 1, maxCapacity: 3 },
  ...over,
});

const inspection = (over: Partial<IInspectionListItem> = {}): IInspectionListItem => ({
  id: 1,
  companyId: 1,
  propertyId: 1,
  lastInspectionDate: null,
  nextInspectionDate: iso(5),
  property: { id: 1, city: "Tel Aviv", address: "1 Herzl St" },
  ...over,
});

const renderDash = () =>
  render(
    <MemoryRouter>
      <WorkerDashboard />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.properties = { data: [], isLoading: false, isError: false };
  h.workers = { data: [], isLoading: false, isError: false };
  h.payments = { data: [], isLoading: false, isError: false };
  h.inspections = { data: [], isLoading: false, isError: false };
});

describe("WorkerDashboard", () => {
  it("shows the apartment and foreign-worker counts", () => {
    h.properties = { data: [prop(1), prop(2), prop(3)], isLoading: false, isError: false };
    h.workers = { data: [worker(1), worker(2)], isLoading: false, isError: false };
    renderDash();
    expect(screen.getByText("Apartments")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Foreign Workers")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("counts only overdue (PENDING + past due) payments", () => {
    h.payments = {
      data: [
        payment({ id: 1, dueDate: iso(-5), status: "PENDING" }), // overdue ✓
        payment({ id: 2, dueDate: iso(-30), status: "PAID" }), // paid ✗
        payment({ id: 3, dueDate: iso(30), status: "PENDING" }), // not yet due ✗
      ],
      isLoading: false,
      isError: false,
    };
    renderDash();
    expect(screen.getByText("Outstanding Payments")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("counts inspections that are overdue or due within 30 days", () => {
    h.inspections = {
      data: [
        inspection({ id: 1, nextInspectionDate: iso(-2) }), // overdue ✓
        inspection({ id: 2, nextInspectionDate: iso(10) }), // due soon ✓
        inspection({ id: 3, nextInspectionDate: iso(90) }), // far off ✗
        inspection({ id: 4, nextInspectionDate: null }), // unscheduled ✗
      ],
      isLoading: false,
      isError: false,
    };
    renderDash();
    expect(screen.getByText("Upcoming Inspections")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the two attention-table sections with empty states", () => {
    renderDash();
    expect(screen.getByText("Expiring Documents")).toBeInTheDocument();
    expect(screen.getByText("Ended or Ending Contracts")).toBeInTheDocument();
    expect(screen.getByText("No documents expired or expiring soon.")).toBeInTheDocument();
    expect(screen.getByText("No contracts ended or ending soon.")).toBeInTheDocument();
  });

  it("links Apartments/Workers/Inspections but NOT the payments tile", () => {
    renderDash();
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/workers");
    // Apartments + Inspections both point at /properties.
    expect(hrefs.filter((h) => h === "/properties")).toHaveLength(2);
    // Three clickable tiles; the Outstanding Payments tile has no destination.
    expect(hrefs).toHaveLength(3);
  });
});
