import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import type { IWorkerListItem } from "@/common/types/worker";

const h = vi.hoisted(() => ({
  workers: { data: [] as IWorkerListItem[], isLoading: false, isError: false },
}));

vi.mock("@/screens/workers/hooks/queries/useWorkers", () => ({
  useWorkers: () => h.workers,
  workersKey: ["workers"],
}));

import ExpiringDocumentsTable from "./ExpiringDocumentsTable";

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

const worker = (over: Partial<IWorkerListItem> = {}): IWorkerListItem =>
  ({
    id: 1,
    nameHe: "דנה",
    nameEn: "Dana",
    nationality: "PH",
    visaExpiry: null,
    passportExpiry: null,
    ...over,
  }) as IWorkerListItem;

const renderTable = () =>
  render(
    <MemoryRouter>
      <ExpiringDocumentsTable />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.workers = { data: [], isLoading: false, isError: false };
});

describe("ExpiringDocumentsTable", () => {
  it("shows the empty state when nothing is expiring", () => {
    h.workers = {
      data: [worker({ id: 1, visaExpiry: iso(200), passportExpiry: iso(300) })],
      isLoading: false,
      isError: false,
    };
    renderTable();
    expect(screen.getByText("No documents expired or expiring soon.")).toBeInTheDocument();
  });

  it("lists a worker whose visa expires within 30 days", () => {
    h.workers = {
      data: [worker({ id: 1, nameEn: "Dana", visaExpiry: iso(10), passportExpiry: iso(300) })],
      isLoading: false,
      isError: false,
    };
    renderTable();
    expect(screen.getByText("Dana")).toBeInTheDocument();
    expect(screen.getByText("Visa")).toBeInTheDocument();
  });

  it("surfaces the more-urgent document (passport before a later visa)", () => {
    h.workers = {
      data: [worker({ id: 1, nameEn: "Ravi", visaExpiry: iso(25), passportExpiry: iso(3) })],
      isLoading: false,
      isError: false,
    };
    renderTable();
    expect(screen.getByText("Ravi")).toBeInTheDocument();
    // The passport is nearer, so it — not the visa — names the row.
    expect(screen.getByText("Passport")).toBeInTheDocument();
    expect(screen.queryByText("Visa")).not.toBeInTheDocument();
  });
});
