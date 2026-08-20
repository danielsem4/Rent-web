import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";

const createSpy = vi.fn();

vi.mock("./hooks/queries/useProperties", () => ({
  useProperty: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("./hooks/queries/usePropertyMutations", () => ({
  useCreateProperty: () => ({ mutate: createSpy, isPending: false }),
  useUpdateProperty: () => ({ mutate: vi.fn(), isPending: false }),
}));

import PropertyForm from "./PropertyForm";

const renderForm = () =>
  render(
    <MemoryRouter initialEntries={["/properties/new"]}>
      <PropertyForm />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  createSpy.mockClear();
});

describe("PropertyForm (create)", () => {
  it("renders the new-property title", () => {
    renderForm();
    expect(screen.getByText("New property")).toBeInTheDocument();
  });

  it("blocks submit and shows errors when required fields are empty", async () => {
    renderForm();
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText("City is required")).toBeInTheDocument();
    expect(screen.getByText("Address is required")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("submits a stripped payload (no empty optionals) when valid", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Haifa" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "5 Ben Gurion" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    const payload = createSpy.mock.calls[0][0];
    expect(payload).toMatchObject({ city: "Haifa", address: "5 Ben Gurion" });
    // Empty optional strings are stripped, not sent as "".
    expect(payload).not.toHaveProperty("entryCode");
    expect(payload).not.toHaveProperty("notes");
  });
});
