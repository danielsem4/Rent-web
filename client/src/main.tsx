import "./index.css";
import "./i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { router } from "./router";
import { useThemeStore } from "./store/useThemeStore";

// Touch the theme store so persist rehydrates and applyTheme() runs on load,
// keeping the <html> `dark` class in sync with the persisted preference.
// (index.html already applied it pre-paint to avoid a flash.)
useThemeStore.getState();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60 * 1000 } },
});

const rootEl = document.getElementById("root")!;

try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </React.StrictMode>,
  );
} catch (err) {
  // A throw here means the app never mounted (e.g. an init-time crash a React
  // error boundary can't catch). Surface it instead of a blank white screen.
  rootEl.textContent = `Something went wrong while starting the app: ${
    err instanceof Error ? err.message : String(err)
  }`;
  throw err;
}
