import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import type { IProperty } from "@/common/types/property";
import type { IWorkerListItem } from "@/common/types/worker";

// Shared, hoisted state the mocked hooks close over.
const h = vi.hoisted(() => ({
  workers: [] as IWorkerListItem[],
  assign: vi.fn(),
  unassign: vi.fn(),
}));

vi.mock("@/screens/workers/hooks/queries/useWorkers", () => ({
  useWorkers: () => ({ data: h.workers, isLoading: false, isError: false }),
  workersKey: ["workers"],
}));
vi.mock("@/screens/properties/hooks/queries/usePropertyWorkerMutations", () => ({
  useAssignWorkerToProperty: () => ({ mutate: h.assign, isPending: false }),
  useUnassignWorker: () => ({ mutate: h.unassign, isPending: false }),
}));

import { WorkersPanel } from "./WorkersPanel";

const property = (over: Partial<IProperty> = {}): IProperty => ({
  id: 1,
  companyId: 1,
  city: "Tel Aviv",
  address: "1 Herzl St",
  entryCode: null,
  electricMeter: null,
  waterMeter: null,
  ownerName: null,
  ownerPhone: null,
  contractStart: null,
  contractEnd: null,
  monthlyRent: 5000,
  rooms: null,
  maxCapacity: 2,
  total: 0,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const worker = (over: Partial<IWorkerListItem> = {}): IWorkerListItem => ({
  id: 10,
  companyId: 1,
  nameHe: "עובד",
  nameEn: "Worker",
  nationality: "Thailand",
  propertyId: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const renderPanel = (canWrite: boolean, prop: IProperty) =>
  render(
    <MemoryRouter>
      <WorkersPanel property={prop} canWrite={canWrite} />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.workers = [];
  h.assign.mockReset();
  h.unassign.mockReset();
});

describe("WorkersPanel", () => {
  it("shows an occupancy hint reflecting the live worker count", () => {
    h.workers = [worker(), worker({ id: 11 })];
    renderPanel(true, property({ maxCapacity: 3 }));
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument();
  });

  it("enables 'Add worker' for a manager when the property has room", () => {
    h.workers = [worker()];
    renderPanel(true, property({ maxCapacity: 2 }));
    expect(screen.getByRole("button", { name: /add worker/i })).toBeEnabled();
  });

  it("disables 'Add worker' when the property is at capacity", () => {
    h.workers = [worker(), worker({ id: 11 })];
    renderPanel(true, property({ maxCapacity: 2 }));
    expect(screen.getByRole("button", { name: /add worker/i })).toBeDisabled();
  });

  it("hides add/unassign controls for a non-manager", () => {
    h.workers = [worker()];
    renderPanel(false, property());
    expect(screen.queryByRole("button", { name: /add worker/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unassign/i })).not.toBeInTheDocument();
  });

  it("unassigns a worker after confirming the dialog", () => {
    h.workers = [worker({ id: 42 })];
    renderPanel(true, property());
    // Open the per-row confirmation, then confirm.
    fireEvent.click(screen.getByRole("button", { name: /unassign/i }));
    const confirms = screen.getAllByRole("button", { name: /unassign/i });
    fireEvent.click(confirms[confirms.length - 1]);
    expect(h.unassign).toHaveBeenCalledWith(42);
  });
});
