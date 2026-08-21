import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@/i18n";
import type { IWorkerDocument } from "@/common/types/workerDocument";

const h = vi.hoisted(() => ({
  list: { data: [] as IWorkerDocument[], isLoading: false, isError: false },
}));

vi.mock("../hooks/queries/useWorkerDocuments", () => ({
  useWorkerDocuments: () => h.list,
  workerDocumentsKey: (id: number) => ["workers", id, "documents"],
}));
vi.mock("../hooks/queries/useWorkerDocumentMutations", () => ({
  useUploadWorkerDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteWorkerDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useDownloadWorkerDocument: () => vi.fn(),
}));

import WorkerDocuments from "./WorkerDocuments";

const doc = (over: Partial<IWorkerDocument> = {}): IWorkerDocument => ({
  id: 1,
  workerId: 5,
  docType: "PASSPORT",
  originalName: "passport.png",
  mimeType: "image/png",
  size: 2048,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  cleanup();
  h.list = { data: [], isLoading: false, isError: false };
});

describe("WorkerDocuments", () => {
  it("shows the upload drop zone for a writer", () => {
    render(<WorkerDocuments workerId={5} canWrite={true} />);
    expect(screen.getByText("Drag a file here, or click to choose")).toBeInTheDocument();
  });

  it("hides the drop zone for a non-writer (UX gating)", () => {
    render(<WorkerDocuments workerId={5} canWrite={false} />);
    expect(screen.queryByText("Drag a file here, or click to choose")).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no documents", () => {
    render(<WorkerDocuments workerId={5} canWrite={true} />);
    expect(screen.getByText("No documents uploaded yet.")).toBeInTheDocument();
  });

  it("lists documents with a download action", () => {
    h.list = { data: [doc(), doc({ id: 2, originalName: "visa.pdf", docType: "VISA" })], isLoading: false, isError: false };
    render(<WorkerDocuments workerId={5} canWrite={true} />);
    expect(screen.getByText("passport.png")).toBeInTheDocument();
    expect(screen.getByText("visa.pdf")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Download").length).toBe(2);
    // Writers also get a delete affordance per row.
    expect(screen.getAllByLabelText("Delete").length).toBe(2);
  });

  it("hides delete controls for a non-writer but still allows download", () => {
    h.list = { data: [doc()], isLoading: false, isError: false };
    render(<WorkerDocuments workerId={5} canWrite={false} />);
    expect(screen.getByLabelText("Download")).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });
});
