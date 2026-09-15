import { createBrowserRouter } from "react-router-dom";
import Login from "@/screens/login/Login";
import MfaChallenge from "@/screens/mfa/MfaChallenge";
import Home from "@/screens/home/Home";
import Settings from "@/screens/settings/Settings";
import Properties from "@/screens/properties/Properties";
import PropertyForm from "@/screens/properties/PropertyForm";
import PropertyDetail from "@/screens/properties/PropertyDetail";
import Workers from "@/screens/workers/Workers";
import WorkerForm from "@/screens/workers/WorkerForm";
import WorkerDetail from "@/screens/workers/WorkerDetail";
import Employees from "@/screens/employees/Employees";
import NotFound from "@/screens/not-found/NotFound";
import Forbidden from "@/screens/forbidden/Forbidden";
import ProtectedLayout from "@/common/components/layouts/ProtectedLayout";
import GuestOnlyLayout from "@/common/components/layouts/GuestOnlyLayout";
import RoleProtectedLayout from "@/common/components/layouts/RoleProtectedLayout";
import RouteError from "@/common/components/RouteError";
import { ROLES } from "@/common/types/role";

export const router = createBrowserRouter([
  {
    element: <GuestOnlyLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <Login /> },
      { path: "/login/mfa", element: <MfaChallenge /> },
    ],
  },
  {
    path: "/",
    element: <ProtectedLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: "settings", element: <Settings /> },
      { path: "forbidden", element: <Forbidden /> },
      // Properties: mirror the server's authorization. Read (list) is open to
      // company managers + workers; writes (new/edit) to managers only. Everyone
      // else (SUPER_ADMIN / RENTER) is bounced to /forbidden by the guards.
      {
        element: (
          <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER, ROLES.COMPANY_WORKER]} />
        ),
        children: [
          { path: "properties", element: <Properties /> },
          { path: "properties/:id", element: <PropertyDetail /> },
          {
            element: <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER]} />,
            children: [
              { path: "properties/new", element: <PropertyForm /> },
              { path: "properties/:id/edit", element: <PropertyForm /> },
            ],
          },
        ],
      },
      // Foreign Workers: same authorization as properties. Read (list/detail) is
      // open to company managers + workers; writes (new/edit) to managers only.
      {
        element: (
          <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER, ROLES.COMPANY_WORKER]} />
        ),
        children: [
          { path: "workers", element: <Workers /> },
          { path: "workers/:id", element: <WorkerDetail /> },
          {
            element: <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER]} />,
            children: [
              { path: "workers/new", element: <WorkerForm /> },
              { path: "workers/:id/edit", element: <WorkerForm /> },
            ],
          },
        ],
      },
      // Employees: manager-only, mirroring the server (GET /api/users is
      // COMPANY_MANAGER-gated). Everyone else is bounced to /forbidden.
      {
        element: <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER]} />,
        children: [{ path: "employees", element: <Employees /> }],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
