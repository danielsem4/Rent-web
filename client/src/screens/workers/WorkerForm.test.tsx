import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import "@/i18n";
import type { IWorker } from "@/common/types/worker";
import type { StagedDocument } from "./lib/documentUpload";

// The worker record returned by useWorker; undefined in create mode.
let workerData: IWorker | undefined;
const createMutateAsync = vi.fn();
const uploadSpy = vi.fn();

vi.mock("./hooks/queries/useWorkers", () => ({
  useWorker: () => ({ data: workerData, isLoading: false }),
}));
vi.mock("./hooks/queries/useWorkerMutations", () => ({
  useCreateWorker: () => ({ mutate: vi.fn(), mutateAsync: createMutateAsync, isPending: false }),
  useUpdateWorker: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./hooks/queries/useWorkerDocumentMutations", () => ({
  useUploadWorkerDocuments: () => uploadSpy,
}));
vi.mock("@/screens/properties/hooks/queries/useProperties", () => ({
  useProperties: () => ({ data: [] }),
}));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (sel: (s: { user: { role: string } }) => unknown) =>
    sel({ user: { role: "COMPANY_MANAGER" } }),
}));
// Stub the live uploader so its document hooks needn't be wired.
vi.mock("./components/WorkerDocuments", () => ({
  default: ({ workerId }: { workerId: number }) => (
    <div data-testid="worker-documents">docs:{workerId}</div>
  ),
}));
// Stub the staging uploader: exposes a button that stages one document so the
// submit path can be exercised without a real file drop.
vi.mock("./components/WorkerDocumentDraft", () => ({
  default: ({
    staged,
    onChange,
  }: {
    staged: StagedDocument[];
    onChange: (next: StagedDocument[]) => void;
  }) => (
    <div data-testid="doc-draft">
      <span>staged:{staged.length}</span>
      <button
        type="button"
        onClick={() =>
          onChange([
            { uid: "u1", file: new File(["x"], "p.png", { type: "image/png" }), docType: "PASSPORT" },
          ])
        }
      >
        seed-doc
      </button>
    </div>
  ),
}));

import WorkerForm from "./WorkerForm";

beforeEach(() => {
  cleanup();
  workerData = undefined;
  createMutateAsync.mockReset();
  uploadSpy.mockReset();
});

const fillRequired = () => {
  fireEvent.change(screen.getByLabelText("Name (Hebrew)"), { target: { value: "דוד" } });
  fireEvent.change(screen.getByLabelText("Name (English)"), { target: { value: "David" } });
  fireEvent.change(screen.getByLabelText("Nationality"), { target: { value: "Thai" } });
};

describe("WorkerForm — documents section", () => {
  it("shows the staging uploader (not the live one) when creating", () => {
    render(
      <MemoryRouter initialEntries={["/workers/new"]}>
        <WorkerForm />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("doc-draft")).toBeInTheDocument();
    expect(screen.queryByTestId("worker-documents")).not.toBeInTheDocument();
  });

  it("renders the live uploader (not the draft) when editing an existing worker", () => {
    workerData = { id: 5 } as IWorker;
    render(
      <MemoryRouter initialEntries={["/workers/5/edit"]}>
        <Routes>
          <Route path="/workers/:id/edit" element={<WorkerForm />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("worker-documents")).toHaveTextContent("docs:5");
    expect(screen.queryByTestId("doc-draft")).not.toBeInTheDocument();
  });

  it("uploads staged documents to the new worker's id after create", async () => {
    createMutateAsync.mockResolvedValue({ id: 7 });
    uploadSpy.mockResolvedValue({ failed: 0 });
    render(
      <MemoryRouter initialEntries={["/workers/new"]}>
        <WorkerForm />
      </MemoryRouter>,
    );
    fillRequired();
    fireEvent.click(screen.getByText("seed-doc"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
    const [workerId, docs] = uploadSpy.mock.calls[0];
    expect(workerId).toBe(7);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ docType: "PASSPORT" });
  });

  it("does not upload when no documents are staged", async () => {
    createMutateAsync.mockResolvedValue({ id: 8 });
    render(
      <MemoryRouter initialEntries={["/workers/new"]}>
        <WorkerForm />
      </MemoryRouter>,
    );
    fillRequired();
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
