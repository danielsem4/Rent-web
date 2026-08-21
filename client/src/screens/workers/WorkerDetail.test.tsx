import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import "@/i18n";
import type { IWorker } from "@/common/types/worker";

const h = vi.hoisted(() => ({
  role: "COMPANY_MANAGER" as string,
  query: {
    data: undefined as IWorker | undefined,
    isLoading: false,
    isError: false,
  },
}));

vi.mock("./hooks/queries/useWorkers", () => ({
  useWorker: () => h.query,
  workersKey: ["workers"],
}));
vi.mock("@/screens/properties/hooks/queries/useProperties", () => ({
  useProperties: () => ({ data: [{ id: 7, city: "Tel Aviv", address: "1 Herzl St" }] }),
}));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: h.role } }),
}));
// The documents section is exercised by its own test (it uses react-query);
// stub it here so the detail test stays focused and needs no QueryClient.
vi.mock("./components/WorkerDocuments", () => ({
  default: () => null,
}));

import WorkerDetail from "./WorkerDetail";

const worker = (over: Partial<IWorker> = {}): IWorker => ({
  id: 1,
  companyId: 1,
  nameHe: "סיריפורן",
  nameEn: "Siriporn",
  nationality: "Thailand",
  entryDate: "2026-01-01T00:00:00.000Z",
  preferredLanguage: "th",
  passportNumber: "TH-PASSPORT-0001",
  passportExpiry: "2027-01-01T00:00:00.000Z",
  visaType: "B1",
  visaExpiry: "2027-01-01T00:00:00.000Z",
  insuranceProvider: "Harel",
  insurancePolicyNumber: "POLICY-7788",
  insuranceCoverageType: "Full",
  insuranceExpiry: "2027-01-01T00:00:00.000Z",
  phone: "050-0000000",
  employer: "Farm Ltd",
  propertyId: 7,
  notes: "—",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={["/workers/1"]}>
      <Routes>
        <Route path="/workers/:id" element={<WorkerDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.role = "COMPANY_MANAGER";
  h.query = { data: worker(), isLoading: false, isError: false };
});

describe("WorkerDetail", () => {
  it("reveals the decrypted identifier numbers and apartment on their tabs", () => {
    renderDetail();
    // Hero renders regardless of the active tab.
    expect(screen.getByText("Siriporn")).toBeInTheDocument();

    // Passport number lives on the Documents tab.
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getByText("TH-PASSPORT-0001")).toBeInTheDocument();

    // Policy number lives on the Insurance tab.
    fireEvent.click(screen.getByRole("button", { name: "Medical insurance" }));
    expect(screen.getByText("POLICY-7788")).toBeInTheDocument();

    // Resolved apartment lives on the Contact tab.
    fireEvent.click(screen.getByRole("button", { name: "Contact & apartment" }));
    expect(screen.getByText("Tel Aviv, 1 Herzl St")).toBeInTheDocument();
  });

  it("shows a 'valid' health badge and the seniority tile when all documents are in date", () => {
    renderDetail();
    expect(screen.getByText("Documents valid")).toBeInTheDocument();
    expect(screen.getByText("System status")).toBeInTheDocument();
  });

  it("flags an expired document in the badge, tab count and attention card", () => {
    h.query = {
      data: worker({ passportExpiry: "2020-01-01T00:00:00.000Z" }),
      isLoading: false,
      isError: false,
    };
    renderDetail();
    expect(screen.getByText("Documents expired")).toBeInTheDocument();
    expect(screen.getByText("Attention required")).toBeInTheDocument();
    // The Documents tab carries a "1" count badge.
    expect(screen.getByRole("button", { name: /Documents/ })).toHaveTextContent("1");
  });

  it("shows an Edit link for a manager", () => {
    renderDetail();
    expect(screen.getByText("Edit").closest("a")).toHaveAttribute("href", "/workers/1/edit");
  });

  it("hides the Edit link for a worker (UX gating)", () => {
    h.role = "COMPANY_WORKER";
    renderDetail();
    expect(screen.getByText("Siriporn")).toBeInTheDocument();
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
    expect(screen.getByText("Could not load workers.")).toBeInTheDocument();
    expect(screen.getByText("Back").closest("a")).toHaveAttribute("href", "/workers");
  });
});
