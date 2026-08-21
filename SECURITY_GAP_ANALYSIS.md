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
| API surface | `/api/auth`, `/api/users`, `/api/properties`, `/api/workers`, `/api/payments`, `/api/health` | `server/src/app.ts` |
| AuthN | Custom email+password → HS256 JWT in HttpOnly cookie | `server/src/modules/auth/*`, `authenticate.ts` |
| AuthZ | `authenticate` + `authorize(...roles)` + query-level tenant scoping | `server/src/shared/middlewares/`, `users.repository.ts` |
| Session store | Cookie `token`; client persists only `{ userId }` | `client/src/store/useAuthStore.ts`, `client/src/lib/axios.ts` |
| Validation | Zod v4 via `validateRequest` | `server/src/shared/middlewares/validateRequest.ts` |
| File upload | **None** | — |
| External integrations | **None** (only PostgreSQL) | both `package.json` |
| AI / LLM | **None** | — |
| Secrets/config | `dotenv`, `process.env['X']`; no startup validation | `server/src/index.ts:1-2` |
| Logging | **Batch 4** — structured JSON logger + request correlation + `AuditLog` trail; no `console.*` | `shared/logging/logger.ts`, `shared/audit/*` |
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
| Tenant isolation + IDOR protection (query-level) | ✅ | `users.repository.ts:46-85`; tested `tenant-isolation.test.ts`; extended to Worker records incl. cross-tenant apartment-assignment guard `modules/workers/*`, `tests/integration/worker-tenant-isolation.test.ts` |
| Field-level encryption of regulated PII (worker passport/insurance numbers) | ✅ | AES-256-GCM per-value IV + auth tag, `FIELD_ENCRYPTION_KEY` startup-validated (prod fail-fast); ciphertext at rest, omitted from list projection, plaintext only on authorized detail read `shared/utils/fieldEncryption.ts`, `modules/workers/workers.repository.ts`; tests `tests/fieldEncryption.test.ts`, `tests/workers.test.ts`, `tests/integration/worker-tenant-isolation.test.ts` |
| File upload/storage of worker identity documents (§16) | 🟡 | Magic-byte allow-list (PDF/JPG/PNG) + 10 MB cap, UUID storage keys (no traversal), **AES-256-GCM encrypted at rest** via storage seam, authenticated tenant-scoped attachment downloads, per-user upload rate limit, audit names-only. `modules/workers/documents/*`, `shared/storage/{fileStorage,localFileStorage}.ts`; tests `tests/workerDocuments.test.ts`, `tests/integration/worker-document.integration.test.ts` (ciphertext-at-rest + cross-tenant 404). **AV/malware scanning DEFERRED — Needs Verification** (no scanner in env; compensating controls above). S3 backend (private + SSE) planned behind the same seam. |
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
| Session revocation / `tokenVersion` / revoke-all | ✅ | **Batch 1** — `User.tokenVersion` checked every request; bump = revoke-all `authenticate.ts`. **Batch 3** wired the writer: every password set/change bumps it `modules/account/account.repository.ts`. **Batch 5** — per-session revocation via stateful `RefreshToken` records; reuse detection revokes the whole family + bumps `tokenVersion` `modules/auth/refreshToken.repository.ts` |
| Rate limiting / brute-force protection | ✅ | **Batch 2** — `express-rate-limit` behind `shared/security/rateLimit.ts`; login (IP + email+IP failed + **per-email/account failed, IP-independent**) & refresh mounted `app.ts`; values `config/rateLimit.ts`. Account-level layer catches distributed attacks; threshold well above email+IP to bound account-DoS. Shared prod store + `trust proxy` still 🔍 |
| CSRF explicit design (Origin/Referer check) | ✅ | **Batch 2** — server-side Origin/Referer validation on authenticated mutations, fail-closed `shared/middlewares/csrf.ts`; layered with SameSite. CORS is not relied on |
| Startup config validation / fail-fast on weak secret | ✅ | **Batch 1** — `config/env.ts` `loadConfig` + `index.ts` fail-fast |
| MFA (privileged roles) | ✅ | **Batch 6** — mandatory TOTP for `SUPER_ADMIN`/`COMPANY_MANAGER`; two-phase login (credentials → 5m challenge/enroll token → verify → session); secret AES-256-GCM encrypted at rest, recovery codes SHA-256 hashed single-use `modules/auth/mfa.repository.ts`, `auth.service.ts`, `shared/utils/{totp,encryption,recoveryCodes,mfaToken}.ts`; tests `tests/mfa.test.ts`, `tests/integration/mfa.integration.test.ts` |
| Audit logging (security events) | ✅ | **Batch 4** — durable `AuditLog` table + resilient `AuditService` (`shared/audit/*`); events wired for login success/failure, user create, invitation sent/accepted, password reset requested/completed, role change; metadata sanitized (never passwords/tokens/tokenHash/cookies); tests `tests/audit.test.ts`, `tests/integration/audit.integration.test.ts` |
| Structured operational logging | ✅ | **Batch 4** — dependency-free structured JSON logger (`shared/logging/logger.ts`, pretty dev / compact JSON prod, redaction), request correlation id (`requestContext.ts`) + HTTP lifecycle log (`requestLogger.ts`); all `console.*` replaced; tests `tests/logger.test.ts` |
| Invitation/set-password, forgot, reset flows | ✅ | **Batch 3** — random single-use time-limited tokens (SHA-256 hashed at rest), enumeration-safe forgot-password, `tokenVersion` bump on every password change; plaintext provisioning removed `modules/account/*`, `users.service.ts`; tests `tests/account.test.ts`, `tests/integration/account.integration.test.ts` |
| Audit logging | ✅ | **Batch 4** — see the "Audit logging (security events)" row above |
| Structured operational logging | ✅ | **Batch 4** — see the "Structured operational logging" row above |
| JWT algorithm pin / iss / aud | ✅ | **Batch 1** — pinned HS256 + issuer/audience `authenticate.ts`, `config/jwt.ts` |
| Short-lived access-token TTL + refresh rotation | ✅ | **Batch 5** — `ACCESS_TOKEN_TTL='15m'` `config/jwt.ts`; stateful rotating refresh token (7d, hashed at rest) with reuse detection `modules/auth/refreshToken.repository.ts` + `/api/auth/refresh` `modules/auth/auth.service.ts`; refresh cookie HttpOnly/Secure(prod)/SameSite scoped to `/api/auth` `shared/utils/cookie.ts` |
| Login timing side-channel mitigation | ❌ | no dummy compare on missing user `auth.service.ts:24-32` — **P2** |
| Centralized permission catalog / `requirePermission` | ❌ | role gate + manual scoping only — **P2** |
| DB-level tenant enforcement (RLS) | ❌ | per-query discipline only — **P2** |
| CI + dependency/secret scanning | ❌ | no CI — **P2** |
| Centralized security policy constants | 🟡 | partial (`cookie.ts`, `config/jwt.ts` `ACCESS_TOKEN_TTL`, **Batch 2** `config/rateLimit.ts`) — **P2** |
| Password strength policy | 🟡 | **Batch 3** — centralized `passwordSchema` (min 8 + letter + digit) `modules/account/account.schema.ts`; breached-password / full-complexity check still **P2** |
| Content Security Policy for SPA | 🔍 | hosting-layer; deployment TBD |
| HTTPS/TLS, DB TLS, encryption at rest, backups | 🔍 | deployment TBD — **not implemented, not claimed** |
| Shared rate-limit store (Redis), trust-proxy, WAF, monitoring | 🔍 | deployment TBD — in-memory limiter store works per-process; multi-instance prod needs Redis. **Batch 2** added a configurable `TRUST_PROXY` (off by default); picking the correct hop count is deployment-dependent |
| File upload security | ➖ | no file feature |
| AI/LLM egress controls | ➖ | no LLM integration |

---

## 3. Prioritized findings

> **Remediation Batch 1 (2026-08-19) — DONE:** P0 error leak; account disablement (`isActive`);
> `tokenVersion` revoke-all; startup config fail-fast; JWT verify hardening (pinned HS256 +
> issuer/audience). Verified by `server/tests/security.test.ts` + `config.test.ts` (fast suite 73
> tests) and the integration suite (22 tests); `npm run build` clean. Items below marked ~~struck~~
> are closed.
>
> **Remediation Batch 2 (2026-08-19) — DONE:** rate limiting (`express-rate-limit` behind
> `shared/security/rateLimit.ts`; login + refresh mounted; policies in `config/rateLimit.ts`) and
> CSRF (server-side Origin/Referer validation, fail-closed, `shared/middlewares/csrf.ts`). The login
> route carries **three** layered limiters: per-IP (all attempts), per-`email+IP` (failed only), and
> a **per-email/account** limiter (failed only, IP-independent) that catches DISTRIBUTED attacks that
> spread many source IPs across one account — its threshold (default 25/15min) sits well above the
> email+IP cap (8) to bound account-DoS, and like all policies is window-based (no permanent lockout).
> A **configurable `trust proxy`** (`TRUST_PROXY`, secure default OFF) was added so `req.ip` is
> correct behind a proxy without allowing XFF spoofing. Verified by `server/tests/ratelimit.test.ts`
> (incl. multi-IP-trips-account, unknown-vs-known-identical, no-lockout, success-doesn't-weaken-IP) +
> `csrf.test.ts` and the integration suite; `npm run build` clean. **Not** done (deployment-dependent):
> shared rate-limit store (Redis) + choosing the correct `trust proxy` hop count for the target
> topology — Needs Verification, NOT claimed. **Dependency findings** recorded in §9 (Prisma chain,
> tooling-only, not remediated — the only auto-fix is a breaking Prisma major downgrade).
>
> **Remediation Batch 3 (2026-08-19) — DONE:** secure account lifecycle (P1 item 6). New
> `modules/account` + `AccountToken` model/migration deliver invitation/set-password and
> forgot/reset via random, single-use, time-limited, SHA-256-hashed tokens; `POST /api/users`
> stops accepting plaintext passwords (invited users start pending until they set their own);
> forgot-password is enumeration-safe; every password change bumps `tokenVersion` (wiring the
> Batch 1 revoke-all); the three prepared reset/invite rate-limit policies are mounted. Verified by
> `server/tests/account.test.ts` (fast) + `server/tests/integration/account.integration.test.ts`;
> `npm run build` clean; full fast (104) + integration (26) suites green. **Not** done here (still
> P1): MFA (item 5), audit logging (item 7), structured logging (item 8), short-lived access
> token + refresh rotation (item 9). Email-provider selection remains an open decision (§7) — the
> delivery seam fails closed in production until one is wired.
>
> **Remediation Batch 4 (2026-08-19) — DONE:** structured operational logging (P1 item 8) +
> centralized security audit logging (P1 item 7). A dependency-free structured logger
> (`server/src/shared/logging/logger.ts`) replaces every `console.*` (compact JSON in prod,
> human-readable in dev), with a shared `redact()` primitive that scrubs sensitive keys
> (pass/token/tokenHash/secret/cookie/jwt/authorization/apiKey/otp). A per-request correlation id
> (`requestContext.ts`, echoed as `X-Request-Id`) and an HTTP-lifecycle log (`requestLogger.ts`)
> thread through the error handler. A durable `AuditLog` table (loose, no-FK `userId`/`companyId`
> so records survive deletion — a deliberate deviation from the cascade convention) is written via
> a resilient `AuditService` (`shared/audit/*`) that sanitizes metadata and **never throws** into
> the request flow. Events are emitted for login success/failure (with reason), token refresh, user
> create, invitation sent/accepted, password reset requested/completed (with `sessionsRevoked`), and
> role change; `SESSION_REVOKED` is reserved for the future admin disable/revoke endpoint. A
> `LOG_LEVEL` config was added (validated, fail-fast). Verified by `tests/logger.test.ts` +
> `tests/audit.test.ts` (fast) and `tests/integration/audit.integration.test.ts` (real DB: rows
> written with correct actor/tenant/resource, no raw tokens/passwords); `npm run build` clean; full
> fast + integration suites green. **Not** done here (still P1): MFA (item 5) and short-lived access
> token + refresh rotation (item 9). Monitoring/alerting on these logs remains deployment-dependent
> (§19 — Needs Verification, not claimed).
>
> **Remediation Batch 5 (2026-08-20) — DONE:** short-lived access tokens + stateful refresh-token
> rotation with reuse detection (P1 item 9). `ACCESS_TOKEN_TTL` lowered 8h → **15m** (`config/jwt.ts`).
> New `RefreshToken` model/migration `20260819210004_refresh_token_lifecycle` — first String/UUID PK
> in the schema (deliberate, spec) + `familyId` lineage; only the SHA-256 hash is stored. `/api/auth/refresh`
> no longer sits behind `authenticate` (the 15m access cookie is usually expired at refresh time) —
> the HttpOnly/Secure(prod)/SameSite refresh cookie (scoped to `/api/auth`) is the credential. On a
> valid token the service rotates in a `$transaction` (retire old, issue successor in the same family)
> and re-signs the 15m access token from the CURRENT DB row. **Reuse detection:** a replayed
> revoked/expired token (or a lost single-use race) revokes the whole family AND bumps `tokenVersion`
> (revoke-all), so no already-issued access token survives the breach; audited as `SESSION_REVOKED`.
> Password reset/accept now revoke all refresh tokens atomically inside the existing
> `consumeTokenAndSetPassword` transaction. Logout best-effort revokes the presented token (audited
> `AUTH_LOGOUT`). The CSRF Origin/Referer check was extended to fire on the refresh cookie too (the
> access cookie is gone at refresh time). No client changes needed — the existing axios 401→refresh→retry
> interceptor is transparent to rotation. Verified by `tests/refreshToken.test.ts` (fast service unit:
> rotation, reuse, expiry, disabled, single-use race, login issuance, logout) +
> `tests/integration/refreshToken.integration.test.ts` (real DB: rotation, full-family kill on reuse,
> expired, disabled, password-reset revocation); `npm run build` clean; full fast (127) + integration
> (38) suites green.
>
> **Remediation Batch 6 (2026-08-20) — DONE:** mandatory TOTP MFA for privileged roles (P1 item 5 —
> the LAST P1). New `otplib`/`qrcode` deps; `User` gains `isMfaEnabled` + AES-256-GCM-encrypted
> `mfaSecret` + SHA-256-hashed single-use `mfaRecoveryCodes String[]` (migration
> `20260819224557_add_user_totp_mfa`). Login is now two-phase: after credential + `isActive` checks a
> privileged (`SUPER_ADMIN`/`COMPANY_MANAGER`) or MFA-enabled user gets NO session — instead a 5-min,
> single-purpose, DISTINCT-audience (`rentplus-mfa`) `mfa_challenge`/`mfa_enroll` token. Endpoints under
> `/api/auth/mfa`: `challenge` (verify TOTP or single-use recovery code → session), `setup` +
> `verify-setup` (authorized by a session OR an enroll token — hard-gated enrollment issues a session
> on completion), `disable` (authenticated + step-up password/TOTP). Secret encrypted at rest via a new
> fail-fast `MFA_ENCRYPTION_KEY`; MFA tokens can't be used as access tokens (audience pin);
> `challenge`/`verify-setup` rate-limited (`mfaVerify`, now wired into config + `app.ts`); events audited
> (`MFA_CHALLENGE_ISSUED`/`MFA_LOGIN_SUCCESS`/`MFA_LOGIN_FAILED`/`MFA_SETUP_COMPLETED`/`MFA_DISABLED`/
> `MFA_RECOVERY_CODE_USED`). Server-only (client MFA UI is a follow-up). Test helpers centralized the
> change: seeded privileged users are pre-enrolled with a fixed secret and `loginAs` completes the
> challenge. Verified by `tests/{mfa,totp,encryption}.test.ts` (fast) + `tests/integration/mfa.integration.test.ts`;
> `npm run build` clean; full fast (156) + integration (45) suites green. **All P1 items are now closed**
> (remaining work is P2 defense-in-depth + deployment-dependent Needs-Verification items).

### P0 — immediate code defect
- ~~**500 error handler leaks internals.**~~ **FIXED (Batch 1)** — unexpected errors now return
  `{ message: 'Internal server error' }` in production; full detail is logged server-side only
  (`errorHandler.ts`). A `detail` field appears only when `NODE_ENV !== 'production'`.

### P1 — required before production
1. ~~**Account disablement + session-state revalidation**~~ **DONE (Batch 1)** — `User.isActive`
   + `User.tokenVersion`; both enforced in `authenticate` (disabled/version-bumped tokens denied on
   the next request); login returns a generic, enumeration-safe 401 for a disabled account, with the
   real reason logged server-side.
2. ~~**Rate limiting / lockout** on `/api/auth/login` and `/refresh`~~ **DONE (Batch 2)** —
   `express-rate-limit` behind `shared/security/rateLimit.ts`; login carries **three** layers
   (per-IP all-attempts + per email+IP failed-only + **per-email/account failed-only, IP-independent**)
   and refresh (per-IP), mounted in `app.ts`; policies centralized in `config/rateLimit.ts` (future
   MFA/reset/invite policies defined, not mounted). All window-based, **no permanent lockout**. The
   email+IP layer keys **with** IP to avoid an account-DoS vector; the account layer keys on the
   normalized **email alone** to catch distributed (many-IP) attacks, with its threshold deliberately
   **well above** the email+IP cap (default 25 vs 8) to keep account-DoS risk bounded. `TRUST_PROXY`
   is now a configurable control (secure default OFF; never `true`). Shared prod store (Redis) +
   selecting the correct `trust proxy` hop count remain deployment-dependent (Needs Verification).
3. ~~**CSRF** — explicit design on cookie-based auth~~ **DONE (Batch 2)** — server-side
   Origin/Referer validation on authenticated state-changing requests, **fail-closed**
   (`shared/middlewares/csrf.ts`), layered with `SameSite=strict` (prod). CORS is **not** relied on.
   A signed double-submit token remains a documented future option if the deployment becomes
   cross-site.
4. ~~**Startup config validation / fail-fast**~~ **DONE (Batch 1)** — `config/env.ts` `loadConfig`
   rejects missing/placeholder/weak secrets in production; `index.ts` exits non-zero at boot.
5. ~~**MFA** for `SUPER_ADMIN` and `COMPANY_MANAGER`.~~ **DONE (Batch 6)** — mandatory TOTP with a
   two-phase login (credentials → short-lived, distinct-audience `mfa_challenge`/`mfa_enroll` token →
   `/api/auth/mfa/challenge` or `/setup`+`/verify-setup` → session). Privileged users are hard-gated:
   no session until enrolled + verified. Secret AES-256-GCM encrypted (`MFA_ENCRYPTION_KEY`, fail-fast
   in prod); recovery codes SHA-256 hashed + single-use; `/mfa/challenge`+`/verify-setup` rate-limited
   (`mfaVerify`); every MFA event audited. `modules/auth/mfa.repository.ts`, `auth.service.ts`,
   `shared/utils/{totp,encryption,recoveryCodes,mfaToken}.ts`.
6. ~~**Account lifecycle** — invitation/set-password, forgot, reset~~ **DONE (Batch 3)** — new
   `modules/account` mounts `POST /api/auth/{invitation/accept,forgot-password,reset-password}`.
   Tokens are `crypto.randomBytes(32)` hex, stored only as a SHA-256 hash (`AccountToken`,
   single-use via a race-safe conditional `updateMany` inside `$transaction`, time-limited —
   invitation 24h / reset 1h). `POST /api/users` no longer accepts a password: invited users are
   created **pending** (`isActive:false`) with an unusable placeholder hash and must set their own
   password via the invitation token. Forgot-password is **enumeration-safe** (identical 200; a
   token is issued only for an existing active user; delivery failures are swallowed). Every
   password set/change **bumps `tokenVersion`** (wires the Batch 1 revoke-all). Email delivery is a
   provider seam (`shared/notifications/mailer.ts`) — dev console prints the link (non-prod only),
   prod fails closed until a provider is chosen (§7 open decision). The three prepared rate-limit
   policies are mounted (`app.ts`). Verified by `tests/account.test.ts` (fast) +
   `tests/integration/account.integration.test.ts` (real DB: invite→pending→accept→login;
   reset→revoke-all→new password; single-use replay rejected).
7. ~~**Audit logging** for login success/failure, user create, role/permission change, disable,
   session revocation.~~ **DONE (Batch 4)** — durable `AuditLog` table + resilient `AuditService`
   (`shared/audit/*`); events wired across auth/account/users services; metadata sanitized (never
   passwords/tokens/tokenHash/cookies). `SESSION_REVOKED` action reserved for the future admin
   disable/revoke endpoint; password-driven revocation is recorded via `sessionsRevoked` metadata.
8. ~~**Structured operational logging** (replace `console.*`).~~ **DONE (Batch 4)** — dependency-free
   structured JSON logger (`shared/logging/logger.ts`), request correlation id + HTTP lifecycle log,
   all `console.*` removed, redaction of sensitive fields, `LOG_LEVEL` config.
9. ~~**Short-lived access token + refresh/session lifecycle.**~~ **DONE (Batch 5)** —
   `ACCESS_TOKEN_TTL='15m'` (`config/jwt.ts`) paired with a stateful, rotating refresh token (7d,
   SHA-256-hashed at rest, HttpOnly/Secure/SameSite cookie scoped to `/api/auth`) with **reuse
   detection**: a replayed revoked/expired token revokes the whole `familyId` and bumps `tokenVersion`.
   Rotation re-signs the access token from the current DB row; password reset revokes all refresh
   tokens; logout revokes the presented one (`modules/auth/refreshToken.repository.ts`,
   `auth.service.ts`). Verified by `tests/refreshToken.test.ts` + `tests/integration/refreshToken.integration.test.ts`.

### P2 — defense-in-depth / maturity
- ~~Pin `algorithms:['HS256']` (+ `iss`/`aud`) in `jwt.verify`.~~ **DONE (Batch 1)** — pinned +
  issuer/audience defined and validated (`authenticate.ts`, `config/jwt.ts`).
- Login timing side-channel: dummy bcrypt compare when the user is not found.
- **Batch 3** forgot-password timing side-channel: an existing active email does a token insert +
  mail send while a miss returns immediately — same enumeration-oracle class as the login item above
  (response BODY is already identical). Mitigate together with the login dummy-compare work.
- **Batch 3** invitation issuance is non-atomic with user creation and does not swallow mail-send
  errors: if a (future) real provider fails, the pending `User` + `AccountToken` already exist and
  there is no re-invite endpoint to recover (create retries hit the 409). Design a re-invite /
  resend endpoint (and/or wrap create+issue) when the email provider is chosen and account-disable
  lands — the flow is not production-usable until a provider is wired regardless.
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
> status. The pre-batch state is retained below for reference.
>
> **Batch 3 (2026-08-19)** added the lifecycle/email flows (item 6). **Batch 5 (2026-08-20)** applied
> item 3: `ACCESS_TOKEN_TTL` is now **15m** with a stateful, rotating refresh token (`RefreshToken`
> model, 7d, hashed at rest) + reuse detection (replay ⇒ family revoke + `tokenVersion` bump). The
> "8h" figures in the reference block below are historical (pre-Batch-5). Still deferred: per-device
> `jti` denylist (item 5, optional/later) and MFA (§3 item 5).

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
shared (Redis) rate-limit store, the correct `trust proxy` hop count for the chosen topology (the
knob itself is now configurable via `TRUST_PROXY`, off by default — **Batch 2**), WAF/DDoS
protection, and monitoring/alerting. **All are production requirements / Needs Verification — none
is claimed implemented.**

---

## 9. Dependency findings (`npm audit`, 2026-08-19)

Recorded per Batch-2 scope. **Not remediated** — the only automatic fix is a **breaking Prisma major
downgrade** (7.4.2 → 6.12.0), which is explicitly out of scope; these are **not** marked resolved.
`npm audit` reports **3 high** entries that are all **one advisory** surfacing through the Prisma
dependency chain:

| Advisory / package | Affected version | Runtime or tooling | Remediation | Exploitability / impact (this project) |
|---|---|---|---|---|
| **GHSA-ggr8-5vv4-36mx** — `deepmerge-ts` stack exhaustion on recursive object graphs (CWE-674) | `deepmerge-ts < 8.0.0` (transitive) | **Tooling-only** | Fixed in `deepmerge-ts ≥ 8.0.0`; npm's only auto-fix is `prisma@6.12.0` (`isSemVerMajor: true`) | **Low.** Reached only via Prisma config/CLI deep-merge, not attacker-controlled runtime input. |
| `@prisma/config` (`>= 6.13.0-dev.1`) — pulls the vulnerable `deepmerge-ts` | current (transitive of `prisma`) | **Tooling-only** | Same as above | **Low** — no runtime path (see above). |
| `prisma` (CLI) `6.13.0-dev.1 – 7.10.0-…` | `7.4.2` (**devDependency**) | **Tooling-only** | Same as above | **Low.** `prisma` is a **devDependency** (migrate/generate/studio); the runtime uses `@prisma/client` + `@prisma/adapter-pg`, which are **not** in the vulnerable chain, so nothing vulnerable ships to production runtime. |

**Tracking / next step:** keep under the existing P2 "CI + dependency scanning" item; re-evaluate when
a non-breaking `@prisma/config` (pulling `deepmerge-ts ≥ 8`) is available on the Prisma 7 line, then
apply without a major downgrade. Do **not** downgrade Prisma to satisfy the audit.
