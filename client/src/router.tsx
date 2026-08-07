import { createBrowserRouter } from "react-router-dom";
import Login from "@/screens/login/Login";
import Home from "@/screens/home/Home";
import NotFound from "@/screens/not-found/NotFound";
import ProtectedLayout from "@/common/components/layouts/ProtectedLayout";

export const router = createBrowserRouter([
  { path: "/", element: <Login /> },
  {
    element: <ProtectedLayout />,
    children: [{ path: "home", element: <Home /> }],
  },
  { path: "*", element: <NotFound /> },
]);
