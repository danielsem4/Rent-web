# SECURITY_GAP_ANALYSIS.md — rent+ current-state audit

> **Date:** 2026-08-19 · **Branch:** `security-and-architecture` · **Method:** three parallel
> read-only code sweeps + direct review of every security-critical file.
> This is a point-in-time audit. `SECURITY_PRINCIPLES.md` states the target; this file states
> what is true **today** and what must change. **No compliance/certification is claimed.**

---

## 1. Architecture inventory

**Shape:** monorepo, two independent npm packages, **no** workspace tool, **no** Docker /
CI / deployment config.

| Area | Finding | Evidence |
|---|---|---|
| Frontend | React 19 + Vite 7 SPA, TS strict, no SSR | `client/package.json`, `client/vite.config.ts` |
| Backend | Express 5 + TS (CommonJS), REST | `server/package.json`, `server/src/app.ts` |
| DB / ORM | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`) | `server/prisma/schema.prisma`, `server/src/lib/prisma.ts` |
| Migrations | Prisma Migrate, single baseline; **not** `db push` | `server/prisma/migrations/20260816211513_baseline/` |
| API surface | `/api/auth`, `/api/users`, `/api/health` only; `Property` is schema-only | `server/src/app.ts:41-42` |
| AuthN | Custom email+password → HS256 JWT in HttpOnly cookie | `server/src/modules/auth/*`, `authenticate.ts` |
| AuthZ | `authenticate` + `authorize(...roles)` + query-level tenant scoping | `server/src/shared/middlewares/`, `users.repository.ts` |
| Session store | Cookie `token`; client persists only `{ userId }` | `client/src/store/useAuthStore.ts`, `client/src/lib/axios.ts` |
| Validation | Zod v4 via `validateRequest` | `server/src/shared/middlewares/validateRequest.ts` |
| File upload | **None** | — |
| External integrations | **None** (only PostgreSQL) | both `package.json` |
| AI / LLM | **None** | — |
| Secrets/config | `dotenv`, `process.env['X']`; no startup validation | `server/src/index.ts:1-2` |
| Logging | `console.*` only; no library, no audit trail | `errorHandler.ts:15`, `index.ts:10` |
| Tests | Vitest unit (Prisma mocked) + integration (real PG, Supertest) | `server/tests/**` |
| CI/CD | **None** | (no `.github/workflows`) |
| Deployment | **None chosen** | (no Docker/vercel/etc.) |

**Principal / tenant model** (`server/prisma/schema.prisma`): `Role` enum
`SUPER_ADMIN | COMPANY_MANAGER | COMPANY_WORKER | RENTER`; multi-tenant by `companyId` (NOT NULL
on `User` and `Property`, `onDelete: Cascade`). `SUPER_ADMIN` is company-bound to an internal
platform company via the seed. `User` has **no `isActive`/status and no `tokenVersion`**.

---

## 2. Control-by-control status

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ❌ MISSING · 🔍 NEEDS VERIFICATION (deployment) · ➖ N/A

| Control | Status | Evidence / note |
|---|---|---|
| Passwords hashed (bcrypt), no plaintext/custom crypto | ✅ | `auth.service.ts:29`, `users.service.ts:32` (cost 10) |
| Login enumeration-safe | ✅ | generic 401 for bad creds AND disabled accounts; real reason logged server-side `auth.service.ts` |
| JWT claims non-authoritative (role/company re-derived from DB) | ✅ | `authenticate.ts:62-79` |
| Cookie HttpOnly / Secure(prod) / SameSite / host-only | ✅ | `cookie.ts:7-13` |
| No auth token in localStorage | ✅ | store persists only `{ userId }` `useAuthStore.ts` |
| Server-side authZ (role gate) | ✅ | `authorize.ts`, `users.routes.ts:22` |
| Tenant isolation + IDOR protection (query-level) | ✅ | `users.repository.ts:46-85`; tested `tenant-isolation.test.ts` |
| Mass-assignment defense (companyId from context) | ✅ | `users.service.ts:38-40`, `users.schema.ts` |
| Role-escalation defense (no SUPER_ADMIN via API; no self role change) | ✅ | `users.schema.ts:9`, `users.service.ts:47-49` |
| Response projection (no passwordHash leak) | ✅ | `SafeUser` in `users.repository.ts`/`auth.repository.ts` |
| Input validation (Zod) on mutating routes | ✅ | `validateRequest.ts`, `*.schema.ts` |
| Injection protection (parameterized, no raw SQL/exec) | ✅ | Prisma typed queries only; grep clean |
| Security headers baseline | ✅ | `helmet()` `app.ts:24` |
| CORS single-origin credentialed (from validated config) | ✅ | **Batch 1** — origin from `config.clientUrl`, no direct `process.env`; prod cannot fall back to localhost `app.ts`, `config/env.ts` |
| Migrations (not db push) + test-DB guard | ✅ | `package.json:10-11`, `tests/integration/helpers/guard.ts` |
| Secrets not committed; `.env` ignored & never in history | ✅ | `git ls-files`, git history clean |
| Lockfiles committed | ✅ | both `package-lock.json` |
| Safe error responses (500 handler) | ✅ | **Batch 1** — generic `500` in prod; full detail logged server-side only `errorHandler.ts` |
| Account disablement / `isActive` | ✅ | **Batch 1** — `User.isActive`; login denied via generic 401 (enumeration-safe, reason logged server-side) + denied next request `auth.service.ts`, `authenticate.ts` |
| Session revocation / `tokenVersion` / revoke-all | ✅ | **Batch 1** — `User.tokenVersion` checked every request; bump = revoke-all `authenticate.ts` (trigger-wiring pending) |
| Rate limiting / brute-force protection | ❌ | no limiter dependency — **P1** |
| CSRF explicit design (tokens / Origin check) | 🟡 | only SameSite + CORS today — **P1** |
| Startup config validation / fail-fast on weak secret | ✅ | **Batch 1** — `config/env.ts` `loadConfig` + `index.ts` fail-fast |
| MFA (privileged roles) | ❌ | none anywhere — **P1** |
| Invitation/set-password, forgot, reset flows | ❌ | manager sets plaintext password `users.service.ts:26-41` — **P1** |
| Audit logging | ❌ | none — **P1** |
| Structured operational logging | ❌ | `console.*` only — **P1** |
| JWT algorithm pin / iss / aud | ✅ | **Batch 1** — pinned HS256 + issuer/audience `authenticate.ts`, `config/jwt.ts` |
| Short-lived access-token TTL + refresh rotation | 🟡 | 8h TTL — immediate revocation via `isActive`+`tokenVersion`, not a short TTL; shorten before prod — **P1** `config/jwt.ts:17` |
| Login timing side-channel mitigation | ❌ | no dummy compare on missing user `auth.service.ts:24-32` — **P2** |
| Centralized permission catalog / `requirePermission` | ❌ | role gate + manual scoping only — **P2** |
| DB-level tenant enforcement (RLS) | ❌ | per-query discipline only — **P2** |
| CI + dependency/secret scanning | ❌ | no CI — **P2** |
| Centralized security policy constants | 🟡 | partial (`cookie.ts`, `config/jwt.ts` `ACCESS_TOKEN_TTL`) — **P2** |
| Password strength policy | 🟡 | length-only `min 8` `users.schema.ts:20` — **P2** |
| Content Security Policy for SPA | 🔍 | hosting-layer; deployment TBD |
| HTTPS/TLS, DB TLS, encryption at rest, backups | 🔍 | deployment TBD — **not implemented, not claimed** |
| Shared rate-limit store (Redis), trust-proxy, WAF, monitoring | 🔍 | deployment TBD |
| File upload security | ➖ | no file feature |
| AI/LLM egress controls | ➖ | no LLM integration |

---

## 3. Prioritized findings

> **Remediation Batch 1 (2026-08-19) — DONE:** P0 error leak; account disablement (`isActive`);
> `tokenVersion` revoke-all; startup config fail-fast; JWT verify hardening (pinned HS256 +
> issuer/audience). Verified by `server/tests/security.test.ts` + `config.test.ts` (fast suite 73
> tests) and the integration suite (22 tests); `npm run build` clean. Items below marked ~~struck~~
> are closed.

### P0 — immediate code defect
- ~~**500 error handler leaks internals.**~~ **FIXED (Batch 1)** — unexpected errors now return
  `{ message: 'Internal server error' }` in production; full detail is logged server-side only
  (`errorHandler.ts`). A `detail` field appears only when `NODE_ENV !== 'production'`.

### P1 — required before production
1. ~~**Account disablement + session-state revalidation**~~ **DONE (Batch 1)** — `User.isActive`
   + `User.tokenVersion`; both enforced in `authenticate` (disabled/version-bumped tokens denied on
   the next request); login returns a generic, enumeration-safe 401 for a disabled account, with the
   real reason logged server-side.
2. **Rate limiting / lockout** on `/api/auth/login` and `/refresh` (and future reset/invite).
3. **CSRF** — explicit design (SameSite=strict + server-side Origin/Referer check, and/or
   synchronizer token) on cookie-based auth.
4. ~~**Startup config validation / fail-fast**~~ **DONE (Batch 1)** — `config/env.ts` `loadConfig`
   rejects missing/placeholder/weak secrets in production; `index.ts` exits non-zero at boot.
5. **MFA** for `SUPER_ADMIN` and `COMPANY_MANAGER` (owner decision, 2026-08-19).
6. **Account lifecycle** — invitation/set-password, forgot, reset (random single-use
   time-limited tokens; enumeration-safe); **remove plaintext-password provisioning** for prod.
   *(The `tokenVersion` revoke-all mechanism from Batch 1 is ready to wire to password-change /
   admin-revoke / disable triggers here.)*
7. **Audit logging** for login success/failure, user create, role/permission change, disable,
   session revocation.
8. **Structured operational logging** (replace `console.*`).
9. **Short-lived access token + refresh/session lifecycle.** Introduce a shorter access-token
   lifetime with an approved refresh/session lifecycle before production, unless a later architecture
   decision explicitly justifies another approach. Today `ACCESS_TOKEN_TTL='8h'` (`config/jwt.ts:17`);
   immediate authorization/account revocation is provided by DB-fresh `isActive` + `tokenVersion`
   (+ role/company) checks, **not** by a short TTL. The "short-lived token" principle is **not**
   marked implemented while the access-token TTL remains 8h.

### P2 — defense-in-depth / maturity
- ~~Pin `algorithms:['HS256']` (+ `iss`/`aud`) in `jwt.verify`.~~ **DONE (Batch 1)** — pinned +
  issuer/audience defined and validated (`authenticate.ts`, `config/jwt.ts`).
- Login timing side-channel: dummy bcrypt compare when the user is not found.
- `409 "Email already in use"` enumeration on authenticated create (`users.service.ts:28`).
- Centralized permission catalog / `requirePermission(...)` as modules grow.
- Postgres RLS as a tenant-isolation backstop.
- CI/CD with `npm audit`, secret scanning, and test gating.
- Consolidate security-policy constants (§28).
- Stronger password policy (complexity / breached-password check).
- Remove orphaned build artifacts `server/dist/modules/{company,property}/**` (no source).
- SPA CSP + security-header tuning (deployment-dependent).

---

## 4. JWT / session audit

> **Batch 1 (2026-08-19) applied items 1-4 & 7 below.** Now implemented: `isActive` +
> `tokenVersion` on `User`; `authenticate` denies missing/disabled/version-mismatched tokens and
> verifies with pinned HS256 + issuer/audience; `sign` embeds `tokenVersion`; login returns a generic
> enumeration-safe 401 for a disabled account (real reason logged server-side); `refresh` re-checks
> status. **Not** done (deliberate, deferred — tracked as **P1**, see §3 item 9): short-lived-access +
> refresh-token rotation (item 3 — TTL stays **8h**), per-device `jti` revocation (item 5), and the
> lifecycle/email flows (item 6). The pre-batch state is retained below for reference.

**Pre-Batch-1 state (for reference):**

- **Access-token lifetime:** `8h` (`TOKEN_TTL='8h'`, `auth.service.ts:8`); cookie `maxAge` 8h
  (`cookie.ts:11`). *(TTL unchanged in Batch 1; now centralized as `ACCESS_TOKEN_TTL` in
  `config/jwt.ts:17`. Shortening it is a tracked P1 — §3 item 9.)*
- **Claims:** `{ userId, role, companyId }`, HS256, signed with `JWT_SECRET`; `role`/`companyId`
  are explicitly snapshot-only. **No `iss`/`aud`/`jti`; no algorithm pin** on verify.
- **Cookie attributes** (`cookie.ts`): name `token`; `httpOnly:true`; `secure:isProd`;
  `sameSite: isProd?'strict':'lax'`; `maxAge:8h`; `path:'/'`; **no `Domain`** (host-only).
- **Where authorization claims are trusted:** **not from the token.** `authenticate.ts:67`
  re-loads the user by `userId` and sets `req.currentUser.{role,companyId}` from the DB row;
  `authorize()` reads `req.currentUser.role`. Role/company changes therefore take effect on the
  **next** request already.
- **`isActive` / status:** **does not exist.** Only full row deletion (cascade) denies access.
- **`tokenVersion` / securityVersion:** **does not exist.** No revoke-all.
- **Logout:** `POST /api/auth/logout` is public and only `res.clearCookie` — a captured token
  stays valid until its 8h expiry (`auth.controller.ts:41-44`).
- **User creation / password delivery:** `COMPANY_MANAGER` `POST /api/users` with a
  manager-chosen plaintext password (min 8), bcrypt-hashed server-side, communicated out-of-band.
  No invitation token, no email, no self-service change/reset (`users.service.ts:26-41`).

**Exact changes required to reach the approved design (documented here; implementation is a
separate approved task — do NOT redesign JWT yet):**
1. **Schema:** `User.isActive Boolean @default(true)` (or a status enum) + `User.tokenVersion
   Int @default(0)`; add a migration.
2. **`authenticate`:** after `findById`, reject if `!user.isActive` (401) and if
   `payload.tokenVersion !== user.tokenVersion` (401); add `tokenVersion` to `JwtPayload`.
3. **`sign()`:** include `tokenVersion`; shorten access-token TTL (e.g. ~15m) paired with the
   existing `/auth/refresh` interceptor; pin `algorithms:['HS256']`; consider `iss`/`aud`.
4. **Revoke-all:** increment `tokenVersion` on disable, password change, and admin "revoke".
5. **Per-device logout (optional/later):** `jti` + server-side session/denylist record.
6. **Lifecycle:** invitation/set-password + forgot/reset token models (hashed, single-use,
   `expiresAt`), endpoints, rate limits, and an email provider (**provider selection is an
   implementation dependency, not a reason to demote the requirement**).
7. **Privileged disable endpoint** + audit events.

---

## 5. Unsafe defaults

- ~~`errorHandler` returns `err.message` in all envs.~~ **FIXED (Batch 1)**.
- ~~No boot-time secret validation.~~ **FIXED (Batch 1)** — `config/env.ts` + `index.ts` fail-fast.
- ~~`server/.env.example` ships a copy-paste-able weak secret.~~ **FIXED (Batch 1)** — replaced with
  a non-usable placeholder + generation guidance; production now rejects placeholder/weak values.
  (Rotate the local untracked `server/.env` dev secret separately — it is not committed.)
- ~~CORS silently falls back to `http://localhost:5173` when `CLIENT_URL` is unset (`app.ts:27`).~~
  **FIXED (Batch 1)** — `app.ts` no longer reads `process.env` for the origin; it uses the validated
  `config.clientUrl` (`app.ts`, `config/env.ts`). `loadConfig` requires a non-localhost `CLIENT_URL`
  in production, so the localhost fallback is unreachable in prod (the dev default applies only when
  `NODE_ENV` is not production).

---

## 6. Code ↔ documentation contradictions

- `server/CLAUDE.md:13` — "No test framework / linter configured by default" — **contradicts** the
  configured Vitest unit + integration suites and the existing tests. (Corrected in this change.)
- Orphaned compiled `server/dist/modules/{company,property}/**` exist with **no** corresponding
  `src/modules/company|property` and are not mounted in `app.ts` — stale build output, not part of
  the running app.

---

## 7. Open decisions needed from the product owner

- **Deployment target/topology** — deferred; all infrastructure controls remain Needs Verification.
- **Email provider** for invite/reset flows — implementation dependency.
- **Access-token TTL** value + whether to add refresh-token rotation / `jti` per-device revocation now.
- **`SUPER_ADMIN`** — remain company-bound or become a true platform-level principal.
- **MFA** mechanism/order (TOTP first vs WebAuthn) and rollout timeline.
- **Postgres RLS** as a tenant-isolation backstop — adopt or not.

---

## 8. Infrastructure controls that cannot be verified yet (deployment TBD)

TLS/HTTPS enforcement, DB TLS, encryption at rest, backups + tested restore, secret manager/KMS,
shared (Redis) rate-limit store, trust-proxy for secure cookies, WAF/DDoS protection, and
monitoring/alerting. **All are production requirements / Needs Verification — none is claimed
implemented.**
