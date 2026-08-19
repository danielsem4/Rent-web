# rent+ web

A two-part web application:

- **`client/`** — Vite 7 + React 19 + TypeScript SPA (react-router, react-query, zustand, axios, react-hook-form + zod, Tailwind v4 + shadcn/ui, i18next). Architecture mirrors `generic3HIT`.
- **`server/`** — Express 5 + TypeScript + Prisma 7 (PostgreSQL) REST API with JWT-in-httpOnly-cookie auth. Architecture mirrors `sheba/server`.

Each folder has its own `CLAUDE.md` documenting the architecture rules to follow when adding code.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local or remote)

## Run it locally

### 1. Server (`server/`)

```bash
cd server
cp .env.example .env          # then set DATABASE_URL + JWT_SECRET
npm install
npm run db:generate           # generate Prisma client
npm run db:migrate            # create tables (needs a running Postgres)
npm run db:seed               # seed dev user: super@rentplus.dev / password123
npm run dev                   # http://localhost:5001
```

> **Port note:** the server uses **5001**, not 5000 — on macOS the AirPlay Receiver
> (ControlCenter) holds port 5000 and returns 403 to everything.

### 2. Client (`client/`)

```bash
cd client
npm install
npm run dev                   # http://localhost:5173
```

The client dev server proxies `/api/*` → `http://localhost:5001`, so run the server
alongside it. Open http://localhost:5173 and sign in with the seeded credentials.

## Auth contract (shared between client & server)

1. `POST /api/auth/login` with `{ email, password }` → validates + sets an **httpOnly `token` cookie** (JWT, 8h) → returns `{ user }`.
2. `GET /api/auth/me` → returns the current user (requires the cookie).
3. `POST /api/auth/refresh` → re-issues the cookie from a valid token.
4. `POST /api/auth/logout` → clears the cookie.

The client `axios` instance sends the cookie automatically (`withCredentials`) and, on a
401, transparently calls `/auth/refresh` and retries before giving up and logging out.

## Testing (server)

Two independent suites:

```bash
cd server
npm test                 # fast suite — Prisma fully mocked, no database needed
npm run test:integration # integration suite — real PostgreSQL + real Prisma
```

The **integration suite** proves real multi-tenant isolation end-to-end (HTTP →
authenticate → real DB → authorize → service → Prisma → PostgreSQL). It runs
against a **dedicated test database**, never the dev DB:

1. Add `TEST_DATABASE_URL` to `server/.env` — it **must** point at a separate,
   clearly test-only database whose name contains `test` (e.g. `rentplus_test`).
2. Create that database once (any method), e.g. `createdb rentplus_test`.
3. `npm run test:integration` — a vitest `globalSetup` runs `prisma migrate deploy`
   against it (proving a fresh DB initializes from the migration baseline), then the
   tests truncate + re-seed deterministic tenants between cases.

**Safety guard:** before any migration or `TRUNCATE`, `assertTestDatabase()`
(`server/tests/integration/helpers/guard.ts`) refuses to run unless
`TEST_DATABASE_URL` is set, is a valid URL, is not `NODE_ENV=production`, and its
database name contains `test`. There is **no** fall-back to `DATABASE_URL`, so the
dev/prod DB (name `rent+`) can never be targeted.

## Verify

- **Server**: `npm run build` (tsc) + `npm test` + `npm run test:integration` + `curl http://localhost:5001/api/health`.
- **Client**: `npm run build`, `npm run lint`, `npm test`.
