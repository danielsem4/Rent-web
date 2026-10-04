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
import Companies from "@/screens/admin/Companies";
import CompanyForm from "@/screens/admin/CompanyForm";
import CompanyDetail from "@/screens/admin/CompanyDetail";
import NotFound from "@/screens/not-found/NotFound";
import Forbidden from "@/screens/forbidden/Forbidden";
import ProtectedLayout from "@/common/components/layouts/ProtectedLayout";
import GuestOnlyLayout from "@/common/components/layouts/GuestOnlyLayout";
import RoleProtectedLayout from "@/common/components/layouts/RoleProtectedLayout";
import ModuleProtectedLayout from "@/common/components/layouts/ModuleProtectedLayout";
import RouteError from "@/common/components/RouteError";
import { ROLES } from "@/common/types/role";
import { MODULE_KEYS } from "@/common/types/module";

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
      // Properties: mirror the server's authorization AND module entitlement. Read
      // (list) is open to company managers + workers; writes (new/edit) to managers
      // only. The whole subtree also requires the core-rent module (companies
      // without it are bounced to /forbidden — UX mirror of requireModule).
      {
        element: (
          <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER, ROLES.COMPANY_WORKER]} />
        ),
        children: [
          {
            element: <ModuleProtectedLayout module={MODULE_KEYS.CORE_RENT} />,
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
        ],
      },
      // Foreign Workers: same authorization as properties, plus the foreign-workers
      // module entitlement for the whole subtree.
      {
        element: (
          <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER, ROLES.COMPANY_WORKER]} />
        ),
        children: [
          {
            element: <ModuleProtectedLayout module={MODULE_KEYS.FOREIGN_WORKERS} />,
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
        ],
      },
      // Employees: manager-only, mirroring the server (GET /api/users is
      // COMPANY_MANAGER-gated). Everyone else is bounced to /forbidden.
      {
        element: <RoleProtectedLayout roles={[ROLES.COMPANY_MANAGER]} />,
        children: [{ path: "employees", element: <Employees /> }],
      },
      // Platform administration: SUPER_ADMIN only. Company + feature-module
      // management (no module gate — platform admin is not a tenant feature).
      {
        element: <RoleProtectedLayout roles={[ROLES.SUPER_ADMIN]} />,
        children: [
          { path: "admin/companies", element: <Companies /> },
          { path: "admin/companies/new", element: <CompanyForm /> },
          { path: "admin/companies/:id", element: <CompanyDetail /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
