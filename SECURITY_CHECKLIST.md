# SECURITY_CHECKLIST.md — rent+

> Companion to `SECURITY_PRINCIPLES.md` (the binding policy) and `SECURITY_GAP_ANALYSIS.md`
> (current state). Use the **Per-PR checklist** on every change; the **Pre-production checklist**
> before any production launch. **No control is marked "Implemented" without evidence**, and **no
> compliance/certification is claimed.**

---

## Per-PR checklist

Copy into the PR description; check what applies, and write "N/A — reason" for the rest.

- [ ] **Authentication impact** reviewed — no new unauthenticated path unless deliberately public.
- [ ] **Authorization impact** reviewed — server-side role check present; no ad-hoc `if (role===)`.
- [ ] **Resource / tenant ownership** reviewed — every tenant resource query carries `companyId`
      from `req.currentUser` (never from the body); changing an ID cannot cross tenants.
- [ ] **Mass assignment** — no privileged field (`companyId`, `role`→`SUPER_ADMIN`, `isActive`,
      `tokenVersion`) settable from request input.
- [ ] **Input validation** — Zod schema validates type/length/range/enum/allowed fields.
- [ ] **Sensitive-data exposure** — responses use projections (no `passwordHash`/tokens/secrets);
      no sensitive data in logs, URLs, or errors.
- [ ] **Errors safe** — no stack traces / ORM internals / paths returned to clients.
- [ ] **Logging safe** — no passwords, tokens, OTP/reset codes, or secrets logged.
- [ ] **Secrets** — no secret committed; new secrets added to `.env.example` as placeholders and
      validated at startup.
- [ ] **Rate limiting / abuse** considered for new auth or expensive endpoints.
- [ ] **Session/security-state** — if auth-related, `isActive` + `tokenVersion` semantics honored.
- [ ] **Tests added** — including **negative** security tests (denied access, escalation blocked,
      cross-tenant blocked, revoked token rejected).
- [ ] **Docs** — `SECURITY_PRINCIPLES.md` / threat model / gap analysis updated if the change alters
      an asset, boundary, integration, or control.

---

## Pre-production checklist

Do not launch to production until each item is **verified** (not assumed). Many depend on the
deployment target, which is **not yet chosen** — those stay unchecked until then.

- [ ] **HTTPS/TLS** enforced end-to-end.
- [ ] **DB TLS** enabled; production DB not publicly reachable; least-privilege DB credentials.
- [ ] **Encryption at rest** for DB and backups.
- [ ] **Production secrets** loaded from a real secret store; startup **fails fast** on missing/
      weak/placeholder critical secrets; dev secrets rotated out.
- [ ] **CORS / allowed hosts** locked to production origins (no localhost fallback).
- [ ] **Cookies** — `Secure` on, `SameSite=strict`, correct `trust proxy` if behind a proxy/CDN.
- [ ] **MFA** enforced for `SUPER_ADMIN` and `COMPANY_MANAGER`.
- [ ] **CSRF** protection implemented and tested.
- [ ] **Rate limiting** on login/refresh/reset/invite with a shared store for multi-instance.
- [ ] **Short access-token TTL** — shorter access-token lifetime + an approved refresh/session
      lifecycle in place (currently `ACCESS_TOKEN_TTL='8h'`; **P1** — revocation today relies on
      DB-fresh `isActive`+`tokenVersion`, not a short TTL).
- [ ] **Account lifecycle** — invitation/set-password, forgot, reset live; no plaintext-password
      provisioning; account disable + revoke-all working.
- [ ] **Audit logs** for security events; **operational logging** structured; sensitive data redacted.
- [ ] **Monitoring/alerting** for auth-failure spikes and abnormal admin activity.
- [ ] **Dependencies** — `npm audit` clean/triaged in CI; lockfiles committed; secret scanning on.
- [ ] **File security** — N/A until a file feature exists (then apply §16).
- [ ] **Backups** defined **and restore tested**.
- [ ] **Incident response** runbook exists (disable, revoke, rotate, review, recover).
- [ ] **Production error handling** — internal errors hidden; safe generic responses.
- [ ] **Penetration / security testing** performed and findings triaged.

---

## OWASP ASVS 5.0 gap table

Engineering reference only — **not** an ASVS certification. Legend: **Implemented** (evidence
cited) · **Partial** · **Missing** · **Needs verification** (deployment-dependent) · **N/A**.

| ASVS area | Status | Evidence / note |
|---|---|---|
| **V1 Encoding & injection** (SQL/command/path) | Implemented | Prisma typed queries only; no raw SQL/exec — `server/src/lib/prisma.ts`, repositories |
| **V1 Output/XSS safety** | Implemented | React escaping; no `dangerouslySetInnerHTML`/`eval` in `client/src` |
| **V2 Validation & business logic** | Implemented | Zod `validateRequest.ts` + `*.schema.ts` on mutating routes |
| **V2 Mass-assignment protection** | Implemented | `companyId` from context; `manageableRole` excludes `SUPER_ADMIN` — `users.service.ts:38-49` |
| **V3 Web frontend / CSRF** | Partial | SameSite + single-origin CORS only; no CSRF token/Origin check — `cookie.ts`, `app.ts` |
| **V3 Security headers** | Partial | `helmet()` baseline `app.ts:24`; SPA CSP not tuned (deployment) |
| **V6 Authentication — password storage** | Implemented | bcrypt(10) — `auth.service.ts:29`, `users.service.ts:32` |
| **V6 Authentication — enumeration** | Partial | login safe; `409` on authed create leaks existence — `users.service.ts:28` |
| **V6 Authentication — brute-force / rate limit** | Missing | no limiter (P1) |
| **V6 Authentication — MFA** | Missing | none; **P1** for privileged roles |
| **V6 Authentication — credential recovery/reset** | Missing | no forgot/reset; plaintext provisioning (P1) |
| **V7 Session — binding & storage** | Implemented | HttpOnly cookie; no localStorage token — `cookie.ts`, `useAuthStore.ts` |
| **V7 Session — termination / revocation** | Implemented | **Batch 1** — `tokenVersion` revoke-all + `isActive` checked every request `authenticate.ts` (per-device `jti` still future) |
| **V7 Session — cookie attributes (Secure/SameSite)** | Partial | correct in code; `Secure` effective only under prod HTTPS (Needs verification) |
| **V7 Session — token lifetime** | Partial | 8h access-token TTL — revocation via `isActive`+`tokenVersion`, not short TTL; **P1** shorten + refresh/session lifecycle before prod `config/jwt.ts:17` |
| **V8 Authorization — function level** | Implemented | `authenticate`+`authorize(...roles)` — `authorize.ts`, `users.routes.ts:22` |
| **V8 Authorization — object/tenant (BOLA/IDOR)** | Implemented | query-level `companyId` scoping; tested — `users.repository.ts`, `tenant-isolation.test.ts` |
| **V8 Authorization — centralized policy** | Partial | per-module role gate; no permission catalog (P2) |
| **V4 Access-control on account state (disable)** | Implemented | **Batch 1** — `User.isActive`; login generic 401 (enumeration-safe, reason logged server-side) + next-request 401 `auth.service.ts`, `authenticate.ts` |
| **V5 File handling / uploads** | N/A | no file feature (§16 applies when added) |
| **V9 Self-contained tokens (JWT)** | Implemented | **Batch 1** — pinned HS256 + issuer/audience validated `authenticate.ts`, `config/jwt.ts` |
| **V10 OAuth / OIDC** | N/A | not used |
| **V11 Cryptography** | Implemented | bcrypt via established lib; no custom crypto |
| **V12 Secure comms (TLS)** | Needs verification | deployment TBD |
| **V13 Config — secrets & fail-fast** | Implemented | **Batch 1** — `loadConfig` fails fast in prod on missing/placeholder/weak secrets `config/env.ts`, `index.ts` |
| **V13 Config — safe error handling** | Implemented | **Batch 1** — generic prod 500, detail server-side only `errorHandler.ts` |
| **V14 Data protection — minimization & projection** | Implemented | `SafeUser` projections; no model over-exposure |
| **V15 Secure coding / dependencies** | Partial | lockfiles committed; no CI `npm audit`/secret scan (P2) |
| **V16 Logging & audit** | Missing | `console.*` only; no audit events (P1) |
| **V16 Monitoring** | Needs verification | no infrastructure yet |
| **V17 WebRTC** | N/A | not used |
| **API1 BOLA** | Implemented | tenant-scoped queries + tests |
| **API2 Broken authentication** | Partial | strong basics; missing MFA/rate-limit/revocation (P1) |
| **API3 BOPLA (property-level authz)** | Implemented | projections + validated allowed fields |
| **API4 Resource consumption / rate limits** | Missing | no rate limiting / body-size caps beyond defaults (P1) |
| **API8 Security misconfiguration** | Partial | helmet + CORS; **Batch 1** fixed error leak, added startup config validation, and wired CORS origin to the validated `config.clientUrl` (no direct `process.env`; prod cannot fall back to localhost) `app.ts`, `config/env.ts` |
| **API9 Improper inventory** | Partial | small surface; orphaned `dist/modules/{company,property}` stale artifacts |
| **API10 Unsafe consumption of 3rd-party APIs** | N/A | no external API / LLM consumption |

> When an item moves to **Implemented**, cite the exact `file:line` (or test) here. Do not
> upgrade a row on intention alone.
