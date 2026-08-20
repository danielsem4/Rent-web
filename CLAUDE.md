# rent+ — Repository Instructions

Monorepo with two independent npm packages (no workspace tool):

- **`client/`** — React 19 + Vite 7 SPA. See `client/CLAUDE.md` for its architecture rules.
- **`server/`** — Express 5 + TypeScript + Prisma 7 (PostgreSQL) REST API. See `server/CLAUDE.md`.

Run both together for a working login flow (client `:5173` proxies `/api` → server `:5001`).

## 🔒 Security policy — MANDATORY

**`SECURITY_PRINCIPLES.md` is binding project policy and is mandatory reading BEFORE any change
that touches:** authentication, authorization, users, permissions, sensitive data, APIs, the
database, files, external integrations, LLMs, secrets, logging, or deployment/infrastructure.

- `SECURITY_PRINCIPLES.md` — the constitution (what must be true).
- `SECURITY_GAP_ANALYSIS.md` — current control-by-control status + P0/P1/P2 findings.
- `SECURITY_CHECKLIST.md` — per-PR + pre-production checklists + OWASP ASVS gap table.

Rules that override convenience:
- **Secure by default, deny by default, least privilege, never trust the client, fail closed.**
- **No silent security weakening.** If a request would weaken a control, **stop, explain the
  conflict, and propose the secure alternative** — do not quietly implement the weaker path.
- Treat AI-generated code exactly like human code: verify, test, no invented guarantees.
- **Do not claim ISO 27001 / SOC 2 / GDPR / OWASP ASVS / NIST / any compliance or certification.**
  These frameworks are engineering baselines only unless a formal assessment has been completed.

Apply the **Definition of Done** (`SECURITY_PRINCIPLES.md` §30) to every sensitive feature, and
add **negative** security tests (denied access, blocked escalation, blocked cross-tenant access).
