import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import { ROLES } from "@/common/types/role";
import type { IEmployee } from "@/common/types/user";

const h = vi.hoisted(() => ({
  users: {
    data: undefined as IEmployee[] | undefined,
    isLoading: false,
    isError: false,
  },
}));

vi.mock("@/hooks/queries/useUsers", () => ({
  useUsers: () => h.users,
  usersKey: ["users"],
}));

import Employees from "./Employees";

const emp = (over: Partial<IEmployee> = {}): IEmployee => ({
  id: 1,
  email: "alice@acme.co",
  name: "Alice",
  role: ROLES.COMPANY_MANAGER,
  isActive: true,
  ...over,
});

const renderScreen = () =>
  render(
    <MemoryRouter>
      <Employees />
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  h.users = { data: [], isLoading: false, isError: false };
});

describe("Employees list", () => {
  it("renders a row per employee with role and status", () => {
    h.users = {
      data: [
        emp(),
        emp({ id: 2, name: "Bob", email: "bob@acme.co", role: ROLES.COMPANY_WORKER, isActive: false }),
      ],
      isLoading: false,
      isError: false,
    };
    renderScreen();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("bob@acme.co")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    // Human-readable role labels, not raw enum values.
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Worker")).toBeInTheDocument();
  });

  it("shows the empty state when there are no employees", () => {
    renderScreen();
    expect(screen.getByText("No employees yet.")).toBeInTheDocument();
  });

  it("shows an error message when the query fails", () => {
    h.users = { data: undefined, isLoading: false, isError: true };
    renderScreen();
    expect(screen.getByText("Could not load employees.")).toBeInTheDocument();
  });
});
