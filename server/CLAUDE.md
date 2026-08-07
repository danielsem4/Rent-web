# rent+ Server — Architecture Rules

Express 5 + TypeScript (CommonJS) + Prisma 7 (PostgreSQL, driver-adapter). Modular feature slices with strict per-module layering. Node 18+.

## Stack (do not swap without discussion)

- **Runtime/lang**: Node.js, TypeScript compiled to CommonJS (`tsc`, target ES2020, `strict`).
- **Framework**: Express **5** (`express@^5`).
- **DB/ORM**: PostgreSQL via Prisma **7** using the `@prisma/adapter-pg` driver adapter over `pg`. Config lives in `prisma.config.ts` (Prisma 7 style), NOT inside `schema.prisma`.
- **Validation**: Zod 4.
- **Auth**: JWT in an httpOnly cookie (`token`), password hashing with `bcrypt`.
- **Security/parsing**: `helmet`, `cors` (credentials), `cookie-parser`.
- Dev: `ts-node` + `nodemon`. No test framework / linter configured by default.

## Folder structure

```
src/
  index.ts            # bootstrap: helmet → cors(credentials) → cookieParser → json/urlencoded → /api/health → mount routers → errorHandler LAST
  lib/prisma.ts       # single PrismaClient (PrismaPg adapter). The ONLY place a client is constructed.
  shared/
    errors/           # AppError (message, statusCode, isOperational)
    middlewares/      # authenticate, authorize, validateRequest, errorHandler
    utils/            # cookie.ts (AUTH_COOKIE_NAME + options), etc.
  modules/<feature>/  # one folder per domain (kebab-case)
```

## The 5-file module pattern (MANDATORY for every feature)

Each `src/modules/<feature>/` folder contains files named `<feature>.<layer>.ts`:

1. **`<feature>.routes.ts`** — creates `Router`, performs **manual constructor DI** (instantiate repository → service → controller), wires HTTP verbs + middleware. Exports `export const <feature>Router = Router()`.
2. **`<feature>.controller.ts`** — a **factory function** `create<Feature>Controller(service)` returning an object of `async (req, res, next)` handlers. Controllers ONLY translate HTTP ↔ service, set/clear cookies, and forward errors via `next(err)`. No business logic, no Prisma.
3. **`<feature>.service.ts`** — a **class** holding business logic. Receives repositories via constructor, typed against **interfaces** (e.g. `IAuthRepository`). Throws `AppError`. No Express types, no Prisma.
4. **`<feature>.repository.ts`** — a **class implementing an interface**. The ONLY layer allowed to import/use `prisma`. Defines its own record/DTO-shape interfaces.
5. **`<feature>.schema.ts`** — Zod schemas + inferred DTO types (`z.infer`). Optional for read-only modules with no request body.

Mount the router in `src/index.ts` under `/api/<plural>` BEFORE the `errorHandler`.

## Rules

- **Layering is strict**: routes → controller → service → repository → prisma. Never skip a layer. Only repositories touch `prisma`.
- **DI is manual** in `*.routes.ts` — no DI container. Services depend on repository *interfaces* so they can be substituted/tested.
- **Errors**: throw `AppError(message, statusCode)` from services. The centralized `errorHandler` (registered last) formats the response. Controllers wrap calls in try/catch → `next(err)`.
- **Validation**: attach `validateRequest(schema)` as route middleware. It replaces `req.body` with the parsed/typed data; derive DTOs with `z.infer`.
- **Auth**: `authenticate` reads the JWT cookie and sets `req.currentUser`. `authorize(...roles)` gates by role and runs AFTER `authenticate`.
- **Imports are relative** — there are NO tsconfig path aliases.
- **Env access uses bracket notation**: `process.env['X']` (strict-mode friendly).
- **Naming**: kebab-case folders; `<feature>.<layer>.ts` files; camelCase for sub-feature helpers.

## Commands

- `npm run dev` — nodemon + ts-node (port 5001; avoid 5000 — macOS AirPlay Receiver holds it).
- `npm run build` — `tsc` → `dist/`.
- `npm start` — run compiled `dist/index.js`.
- `npm run db:generate` / `db:migrate` / `db:seed` / `db:studio` — Prisma.

Seeded dev user: `admin@rentplus.dev` / `password123`.
