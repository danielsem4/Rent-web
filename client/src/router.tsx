import { createBrowserRouter } from "react-router-dom";
import Login from "@/screens/login/Login";
import Home from "@/screens/home/Home";
import NotFound from "@/screens/not-found/NotFound";
import ProtectedLayout from "@/common/components/layouts/ProtectedLayout";
import RouteError from "@/common/components/RouteError";

export const router = createBrowserRouter([
  { path: "/login", element: <Login />, errorElement: <RouteError /> },
  {
    path: "/",
    element: <ProtectedLayout />,
    errorElement: <RouteError />,
    children: [{ index: true, element: <Home /> }],
  },
  { path: "*", element: <NotFound /> },
]);
