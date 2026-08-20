import { describe, it, expect, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import GuestOnlyLayout from "./GuestOnlyLayout";
import type { IUser } from "@/common/types/user";

const user: IUser = {
  id: 1,
  email: "super@rentplus.dev",
  name: "Super",
  role: "SUPER_ADMIN",
};

const renderAt = (path: string) => {
  const router = createMemoryRouter(
    [
      {
        element: <GuestOnlyLayout />,
        children: [{ path: "/login", element: <div>LOGIN_SCREEN</div> }],
      },
      { path: "/", element: <div>HOME_SCREEN</div> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
};

describe("GuestOnlyLayout", () => {
  beforeEach(() => {
    cleanup();
    useAuthStore.setState({ user: null, userId: null });
  });

  it("renders the child screen for a guest (no user in memory)", () => {
    renderAt("/login");
    expect(screen.getByText("LOGIN_SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("HOME_SCREEN")).not.toBeInTheDocument();
  });

  it("redirects an authenticated user away from /login to home", () => {
    useAuthStore.setState({ user, userId: user.id });
    renderAt("/login");
    expect(screen.getByText("HOME_SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("LOGIN_SCREEN")).not.toBeInTheDocument();
  });
});
