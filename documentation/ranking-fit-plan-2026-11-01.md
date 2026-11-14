# Ranking Fit (Part 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order each vendor's lead feed by Fit (text, category, category answers, location, scale), show "Near you", and nudge buyers without a state.

**Architecture:** One migration rewrites `match_vendor_rfqs` around one scoring function `public.rfq_fit(...)` and a family helper `public.category_root_of(uuid)`. The browser keeps sorting by the returned score and reads a new `near` column. Buyer nudges are on Profile and My Quotes.

**Tech Stack:** Postgres 17 (Supabase), React + TanStack Query, Playwright local specs.

**Spec:** `documentation/ranking-fit-design-2026-11-01.md`

## Global Constraints

- `score = 0.45 S + 0.20 C + 0.15 A + 0.12 L + 0.08 K`; neutral = 0.5 for A, L and K; S and C are as today (null similarity → 0).
- L values: 1 (same state, or overseas + export_ready), 0.8 (served state), 0.25 (base state only, different), 0 (listed served states, not among them), 0.5 (unknown, or overseas without export_ready).
- `near` = L ≥ 0.8 and not overseas.
- K is compared only when the unit is pieces/metres/kg and matches the family's usual unit (raw-materials → metres, chemicals-dyes → kg, other product families → pieces), and quantity > 0. K = min(1, capacity / quantity).
- Visibility rules of `match_vendor_rfqs` (open, unexpired, not targeted, not blocked, overseas tier) are unchanged, byte for byte.
- Copy: "Near you"; "Add your state" + " so suppliers near you see your requirements sooner."; button "Add state". Hindi and Gujarati in `src/i18n/{hi,gu}.json` (CRLF, 1-space JSON).
- The migration is applied with the CLI and not recorded in the ledger. Pin md5 pre-checks before applying.

## Review Focus

1. A vendor with no new data must keep today's relative order (the 0.175 constant). This is a harness case.
2. A requirement whose attributes are a string where the vendor's listings hold an array, and the reverse. This is a harness case in A.
3. `served_states` empty array vs null are both "none listed". This is a harness case in L.
4. A category deeper than two levels, and a legacy category outside the taxonomy, in `category_root_of`. This is a harness case.
5. The return type change drops the function, so grants must be re-created. This is a migration self-check.

---

### Task 1: Family helper and the scoring function

**Files:**
- Create: `scripts/ranking/fit-build-migration.mjs` (writes the roots VALUES list from `sellerCategories`)
- Create: `scripts/ranking/fit-migration.sql` (template, `-- @@ROOTS@@` placeholder)
- Create: `supabase/migrations/20261115100000_ranking_fit.sql` (generated)
- Test: `scripts/ranking/fit_match.sql`

**Interfaces:**
- Produces: `public.category_root_of(p_category uuid) returns text` (stable).
- Produces: `public.rfq_fit(p_vendor uuid, p_rfq uuid) returns table(attr_part float8, loc_part float8, scale_part float8)` (stable, definer, execute not granted to clients).
- Produces: `public.match_vendor_rfqs(p_vendor_id uuid, match_count int default 200) returns table(rfq_id uuid, similarity float8, category_match boolean, score float8, near boolean)`.

- [ ] Step 1: Write the harness cases (expected values from Global Constraints): roots (top, child, grandchild, legacy → null); L rows (7); A (match, miss, skip → 0.5, string vs array, colours→colors, column-backed fabric); K (ratio, capped at 1, wrong unit → 0.5, service family → 0.5, no quantity → 0.5); score of a no-data vendor = 0.45 S + 0.20 C + 0.175; visibility unchanged (an overseas lead stays hidden from a free vendor); a forbidden caller → 42501; near flag.
- [ ] Step 2: Run it on the local stack. Expected: every case FAILS (functions missing).
- [ ] Step 3: Write the template and the build script. Run the build.
- [ ] Step 4: Apply locally and run the harness. Expected: all PASS. The migration's self-checks pass: grants on `match_vendor_rfqs` are back (authenticated execute, anon none), and `rfq_fit` isn't callable by clients.
- [ ] Step 5: Commit.

### Task 2: Lead feed reads `near`; "Near you" badge

**Files:** Modify `src/lib/queries/rfqs.ts` (LeadRfq.near, matchOf), `src/components/vendor/OpenRfqLeads.tsx`, `src/lib/database.types.ts`, `src/i18n/hi.json`, `src/i18n/gu.json`.

- [ ] Step 1: Spec test 2a (vendor in Gujarat, two otherwise-equal leads from a GJ buyer and an MH buyer: the GJ lead is first and shows "Near you"; the MH one doesn't). Run it. Expected: FAIL.
- [ ] Step 2: Implement. Run 2a. Expected: PASS. Run typecheck, eslint and i18n.
- [ ] Step 3: Commit.

### Task 3: Buyer state nudge

**Files:** Modify `src/pages/Profile.tsx`, `src/pages/MyQuotes.tsx`, `src/pages/ProfileBusinessDetails.tsx` (autofocus the state picker on `?focus=state`), whatever profile query is needed for `stateCode`, and i18n.

- [ ] Step 1: Spec tests 3a (no state: Profile shows "Add your state", and its button opens Business details with the state picker focused; after saving a state the nudge is gone and the city nudge shows if the city is empty) and 3b (My Quotes shows the line without a state and hides it with one). Run them. Expected: FAIL.
- [ ] Step 2: Implement. Run them. Expected: PASS.
- [ ] Step 3: Commit.

### Task 4: Docs, full suite, rehearsal

- [ ] `documentation/changelog.md` entry, `securityflags.md` Low entry ("Near you" reveals coarse location), `test.md` lines, and design status.
- [ ] Full local suite green. Rehearse the migration against production's state.
- [ ] Commit.

### Task 5: Release

- [ ] Pin pre-check: the production md5 of `match_vendor_rfqs` is 87fc18b088378263a2f2c1f5f3031cb9 (pg_get_functiondef), and `rfq_fit` and `category_root_of` are absent.
- [ ] Apply with the CLI. Verify the md5s equal local. Push to main and confirm Vercel is Ready. Docs commit. Update memory.
