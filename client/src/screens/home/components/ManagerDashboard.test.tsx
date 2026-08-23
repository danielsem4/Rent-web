import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import { ROLES } from "@/common/types/role";
import type { IEmployee } from "@/common/types/user";
import type { IPropertyListItem } from "@/common/types/property";
import type { IPaymentListItem } from "@/common/types/payment";
import type { IWorkerListItem } from "@/common/types/worker";

const h = vi.hoisted(() => ({
  users: { data: [] as IEmployee[], isLoading: false, isError: false },
  properties: { data: [] as IPropertyListItem[], isLoading: false, isError: false },
  workers: { data: [] as IWorkerListItem[], isLoading: false, isError: false },
  payments: { data: [] as IPaymentListItem[], isLoading: false, isError: false },
}));

vi.mock("@/hooks/queries/useUsers", () => ({
  useUsers: () => h.users,
  usersKey: ["users"],
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

import ManagerDashboard from "./ManagerDashboard";

const emp = (over: Partial<IEmployee> = {}): IEmployee => ({
  id: 1,
  email: "a@b.co",
  name: "Alice",
  role: ROLES.COMPANY_WORKER,
  isActive: true,
  ...over,
});

const prop = (id: number): IPropertyListItem => ({ id }) as IPropertyListItem;

const worker = (id: number): IWorkerListItem => ({ id }) as IWorkerListItem;

const renderDash = () =>
  render(
    <MemoryRouter>
      <ManagerDashboard />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.users = { data: [], isLoading: false, isError: false };
  h.properties = { data: [], isLoading: false, isError: false };
  h.workers = { data: [], isLoading: false, isError: false };
  h.payments = { data: [], isLoading: false, isError: false };
});

describe("ManagerDashboard", () => {
  it("counts only active employees (excludes pending)", () => {
    h.users = {
      data: [emp(), emp({ id: 2 }), emp({ id: 3, isActive: false })],
      isLoading: false,
      isError: false,
    };
    renderDash();
    expect(screen.getByText("Active Employees")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows the apartment count", () => {
    h.properties = {
      data: [prop(1), prop(2), prop(3)],
      isLoading: false,
      isError: false,
    };
    renderDash();
    expect(screen.getByText("Apartments")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows the foreign worker count", () => {
    h.workers = {
      data: [worker(1), worker(2), worker(3), worker(4)],
      isLoading: false,
      isError: false,
    };
    renderDash();
    expect(screen.getByText("Foreign Workers")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders the three still-stubbed KPIs as 'Coming soon'", () => {
    renderDash();
    expect(screen.getByText("Urgent Tasks")).toBeInTheDocument();
    expect(screen.getByText("Expiring Documents")).toBeInTheDocument();
    expect(screen.getByText("Pending Reservations")).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
  });

  it("renders the Outstanding Payments table section (no longer a stub card)", () => {
    renderDash();
    // The section heading is present, and it is not one of the coming-soon cards.
    expect(screen.getByText("Outstanding Payments")).toBeInTheDocument();
    expect(screen.getByText("No outstanding payments.")).toBeInTheDocument();
  });

  it("links the live KPIs to their screens, and stubs are not links", () => {
    renderDash();
    const hrefs = screen
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/employees");
    expect(hrefs).toContain("/properties");
    expect(hrefs).toContain("/workers");
    // Only the three live KPIs are clickable.
    expect(hrefs).toHaveLength(3);
  });
});
