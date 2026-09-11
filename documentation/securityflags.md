# Security Flags & Gaps

Log of every security flag, vulnerability, gap, or risk discovered anywhere in this
codebase — infra, dependencies, auth, data handling, or business logic. Maintained
automatically the moment something is found, during any session or while working any
prompt, without being asked.

IMPORTANT: never paste actual secret values, API keys, tokens, passwords, or working
exploit payloads into this file. Describe the finding, its location, and its risk —
not the sensitive value itself. This file may end up in version control history.

## Open Flags (unresolved, needs attention)
| Date found | Title | Severity | Location | Status |
|---|---|---|---|---|
| 2026-09-11 | Super-admin demo credential shipped in the production JS bundle and committed to a public repo | Critical | `src/contexts/AuthContext.tsx` (`DEMO_ACCOUNTS`); 16 other tracked files in `scripts/` and `tests/` | Open — needs a human to rotate |

## Log

### 2026-09-11 — Super-admin demo credential shipped in the production bundle — Severity: Critical
- What was found: `DEMO_ACCOUNTS` in `src/contexts/AuthContext.tsx` is a module-level export
  holding the email and the shared demo password for `demo-buyer`, `demo-vendor` and
  **`demo-admin@cosora.dev`, which is a `super_admin`** on the live project. `DevAccountSwitcher`
  correctly renders nothing in production (`if (!import.meta.env.DEV) return null`), but the
  constant it reads is not dev-gated, so the literal ships in the bundle whether or not the
  button renders.
- Where: `src/contexts/AuthContext.tsx` (the constant). The same password is also hardcoded in
  16 other tracked files under `scripts/` and `tests/` (`git grep` on HEAD, 2026-09-11). The
  repository `abhishekmitraaa/textile-spark-net` is public. The password has been in the
  repository since 2026-07-05 (`2ac5be8`).
- How it was discovered: Master Prompt 7 (buyer-trust thread), Phase 5 — the Bunny spec signs
  in as demo-admin. Confirmed in a local production build (`dist/assets/index-*.js`) AND on the
  live deployment: the bundle served by `textile-spark-net.vercel.app` on 2026-09-11
  (`/assets/index-DGTU6TCp.js`) contains the admin email and password as a string literal.
- Risk / impact: anyone who opens devtools on the production site, or reads the public repo,
  can sign in to Cosora-Admin as a super_admin — suspend accounts, approve or reject KYC and
  content, open every vendor's KYC scans through signed URLs (`business_docs_owner_select`
  admits `is_admin()`), and read admin-only tables. Removing the literal from the bundle does
  NOT undo the exposure: it is in public git history and in every bundle already deployed.
- Fix applied: none — this needs a human decision, because every fix breaks something.
  Recommended, in order: (1) rotate demo-admin's password now, or remove `is_admin` /
  `admin_role` from demo-admin and give tests a separate, non-shared admin; (2) gate
  `DEMO_ACCOUNTS` on `import.meta.env.DEV` so the literal is tree-shaken out of production
  builds; (3) move test credentials in `scripts/` and `tests/` to environment variables — the
  Master Prompt 7 admin spec (`tests/mp7-admin-vendor-panels.spec.ts`) already reads
  `DEMO_ADMIN_PASSWORD` from the environment rather than hardcoding it. Rotating the password
  breaks the 17 files that hardcode it until (3) is done.
- Status: Open
- Related changelog entry: 2026-09-11 (Master Prompt 7, buyer-trust thread · security finding)

### YYYY-MM-DD — <short title> — Severity: Critical / High / Medium / Low
- What was found:
- Where (file / module / endpoint / dependency):
- How it was discovered:
- Risk / impact if left unaddressed:
- Fix applied (or recommended fix, if not yet fixed):
- Status: Open / Fixed / Accepted risk / Monitoring
- Related changelog entry: (link the dated entry in documentation/changelog.md, if any)
