import { describe, it, expect, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES, type Role } from "@/common/types/role";
import type { IUser } from "@/common/types/user";
import RoleProtectedLayout from "./RoleProtectedLayout";

const makeUser = (role: Role): IUser => ({
  id: 1,
  email: "user@rentplus.dev",
  name: "User",
  role,
});

/**
 * Renders the concrete Properties route tree: a read guard (MANAGER + WORKER)
 * wrapping the list, with a write guard (MANAGER only) nested for /properties/new.
 */
const renderAt = (path: string) => {
  const router = createMemoryRouter(
    [
      {
        element: <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER, ROLES.COMPANY_WORKER]} />,
        children: [
          { path: "/properties", element: <div>PROPERTIES_LIST</div> },
          {
            element: <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER]} />,
            children: [{ path: "/properties/new", element: <div>PROPERTY_FORM</div> }],
          },
        ],
      },
      { path: "/login", element: <div>LOGIN_SCREEN</div> },
      { path: "/forbidden", element: <div>FORBIDDEN_SCREEN</div> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
};

describe("RoleProtectedLayout", () => {
  beforeEach(() => {
    cleanup();
    useAuthStore.setState({ user: null, userId: null });
  });

  it("redirects to /login when no user is in memory", () => {
    renderAt("/properties");
    expect(screen.getByText("LOGIN_SCREEN")).toBeInTheDocument();
  });

  it("lets a COMPANY_WORKER read the properties list", () => {
    useAuthStore.setState({ user: makeUser(ROLES.COMPANY_WORKER), userId: 1 });
    renderAt("/properties");
    expect(screen.getByText("PROPERTIES_LIST")).toBeInTheDocument();
  });

  it("blocks a COMPANY_WORKER from the write route (/properties/new → 403)", () => {
    useAuthStore.setState({ user: makeUser(ROLES.COMPANY_WORKER), userId: 1 });
    renderAt("/properties/new");
    expect(screen.getByText("FORBIDDEN_SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("PROPERTY_FORM")).not.toBeInTheDocument();
  });

  it("lets a COMPANY_MANAGER reach both read and write routes", () => {
    useAuthStore.setState({ user: makeUser(ROLES.COMPANY_MANAGER), userId: 1 });
    renderAt("/properties");
    expect(screen.getByText("PROPERTIES_LIST")).toBeInTheDocument();
    cleanup();
    renderAt("/properties/new");
    expect(screen.getByText("PROPERTY_FORM")).toBeInTheDocument();
  });

  it("bounces a SUPER_ADMIN from properties entirely (403)", () => {
    useAuthStore.setState({ user: makeUser(ROLES.SUPER_ADMIN), userId: 1 });
    renderAt("/properties");
    expect(screen.getByText("FORBIDDEN_SCREEN")).toBeInTheDocument();
  });

  it("bounces a RENTER from properties entirely (403)", () => {
    useAuthStore.setState({ user: makeUser(ROLES.RENTER), userId: 1 });
    renderAt("/properties");
    expect(screen.getByText("FORBIDDEN_SCREEN")).toBeInTheDocument();
  });
});
