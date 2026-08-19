# rent+ Client — Architecture Rules

Vite 7 + React 19 + TypeScript SPA. Talks to the rent+ server over cookie-based auth at `/api/*` (proxied to the backend in dev). Pure client — no SSR.

## Stack (do not swap without discussion)

- **Build**: Vite 7 + `@vitejs/plugin-react`. **Lang**: TypeScript (strict, `verbatimModuleSyntax`).
- **Routing**: `react-router-dom` v7 (`createBrowserRouter`).
- **Server state**: `@tanstack/react-query` v5 (default `staleTime: 60s`).
- **Client state**: `zustand` v5 with `persist`.
- **HTTP**: `axios` singleton in `src/lib/axios.ts` (`withCredentials`, 401→refresh queued-retry interceptor).
- **Forms**: `react-hook-form` + `@hookform/resolvers` + `zod` v4.
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui (new-york) in `src/components/ui`; `cn()` in `src/lib/utils.ts`; oklch design tokens in `src/index.css`.
- **i18n**: `i18next` + `react-i18next`, locales `en/he/ar/ru`, RTL handled in `src/i18n/index.ts`.
- Also available: recharts, dnd-kit, sonner (toasts), xlsx/file-saver, react-dropzone, input-otp, lucide icons.
- **Tests**: Vitest + Testing Library, jsdom, colocated `*.test.ts(x)`.

## Folder structure

- **Folder-by-feature** under `src/screens/<feature>/` for anything screen-specific.
- **Folder-by-type** for cross-cutting code: `api/`, `lib/`, `store/`, `hooks/`, `i18n/`, `common/`, `components/`.

```
src/
  main.tsx            # QueryClientProvider + RouterProvider + <Toaster/>; imports index.css + ./i18n
  router.tsx          # createBrowserRouter: public routes + <ProtectedLayout/> outlet + '*' NotFound
  index.css           # Tailwind v4 + oklch tokens + .dark variant
  api/                # typed axios wrappers, one <domain>Api.ts per domain
  lib/                # axios.ts (singleton + interceptor), utils.ts (cn())
  store/              # zustand persisted stores (useAuthStore, useThemeStore, useLanguageStore)
  hooks/              # common/ (app-wide) + queries/ (cross-screen react-query hooks)
  i18n/               # index.ts + locales/
  common/             # components/ (layouts/, shared widgets), types/, utils/, constants/
  components/ui/      # shadcn/ui primitives
  screens/<feature>/  # <Feature>.tsx + components/ + hooks/queries/ + schema/ + lib/
```

## The layering rule (MANDATORY)

Data flows one direction, and each layer has one job:

```
axios singleton  →  api/<domain>Api.ts  →  react-query hooks  →  feature hooks  →  thin screen components
```

- `api/*Api.ts` = thin typed axios calls only (no React).
- react-query hooks (`useXxxQuery` / `useXxxMutation`) wrap the api functions and own caching, invalidation, navigation-on-success.
- Screens stay presentational; business logic lives in hooks.
- **Auth**: cookie-based. `useAuthStore` holds identity (persisted, partialized to `{ userId }`); the full user is re-fetched via `/me` in `useInitAuth`, which `ProtectedLayout` uses to gate routes. The axios interceptor handles 401 → `/auth/refresh` → retry, and on failure logs out + redirects.

## Conventions

- **Import alias `@/` → `src/`** everywhere; relative imports only within a feature.
- **Naming**: components `PascalCase.tsx`; hooks `useXxx.ts`; api `xxxApi.ts`; zod schemas `xxxSchema.ts`; stores `useXxxStore.ts`; folders `kebab-case`.
- **Types**: interfaces `I`-prefixed (`IUser`); shared domain types in `src/common/types/`. `verbatimModuleSyntax` requires `import type { … }` for type-only imports.
- **No barrel files** — import concrete modules.
- **Validation messages are i18n keys** (e.g. `login.errEmail`), resolved with `t()` at render.
- **Tests colocated** as `*.test.ts(x)`, run with Vitest.

## Commands

- `npm run dev` — Vite dev server on :5173, proxies `/api` → `http://localhost:5001` (the server).
- `npm run build` — `tsc -b && vite build`.
- `npm run lint` — ESLint. `npm test` — Vitest.

Run the server (`../server`) alongside for a working login flow. Seeded dev user: `super@rentplus.dev` / `password123`.
