import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";

// The create flow now awaits the created property (mutateAsync) so it can upload
// any staged gallery images to the new id before navigating.
const createSpy = vi.fn(async (input) => ({ id: 1, ...input }));
const uploadImagesSpy = vi.fn(async () => ({ failed: 0 }));

vi.mock("./hooks/queries/useProperties", () => ({
  useProperty: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("./hooks/queries/usePropertyMutations", () => ({
  useCreateProperty: () => ({ mutateAsync: createSpy, isPending: false }),
  useUpdateProperty: () => ({ mutate: vi.fn(), isPending: false }),
}));
// The image uploader components pull in react-query + dropzone; stub the batch
// upload hook so the form renders without a QueryClient in this unit test.
vi.mock("./hooks/queries/usePropertyImageMutations", () => ({
  useUploadPropertyImages: () => uploadImagesSpy,
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
    // An untouched advance-notice field is stripped (undefined), not sent as NaN/0.
    expect(payload).not.toHaveProperty("advanceNoticeDays");
  });

  it("submits advanceNoticeDays as a number when provided", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Haifa" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "5 Ben Gurion" } });
    fireEvent.change(screen.getByLabelText("Advance notice (days)"), { target: { value: "60" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy.mock.calls[0][0]).toMatchObject({ advanceNoticeDays: 60 });
  });
});
