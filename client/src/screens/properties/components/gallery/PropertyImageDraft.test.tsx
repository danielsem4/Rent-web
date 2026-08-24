import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@/i18n";
import PropertyImageDraft from "./PropertyImageDraft";
import type { StagedImage } from "../../lib/imageUpload";

// jsdom doesn't implement object-URL APIs; the component creates/revokes them.
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
});

function staged(): StagedImage[] {
  return [
    { uid: "a", file: new File(["x"], "front.jpg", { type: "image/jpeg" }), previewUrl: "blob:a" },
    { uid: "b", file: new File(["y"], "yard.png", { type: "image/png" }), previewUrl: "blob:b" },
  ];
}

beforeEach(() => cleanup());

describe("PropertyImageDraft — click to enlarge", () => {
  it("opens a full-screen viewer for the clicked staged image and closes it", () => {
    render(<PropertyImageDraft staged={staged()} onChange={() => {}} canWrite />);

    // No dialog initially.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Each staged tile is a button labeled by its filename; click the first.
    fireEvent.click(screen.getByRole("button", { name: "front.jpg" }));

    const dialog = screen.getByRole("dialog", { name: "front.jpg" });
    expect(dialog).toBeInTheDocument();
    // The enlarged image renders from the local preview URL (not a server URL).
    const enlarged = within(dialog).getByRole("img", { name: "front.jpg" });
    expect(enlarged).toHaveAttribute("src", "blob:a");

    // Escape closes it.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
