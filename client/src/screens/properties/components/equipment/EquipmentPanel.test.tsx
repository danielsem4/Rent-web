import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@/i18n";
import type { IPropertyEquipment } from "@/common/types/propertyEquipment";

const h = vi.hoisted(() => ({
  rows: [] as IPropertyEquipment[],
  createMutate: vi.fn(),
  deleteMutate: vi.fn(),
}));

vi.mock("../../hooks/queries/usePropertyEquipment", () => ({
  usePropertyEquipment: () => ({ data: h.rows, isLoading: false, isError: false }),
  useCreateEquipment: () => ({ mutate: h.createMutate, isPending: false }),
  useDeleteEquipment: () => ({ mutate: h.deleteMutate, isPending: false }),
}));

import { EquipmentPanel } from "./EquipmentPanel";

const item = (over: Partial<IPropertyEquipment> = {}): IPropertyEquipment => ({
  id: 1,
  companyId: 1,
  propertyId: 1,
  name: "Fridge",
  quantity: 2,
  condition: "GOOD",
  serialNumber: "SN-1",
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  cleanup();
  h.rows = [];
  h.createMutate = vi.fn();
  h.deleteMutate = vi.fn();
});

describe("EquipmentPanel", () => {
  it("shows the empty state when there is no equipment", () => {
    render(<EquipmentPanel propertyId={1} canWrite />);
    expect(screen.getByText("No equipment recorded yet.")).toBeInTheDocument();
  });

  it("renders equipment rows for a manager", () => {
    h.rows = [item()];
    render(<EquipmentPanel propertyId={1} canWrite />);
    expect(screen.getByText("Fridge")).toBeInTheDocument();
    expect(screen.getByText("SN-1")).toBeInTheDocument();
  });

  it("submits the add form with the entered values", () => {
    render(<EquipmentPanel propertyId={1} canWrite />);
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "Washer" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(h.createMutate).toHaveBeenCalledTimes(1);
    expect(h.createMutate.mock.calls[0][0]).toMatchObject({ name: "Washer" });
  });

  it("hides the add form and row actions for a non-manager (UX gating)", () => {
    h.rows = [item()];
    render(<EquipmentPanel propertyId={1} canWrite={false} />);
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove item" })).not.toBeInTheDocument();
  });
});
