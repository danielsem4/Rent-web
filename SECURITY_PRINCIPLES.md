# SECURITY_PRINCIPLES.md — rent+ Security Constitution

> **Status:** Binding project policy. **Last reviewed:** 2026-08-19.
> **Scope:** the `client/` (React/Vite SPA) and `server/` (Express 5 + Prisma 7) packages.

This document is the **permanent security constitution** for the rent+ repository. It is
**mandatory reading before** any change that touches: authentication, authorization, users,
permissions, sensitive data, APIs, the database, files, external integrations, LLMs, secrets,
logging, or deployment/infrastructure.

**Engineering baselines (not certifications):** OWASP ASVS 5.0, OWASP Top 10, OWASP API
Security Top 10, NIST SSDF, NIST CSF, ISO/IEC 27001. These inform our engineering targets.

> ⚠️ **No compliance claims.** This project is **not** certified or formally compliant with
> ISO 27001, SOC 2, HIPAA, GDPR, HITRUST, OWASP ASVS, NIST, or any other framework. Do not
> state or imply otherwise anywhere (code, docs, marketing, commit messages) unless a formal
> assessment has actually been completed and recorded.

Companion documents: **`SECURITY_CHECKLIST.md`** (per-PR + pre-production checklists, ASVS
gap table) and **`SECURITY_GAP_ANALYSIS.md`** (current control-by-control audit + prioritized
findings). This file states *what must be true*; the gap analysis states *what is true today*.

---

## 0. How to use this document

1. Before writing security-sensitive code, read the relevant sections here.
2. Apply the **Definition of Done** (§30) to any sensitive feature.
3. If a request would weaken a control here: **stop, explain the conflict, propose the secure
   alternative** (§1 "No silent security weakening"). Do not quietly implement the weaker path.
4. Treat AI-generated code exactly like human code (§29): verify, test, no invented guarantees.

---

## 1. Core security principles

- **Secure by default.** New functionality is secure without anyone remembering to "turn on"
  security later. A new route is authenticated + authorized unless it is *deliberately* public.
- **Deny by default.** Access is denied unless explicitly permitted. **Authentication never
  implies authorization** — being logged in is not permission to perform an operation.
- **Least privilege.** Users, DB accounts, tokens, and (future) infrastructure get only the
  permissions they need.
- **Never trust the client.** All browser/API input is untrusted. Frontend checks are UX only;
  enforcement is server-side.
- **Fail closed.** If authentication, authorization, a secret, config, or any security control
  fails or is missing, **deny access** — never fall back to an insecure default.
- **Defense in depth.** No single control is the only thing standing between an attacker and an
  asset (e.g. tenant isolation is enforced *and* tested *and*, long-term, backstopped).
- **No silent security weakening.** If a future request conflicts with these principles:
  (1) flag the conflict, (2) explain the risk, (3) recommend a secure alternative, (4) do **not**
  silently implement the weaker approach.

---

## 2. Threat model (living)

**Protected assets**
- User credentials (`User.passwordHash`) and session tokens (JWT in the `token` cookie).
- Tenant-scoped business data: `Company`, `User`, `Property` (property records include
  `entryCode`, meter IDs, owner name/phone — treat as **confidential PII**).
- Foreign-worker records (`Worker`): identity documents and medical-insurance data. The
  passport number and insurance policy number are **regulated PII** and are stored
  encrypted at rest (§8); nationality, visa/insurance metadata, phone, and expiry dates are
  confidential PII.
- Administrative capability (`SUPER_ADMIN`, `COMPANY_MANAGER` privileged actions).

**Data classification**
- *Public:* `/api/health`. *Confidential:* everything else. *PII:* user email/name, property
  owner name/phone, entry codes, and foreign-worker profile/contact data. *Regulated PII:*
  foreign-worker **passport numbers**, **medical-insurance policy numbers**, and uploaded
  **identity-document files** (passport/visa/insurance scans) — encrypted at rest, omitted from
  list responses, downloadable only via an authenticated tenant-scoped endpoint, and never
  written to logs/URLs/audit metadata.

**Principals / trust boundaries**
- Roles: `SUPER_ADMIN`, `COMPANY_MANAGER`, `COMPANY_WORKER`, `RENTER` (Prisma `Role` enum —
  the single source of truth). Multi-tenant by `companyId`.
- Boundaries: browser → API (cookie-authenticated), API → PostgreSQL, and API → **local
  encrypted file storage** for worker identity documents (an S3 backend is planned behind the
  same storage seam — not built). No third-party egress, **no AI/LLM** boundary exists today.

**Threats we actively defend against** (with today's status; see gap analysis for detail):
account takeover, privilege escalation, IDOR/BOLA, broken authorization, brute force /
credential stuffing, injection, XSS, CSRF, SSRF, malicious file upload, data leakage, secret
leakage, dependency compromise, DoS / expensive-operation abuse, **cross-tenant access**.

> Keep this section updated when a new asset, principal, integration, or egress boundary is
> introduced. Do **not** invent tenant/student/customer/LLM models that the product does not have.

---

## 3. Authentication

- Passwords are **never** stored plaintext. Hash with **bcrypt** (current cost 10) — no custom
  crypto. Verify with `bcrypt.compare`.
- **No passwords sent by email**, ever. **No manager-chosen plaintext passwords in production.**
  Provisioned/invited users set their own password via a **cryptographically random,
  single-use, time-limited invitation/set-password token**. *(Required — see §24, currently
  a P1 gap.)*
- **Forgot/reset password** must be **enumeration-safe** (identical response whether or not the
  email exists), use random single-use time-limited tokens, be rate-limited, never send or
  reveal the existing password, and invalidate the token on successful use. *(Required — P1.)*
- **Prevent user enumeration** on all auth surfaces. Login already returns a generic
  "Invalid email or password". The authenticated `POST /api/users` `409 "Email already in use"`
  is a known lower-risk enumeration signal (privileged callers only) — see gap analysis.
- **Rate-limit** all authentication operations (login, refresh, reset request, reset verify,
  invitation redemption). Use finite attempts; **do not create permanent lockouts** an attacker
  can weaponize for DoS.
- **MFA is mandatory (P1) for privileged accounts** — `SUPER_ADMIN` and `COMPANY_MANAGER` —
  before production. Prefer an architecture with an upgrade path to **TOTP** and/or
  **WebAuthn/passkeys**. Email OTP, if ever used, is an *initial* mechanism only, not the ceiling.
  MFA for `COMPANY_WORKER`/`RENTER` is evaluated per their actual data access once the role model
  is finalized.

---

## 4. Session security

**Decision (2026-08-19): the token format is JWT and stays JWT — but it is not a purely
stateless, long-lived JWT.** We deliberately introduce server-side security state so that
disablement and revocation take effect.

Requirements:
- JWT stored **only** in an **HttpOnly** cookie. **`Secure` in production.** Appropriate
  **`SameSite`** (`strict` in prod). Host-only cookie (no `Domain`) where deployment permits.
  **No auth tokens in `localStorage`/`sessionStorage`.**
- **Short access-token lifetime**, paired with the existing `/api/auth/refresh` flow. Define
  the exact TTL as a centralized policy value (§28).
- **Strict verification:** pin `algorithms: ['HS256']`; validate expected claims. Do not accept
  tokens whose algorithm/claims are not what we issue.
- **Server-side security-state revalidation on every protected request.** The request must not
  blindly trust stale authorization claims from a previously issued JWT. At minimum the server
  maintains and re-checks:
  - **`isActive` / account status** — a disabled account is denied on its **next** protected request.
  - **current role/permissions** — already re-derived from the DB (keep it that way).
  - **`tokenVersion` / securityVersion** — tokens carrying an older version are rejected.
- **Revoke-all** is implemented by incrementing the user's `tokenVersion`; all previously issued
  tokens for that user become invalid. Bump `tokenVersion` on disable, password change, and
  explicit admin "revoke sessions".
- **Per-device / per-session revocation**, if later required, is added via a `jti` + a
  server-side session/revocation record — **never** by weakening the above requirements.
- **Logout** must be meaningful: clearing the cookie is not sufficient on its own for a stolen
  token; rely on short TTL + `tokenVersion` (and `jti` records if/when introduced).

> Rationale: we keep JWT as the wire format for continuity, while adding the minimum server-side
> state needed for immediate disablement and revoke-all. See `SECURITY_GAP_ANALYSIS.md` for the
> exact current state and the precise changes required.

---

## 5. Authorization

- Authorization is enforced **server-side**, always.
- **Three separate questions:** *Who are you?* (authentication) → *May you perform this
  operation?* (role/permission) → *May you perform it on this specific resource?* (ownership /
  tenant). All three are distinct and must each be answered where relevant.
- Do **not** scatter ad-hoc `if (role === ...)` checks through controllers/services. Gate routes
  with the shared `authenticate` → `authorize(...roles)` middleware. As the number of modules
  grows, introduce a **centralized permission catalog + `requirePermission(...)`** abstraction
  rather than duplicating role logic per module (tracked as a maturity item).
- Role names and permissions must reflect the **real** `Role` enum. Never copy roles from
  another project or invent a `SUPER_ADMIN` capability the product does not need.

---

## 6. Resource / tenant isolation

- rent+ is **multi-tenant by `companyId`**. Every tenant-owned resource (`User`, `Property`, and
  all future ones) **must** enforce tenant isolation **server-side, inside the query itself**
  (e.g. `where: { id, companyId }` with `findFirst`/`updateMany`), driven by
  `req.currentUser.companyId` — **never** a `companyId` from the request body.
- **Prevent IDOR/BOLA.** Changing an ID in a URL/body must never bypass authorization; a
  foreign-tenant ID must return `404`/`null`, never a leaked or mutated row.
- Shared read access must not imply write access. Creators manage their own content; higher
  administrative permission may manage any content *only where the product requires it*.
- Do **not** introduce speculative tenant infrastructure. Per-query isolation is the standard;
  DB-level enforcement (Postgres RLS) is a documented defense-in-depth option, not yet adopted.

---

## 7. Data classification & privacy

- Apply **data minimization** — collect only what the product needs.
- **Never expose Prisma models directly.** Return purpose-built projections (e.g. the existing
  `SafeUser`, which omits `passwordHash`). Return only fields the client needs.
- Sensitive data (passwords, tokens, entry codes, owner contact info, worker passport/insurance
  numbers) must not appear in logs, URLs/query strings, analytics, exception messages, or
  browser storage. Regulated identifiers are additionally omitted from list projections and only
  returned on an authorized single-record read (see `WorkerListItem`).
- Define deletion/retention expectations per data type before that data goes to production.

---

## 8. Encryption

- **Production traffic uses HTTPS/TLS.** Database connections use TLS where supported. Storage
  at rest and backups are encrypted where the platform supports it. *(All deployment-dependent —
  see §25; currently **Needs Verification**, not implemented.)*
- **Passwords are hashed (bcrypt), not encrypted.** Never invent cryptography — use established
  primitives. For any especially sensitive field, evaluate field-level encryption explicitly.
- **Field-level encryption is implemented** for regulated worker identifiers (passport number,
  insurance policy number) via AES-256-GCM (`server/src/shared/utils/fieldEncryption.ts`), keyed
  by `FIELD_ENCRYPTION_KEY` (32 bytes / 64 hex; startup-validated, production fail-fast, §9). A
  fresh random IV per value + the GCM auth tag give confidentiality + tamper detection; the
  trade-off is that these columns are non-searchable. Key rotation makes prior ciphertext
  undecryptable — treat as a deliberate migration.

---

## 9. Secrets management

- **Never commit secrets.** `.env*` with real values is gitignored (verified). Only `.env.example`
  with **non-usable placeholders** is tracked.
- **Production fails fast** when a critical secret (e.g. `JWT_SECRET`, `DATABASE_URL`) is missing
  or is a known placeholder/weak value — **validate at startup**, not lazily at first use.
- **No insecure fallback secrets**, no placeholder accepted in production. **Never log secret
  values.**
- Prefer **purpose-specific** secrets over one catch-all. Support **rotation**. In production,
  prefer a Secret Manager / KMS when the (future) infrastructure permits.

---

## 10. Input validation

- All external input is validated **server-side** with **strict schema validation** (Zod). Validate
  type, length, range, enum, identifier shape, nested objects, and allowed fields.
- **Reject unexpected privileged fields / protect against mass assignment.** Ownership fields
  (`companyId`), role escalation (`SUPER_ADMIN`), and similar must never be settable from the body.
- Client-side validation is UX only.

---

## 11. Injection protection

- Use **parameterized Prisma queries** (typed query builder). Avoid raw SQL. If raw SQL is ever
  required: parameterize it, document why, and test it.
- Never pass untrusted input to OS commands, file paths, or template engines. Guard against SQL,
  command, path-traversal, and template injection.

---

## 12. XSS / output safety

- Use React's native escaping. **No `dangerouslySetInnerHTML`** on user-controlled content
  (none exists today — keep it that way). No `eval`/`new Function` on dynamic input.
- Define a **Content Security Policy** appropriate to the SPA at the hosting/serving layer.
  `helmet()` sets baseline API headers today; SPA CSP is deployment-dependent.

---

## 13. CSRF

- Auth is **cookie-based**, so CSRF must be designed explicitly. **CORS is not CSRF protection.**
- Baseline: `SameSite=strict` (prod) + single-origin credentialed CORS + **server-side `Origin`/
  `Referer` validation** on state-changing requests. Add a **synchronizer/double-submit token**
  where the threat model warrants. SameSite is defense-in-depth, not the sole control.
- **Never use `GET` for state-changing operations.**

---

## 14. API security

- All non-public endpoints require authentication; every sensitive endpoint requires
  authorization and, where a resource is addressed, resource/tenant authorization.
- Implement: strict request validation, response filtering (projections), request-body size
  limits, pagination limits, rate limiting, and **safe error responses**.
- **Production errors must never expose** stack traces, Prisma/ORM internals, filesystem paths,
  DB errors, env vars, or secrets. Detailed diagnostics stay server-side (structured logs).

---

## 15. Rate limiting & abuse protection

- Use a **maintained library** wrapped behind our own reusable abstraction — do not hand-roll a
  limiter. Define **separate policies** for: login, MFA verify, MFA resend, password-reset request
  + verify, invitation redemption, and any future expensive/file/LLM operation.
- Dev may use an in-memory store; **multi-instance production requires a shared store (e.g.
  Redis)** — deployment-dependent, currently Needs Verification.
- Use **finite attempts**; invalidate an OTP/reset challenge after repeated failures. **No
  permanent account lockouts** exploitable for DoS.

---

## 16. File security — *Binding (worker identity documents)*

Worker identity-document upload/storage is implemented (`modules/workers/documents/*`,
`shared/storage/*`). Controls in force:

- **Allow-listed types** — PDF / JPEG / PNG only, validated by **magic bytes** in the service
  (`documents.schema.ts::sniffFileType`); the browser-supplied MIME is never trusted (a fast
  multer `fileFilter` is only a first-pass reject).
- **Size limit** — 10 MB, enforced by multer `limits.fileSize` and re-checked in the service.
- **Generated filenames** — the storage key is a server-generated UUID; the client filename is
  never used as a path (no traversal). `originalName` is kept as display metadata only and is
  sanitized (control chars / quotes stripped) before use in the `Content-Disposition` header.
- **Private storage** — files live outside any web-served path (the app serves no static files);
  reachable only via the authenticated endpoint. Local disk now (encrypted); S3 (private + SSE)
  planned behind the same `IFileStorage` seam.
- **Encrypted at rest** — bytes are AES-256-GCM encrypted (`encryptBuffer`, keyed by
  `FIELD_ENCRYPTION_KEY`) before touching disk; decrypted only when streaming an authorized
  download (§8).
- **Authorization + tenant isolation** — every op is `authenticate` + `authorize` gated (read =
  MANAGER/WORKER, write = MANAGER) and scoped by `companyId`; the parent worker is verified to
  belong to the caller's company (foreign → 404, no leak).
- **Never executed / no inline render** — downloads are always `Content-Disposition: attachment`
  with `X-Content-Type-Options: nosniff`.
- **Rate limited** — per-user upload limiter (§14/§15).
- **Audit** — upload/download/delete audited with `{ workerId, docType }` metadata only, never
  the filename or bytes (§18).

**Deferred (Needs Verification):** **malware/AV scanning** of uploads is NOT implemented — no
scanner exists in the current environment. This is an explicit gap (§1: not silently skipped),
tracked in the gap analysis; the allow-list + magic-byte validation + no-execution + attachment
disposition + at-rest encryption above are the compensating controls until an AV pipeline (e.g.
on S3 ingest) is added.

---

## 17. Database security

- Use **least-privilege** DB credentials. The production DB must not be needlessly public.
- Use **Prisma Migrate** with a maintained migration history — **never `prisma db push` against
  production**. Keep schema and migrations aligned. Document any raw SQL constraints/indexes that
  cannot be expressed in Prisma.
- **Never** run destructive dev migration commands against production/staging. The integration
  test suite's DB guard (`assertTestDatabase`) is the model: refuse destructive ops unless the
  target is a clearly non-production `test` database.

---

## 18. Audit logging

- Emit **structured audit events** for security-sensitive activity: login success/failure, MFA
  success/failure, password reset/change, account creation, invitation/activation, enable/disable,
  role/permission changes, privileged actions, sensitive-content modification, security-setting
  changes, sensitive exports, session revocation, and administrative recovery/bootstrap.
- Each event includes (where applicable): actor, action, target, timestamp, result, metadata.
- **Never store** passwords, OTP codes, raw session tokens, reset tokens, invitation bearer
  tokens, or API secrets in audit records. Redact sensitive metadata.

---

## 19. Logging & monitoring

- **Operational logs and audit logs are separate concerns.** Replace ad-hoc `console.*` with
  **structured server-side logging**.
- Design monitoring/alerting for repeated login/authorization failures, abnormal admin activity,
  unusual content changes, mass downloads, and expensive-operation abuse.
- **Do not claim monitoring exists** until real infrastructure exists (deployment-dependent).

---

## 20. AI / LLM security — *Not Applicable today*

There is **no** AI/LLM integration. **If one is added**, this section becomes binding: treat the
LLM as a **data-egress boundary**; define what data may leave, what must be redacted, the provider
and its retention/privacy terms, cost + rate limits, prompt-injection boundaries, tool/action
permissions, and output validation. **Model output must never directly authorize a user, execute
privileged operations, or become trusted data without validation.** Protect source-of-truth
content that influences AI output from unauthorized modification/poisoning, and audit privileged
changes to it.

---

## 21. Dependency / supply-chain security

- Use maintained dependencies; commit lockfiles (both packages already do); avoid unnecessary
  dependencies. Remove dead security/auth dependencies when the architecture stops using them.
- Run dependency vulnerability scanning (`npm audit` / equivalent) in CI once CI exists. Evaluate
  security-critical libraries before adoption.

---

## 22. Secure development lifecycle

Security is part of development, not a cleanup phase. For every sensitive feature: (1) identify
threats, (2) define authentication requirements, (3) define authorization requirements, (4) design
ownership/tenant boundaries, (5) implement, (6) add **negative** security tests, (7) review against
this document. **Do not defer critical authorization work as "future hardening."**

---

## 23. Security testing

Security invariants must have automated tests, and security regressions must fail CI. Minimum
coverage as the surface grows:
- **Authentication:** unauthenticated access denied; disabled users denied; MFA cannot be
  bypassed; expired/reused OTP or reset token rejected.
- **Authorization:** lower role cannot invoke higher privilege; role fields cannot be
  mass-assigned; users cannot self-escalate.
- **Resource ownership:** User A cannot read/modify User B's tenant resources; changing an ID
  does not bypass authorization. *(Today: `tests/integration/tenant-isolation.test.ts`.)*
- **Sessions:** revoked (`tokenVersion`) token denied; revoke-all works; disablement terminates
  access on the next request.
- **CSRF:** missing/invalid token or invalid Origin rejected (once implemented).
- **Secrets/errors:** production fails with missing/weak critical secrets; errors do not leak
  internals.
- **Files:** (when applicable) unauthorized download denied, invalid upload rejected.

---

## 24. Administrative operations

- Privileged accounts (`SUPER_ADMIN`, `COMPANY_MANAGER`) require stronger controls — **MFA is
  mandatory (P1)**. Admin authorization is server-side. Sensitive admin actions are audited.
  Very sensitive operations may require recent re-authentication / MFA confirmation.
- **Account lifecycle (P1, required before production):** account disablement, session/token
  revocation, secure invitation/set-password, forgot-password, and reset-password. Provisioned
  accounts use random, single-use, time-limited tokens — **no manager-generated or emailed
  plaintext passwords in production.** (Email-provider selection is an implementation dependency,
  not a reason to demote the requirement.)
- **`SUPER_ADMIN` / bootstrap:** define its lifecycle explicitly; do not create it through a
  normal public API; protect against accidental removal; design recovery/break-glass separately;
  audit recovery actions. *(Currently `SUPER_ADMIN` is company-bound via the seed — its final
  shape is an open decision; see gap analysis.)*

---

## 25. Production hardening

Production must: enforce HTTPS; disable debug/verbose errors; use `Secure` cookies (with correct
`trust proxy` if behind a proxy/CDN); restrict allowed origins/hosts; hide internal errors; load
**real** production secrets; restrict DB/network access; use encrypted storage; enable operational
logging; enable monitoring where infrastructure supports it; and **validate configuration at
startup, failing fast when unsafe.**

> **Deployment is not yet chosen.** All infrastructure controls above are **production
> requirements / Needs Verification** — none is claimed implemented. Revisit and verify once the
> deployment target/topology is decided.

---

## 26. Backups & recovery

Before production, define: backup scope, frequency, retention, encryption, access control, and a
**tested** restoration procedure (a backup is not reliable until restore is tested). Backups
containing sensitive data get production-equivalent protection. *(Deployment-dependent.)*

---

## 27. Incident response

The architecture must support: user disablement, session revocation, revoke-all, secret rotation,
audit review, identification of affected resources, and recovery from backup. Document a
lightweight incident-response runbook before production.

---

## 28. Security policy values (centralized)

Security-sensitive constants must be **centralized and reviewable**, not scattered magic numbers:
access-token TTL, absolute session lifetime, cookie options, OTP/reset TTL + attempt limits,
resend cooldowns, rate limits, and request/body size limits. Any change to a security policy value
must be visible in review. *(Today: centralized in `server/src/shared/utils/cookie.ts` (cookie
options), `server/src/shared/config/jwt.ts` (`ACCESS_TOKEN_TTL`), and `server/src/shared/config/rateLimit.ts`
(rate-limit policies, Batch 2), and `server/src/modules/account/account.service.ts` (invitation 24h /
password-reset 1h token TTLs) + `account.schema.ts` (`passwordSchema`, Batch 3); body-size limits and
OTP/MFA TTLs remain to be added with their features.)*

---

## 29. AI-generated code

Treat AI-generated code exactly like human-written code. Never assume it is secure. For auth,
authorization, cryptography, DB, files, infrastructure, or any security-sensitive code: use
established primitives, verify library/documentation assumptions, add tests, flag uncertainty, and
never invent security guarantees. If a user instruction conflicts with this constitution, **flag
it** rather than silently weakening security.

---

## 30. Definition of Done (sensitive features)

A sensitive feature is not done until: authentication requirements are defined; authorization is
enforced server-side; ownership/tenant checks exist where required; input is validated; responses
expose only required fields; sensitive actions are audited where appropriate; errors are safe;
abuse/rate limiting was considered; sensitive-data handling was reviewed; and relevant **negative**
security tests exist.

---

## 31. Mandatory rule for future work

Before modifying security-sensitive code, determine whether it affects authentication,
authorization, permissions, sensitive data, APIs, DB, files, external integrations, secrets,
logging, infrastructure, or AI/LLM. Apply the relevant sections above. **If a request would weaken
security: stop, explain the conflict, and propose the secure implementation.** Do not weaken a
control merely to simplify code or make a test pass.
