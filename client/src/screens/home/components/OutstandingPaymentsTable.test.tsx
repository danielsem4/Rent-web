import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import type { IPaymentListItem } from "@/common/types/payment";

const h = vi.hoisted(() => ({
  payments: {
    data: undefined as IPaymentListItem[] | undefined,
    isLoading: false,
    isError: false,
  },
}));

vi.mock("@/hooks/queries/usePayments", () => ({
  usePayments: () => h.payments,
  paymentsKey: ["payments"],
}));

import OutstandingPaymentsTable from "./OutstandingPaymentsTable";

const pay = (over: Partial<IPaymentListItem> = {}): IPaymentListItem => ({
  id: 1,
  companyId: 1,
  propertyId: 100,
  amount: 5000,
  dueDate: "2999-01-01T00:00:00.000Z", // far future → not overdue
  paidAt: null,
  status: "PENDING",
  property: { id: 100, city: "Tel Aviv", address: "1 Herzl St" },
  ...over,
});

const renderTable = () =>
  render(
    <MemoryRouter>
      <OutstandingPaymentsTable />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.payments = { data: [], isLoading: false, isError: false };
});

describe("OutstandingPaymentsTable", () => {
  it("renders a row per outstanding payment with its property", () => {
    h.payments = {
      data: [pay(), pay({ id: 2, property: { id: 200, city: "Haifa", address: "8 HaNassi Ave" } })],
      isLoading: false,
      isError: false,
    };
    renderTable();
    expect(screen.getByText("Tel Aviv")).toBeInTheDocument();
    expect(screen.getByText("8 HaNassi Ave")).toBeInTheDocument();
  });

  it("links the View (eye) action to the payment's property page", () => {
    h.payments = {
      data: [pay({ propertyId: 100 })],
      isLoading: false,
      isError: false,
    };
    renderTable();
    expect(screen.getByLabelText("View").closest("a")).toHaveAttribute(
      "href",
      "/properties/100",
    );
  });

  it("excludes PAID payments (only outstanding are shown)", () => {
    h.payments = {
      data: [
        pay({ id: 1, property: { id: 100, city: "Tel Aviv", address: "1 Herzl St" } }),
        pay({ id: 2, status: "PAID", property: { id: 200, city: "Haifa", address: "8 HaNassi Ave" } }),
      ],
      isLoading: false,
      isError: false,
    };
    renderTable();
    expect(screen.getByText("Tel Aviv")).toBeInTheDocument();
    expect(screen.queryByText("Haifa")).not.toBeInTheDocument();
  });

  it("flags a past-due payment as Overdue", () => {
    h.payments = {
      data: [pay({ dueDate: "2020-01-01T00:00:00.000Z" })],
      isLoading: false,
      isError: false,
    };
    renderTable();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is outstanding", () => {
    h.payments = { data: [pay({ status: "PAID" })], isLoading: false, isError: false };
    renderTable();
    expect(screen.getByText("No outstanding payments.")).toBeInTheDocument();
  });

  it("shows an error message when the query fails", () => {
    h.payments = { data: undefined, isLoading: false, isError: true };
    renderTable();
    expect(screen.getByText("Could not load payments.")).toBeInTheDocument();
  });
});
