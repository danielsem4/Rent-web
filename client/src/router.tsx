import { createBrowserRouter } from "react-router-dom";
import Login from "@/screens/login/Login";
import Properties from "@/screens/properties/Properties";
import PropertyDetails from "@/screens/properties/PropertyDetails";
import Companies from "@/screens/companies/Companies";
import CompanyDetails from "@/screens/companies/CompanyDetails";
import Settings from "@/screens/settings/Settings";
import NotFound from "@/screens/not-found/NotFound";
import ProtectedLayout from "@/common/components/layouts/ProtectedLayout";
import RequireNonSuperAdmin from "@/common/components/layouts/RequireNonSuperAdmin";
import RouteError from "@/common/components/RouteError";

export const router = createBrowserRouter([
  { path: "/login", element: <Login />, errorElement: <RouteError /> },
  {
    path: "/",
    element: <ProtectedLayout />,
    errorElement: <RouteError />,
    children: [
      {
        element: <RequireNonSuperAdmin />,
        children: [
          { index: true, element: <Properties /> },
          { path: "properties/:id", element: <PropertyDetails /> },
        ],
      },
      { path: "companies", element: <Companies /> },
      { path: "companies/:id", element: <CompanyDetails /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
