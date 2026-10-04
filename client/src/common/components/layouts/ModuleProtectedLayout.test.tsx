import { describe, it, expect, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { MODULE_KEYS } from "@/common/types/module";
import type { IUser } from "@/common/types/user";
import ModuleProtectedLayout from "./ModuleProtectedLayout";

const makeUser = (enabledModules: string[]): IUser => ({
  id: 1,
  email: "manager@rentplus.dev",
  name: "Manager",
  role: ROLES.COMPANY_MANAGER,
  companyId: 1,
  enabledModules,
});

const renderAt = (path: string) => {
  const router = createMemoryRouter(
    [
      {
        element: <ModuleProtectedLayout module={MODULE_KEYS.CORE_RENT} />,
        children: [{ path: "/properties", element: <div>PROPERTIES_LIST</div> }],
      },
      { path: "/login", element: <div>LOGIN_SCREEN</div> },
      { path: "/forbidden", element: <div>FORBIDDEN_SCREEN</div> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
};

describe("ModuleProtectedLayout", () => {
  beforeEach(() => {
    cleanup();
    useAuthStore.setState({ user: null, userId: null });
  });

  it("redirects to /login when no user is in memory", () => {
    renderAt("/properties");
    expect(screen.getByText("LOGIN_SCREEN")).toBeInTheDocument();
  });

  it("renders the route when the company is entitled to the module", () => {
    useAuthStore.setState({ user: makeUser([MODULE_KEYS.CORE_RENT]), userId: 1 });
    renderAt("/properties");
    expect(screen.getByText("PROPERTIES_LIST")).toBeInTheDocument();
  });

  it("bounces to /forbidden when the module is not entitled", () => {
    useAuthStore.setState({ user: makeUser([MODULE_KEYS.FOREIGN_WORKERS]), userId: 1 });
    renderAt("/properties");
    expect(screen.getByText("FORBIDDEN_SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("PROPERTIES_LIST")).not.toBeInTheDocument();
  });

  it("bounces to /forbidden when the company has no modules", () => {
    useAuthStore.setState({ user: makeUser([]), userId: 1 });
    renderAt("/properties");
    expect(screen.getByText("FORBIDDEN_SCREEN")).toBeInTheDocument();
  });
});
