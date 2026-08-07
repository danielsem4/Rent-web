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
npm run db:seed               # seed dev user: admin@rentplus.dev / password123
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

## Verify

- **Server**: `npm run build` (tsc) + `npm run db:generate` + `curl http://localhost:5001/api/health`.
- **Client**: `npm run build`, `npm run lint`, `npm test`.
