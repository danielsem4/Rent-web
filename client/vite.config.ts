import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // jest-dom matchers + a working Storage polyfill (jsdom's default is unusable
    // under its opaque origin, which breaks modules reading persisted state).
    setupFiles: ["./src/test/setup.ts"],
  },
  server: {
    proxy: {
      // Proxy API calls to the rent+ server (see server/.env PORT).
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
        cookieDomainRewrite: "localhost",
      },
    },
  },
});
