import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@/i18n";
import type { IPropertyImage } from "@/common/types/propertyImage";

// Hooks are stubbed so the component renders without a QueryClient/network. The
// thumbnail + lightbox are stubbed too (they fetch blobs via react-query).
const mutate = vi.fn();
let listData: IPropertyImage[] = [];

vi.mock("../../hooks/queries/usePropertyImages", () => ({
  usePropertyImages: () => ({ data: listData, isLoading: false, isError: false }),
}));
vi.mock("../../hooks/queries/usePropertyImageMutations", () => ({
  useUploadPropertyImage: () => ({ mutate, isPending: false }),
  useDeletePropertyImage: () => ({ mutate, isPending: false }),
}));
vi.mock("./PropertyImageThumb", () => ({
  PropertyImageThumb: ({ alt }: { alt: string }) => <div data-testid="thumb">{alt}</div>,
}));
vi.mock("./Lightbox", () => ({ Lightbox: () => null }));

import PropertyImages from "./PropertyImages";

const image = (id: number): IPropertyImage => ({
  id,
  propertyId: 1,
  originalName: `pic-${id}.jpg`,
  mimeType: "image/jpeg",
  size: 100,
  createdAt: "2026-01-01T00:00:00.000Z",
});

beforeEach(() => {
  cleanup();
  mutate.mockClear();
  listData = [];
});

describe("PropertyImages — manage vs read-only", () => {
  it("shows the Add photos button and per-image delete for a manager", () => {
    listData = [image(1)];
    render(<PropertyImages propertyId={1} canWrite />);
    expect(screen.getByRole("button", { name: "Add photos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByTestId("thumb")).toBeInTheDocument();
  });

  it("hides Add photos and delete for a worker (read-only), still shows the image", () => {
    listData = [image(1)];
    render(<PropertyImages propertyId={1} canWrite={false} />);
    expect(screen.queryByRole("button", { name: "Add photos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByTestId("thumb")).toBeInTheDocument();
  });
});
