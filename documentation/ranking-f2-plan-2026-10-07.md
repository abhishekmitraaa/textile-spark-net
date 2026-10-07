# Ranking Part 1 · F2 (who the vendor is, and where) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every vendor and buyer has a canonical state; vendors can say which states they serve, what kind of business they are, and how much they can make a month.

**Architecture:** One migration adds `india_states` (36 rows), `state_code_for()`, `state_code` on vendor and buyer profiles kept in step with the free-text `state` by a trigger, `served_states` / `primary_type` / `capabilities` on vendor profiles (backfilled from today's business labels), and a private `vendor_capacity` table. One shared `StateSelect` replaces three free-text state inputs. The business profile gets a "Business type & reach" section. (The buyer location nudge moved to Part 3; see Task 4.)

**Tech Stack:** Postgres 17, React 18 + TypeScript, Playwright (local stack).

**Spec:** `documentation/ranking-foundations-design-2026-10-07.md` (section F2).

## Global Constraints

- One source for the state list: `src/data/indiaStates.ts` (code, English, Hindi, Gujarati, aliases). The migration's seed rows are generated from it; codes are ISO 3166-2:IN without the `IN-` prefix.
- `state` stays the display name; `state_code` follows it automatically (trigger) unless a writer sets `state_code` itself.
- Primary types: `manufacturer`, `trader_wholesaler`, `retailer`, `job_worker`, `service_provider`, `freelancer`. Capabilities: `private_label`, `made_to_order`, `export_ready`, `sampling`, `sustainable`.
- Capacity: monthly number with a unit (`pieces`, `metres`, `kg`, `litres`, `orders`, `projects`), per top-level seller category id; private to the vendor and admins.
- New public `vendor_profiles` columns get their own column grants (the table exposes columns one by one).
- The requirement form never asks for a location. Buyer location comes from the profile; the nudge never appears on the requirement form.
- Hindi and Gujarati for every new string; no question removed.
- Ask Mitra before the production apply and before merging.

## Review Focus

- **A state typed with an old or short spelling** ("Orissa", "J&K", "Pondicherry") maps to the right code (harness cases).
- **A vendor whose free-text state matches nothing** keeps `state_code` null rather than a wrong code (harness case).
- **Saving the contact details without a state** is refused with a clear message (spec).
- **A vendor's capacity is not readable by another vendor or a buyer** (harness case).
- **Backfill never overwrites a primary type a vendor already set** (harness case on re-run semantics: backfill only fills nulls).

---

### Task 1: Database — states, codes, type, reach, capacity

Files: `src/data/indiaStates.ts`, `scripts/ranking/f2_vendor_profile.sql`, `supabase/migrations/20261007150000_vendor_type_location_capacity.sql` (generated seed from the TS list).

- [ ] Harness cases: 36 states; `state_code_for` on names, case, `&`, aliases, an unknown → null; vendor state change sets the code; an explicit `state_code` wins; buyer state change sets the code; served states with an unknown code refused; primary type outside the list refused; capability outside the list refused; backfill mapping on a fixture vendor (labels → type + capabilities); capacity: the vendor writes and reads its own, another vendor reads nothing, anon reads nothing, an admin reads it; a capacity of 0 or an unknown unit refused.
- [ ] RED locally; write the migration; GREEN; R1–R3 and F1 harnesses still pass; commit.

### Task 2: One state picker in three forms

Files: `src/components/StateSelect.tsx`; `src/pages/Onboarding.tsx` (address step), `src/pages/BusinessProfile.tsx` (contact details: required), `src/pages/ProfileBusinessDetails.tsx` (buyer); i18n for 33 state names.

- [ ] Spec: the vendor contact form refuses a save with no state; picking "Odisha" saves `state = Odisha`, `state_code = OR`; the buyer business details picker saves `state_code`.
- [ ] RED; implement; checks; GREEN; commit.

### Task 3: "Business type & reach" on the business profile

Files: `src/lib/queries/vendorStore.ts` (type, capabilities, served states; capacity read/write), `src/pages/BusinessProfile.tsx` (new section), i18n.

- [ ] Spec: a vendor picks Manufacturer + Private label, serves Gujarat and Maharashtra, and enters 5,000 pieces a month for Apparel; all four persist and reload.
- [ ] RED; implement; checks; GREEN; commit.

### Task 4: Buyer location nudge (moved to Part 3, Fit)

Moved during F2. Nothing reads buyer location before Fit: `match_vendor_rfqs` ranks by catalogue similarity only,
and leads don't show the buyer's location. "Add your business location to get nearby suppliers first" would
promise something not yet live, so the nudge ships with Fit, when it becomes true. F2 still collects buyer state
through the business-details picker (Task 2). On the profile it shares the one banner slot with the existing
"Add your city" nudge rather than stacking a second banner.

Original task, carried into the Fit plan:


Files: `src/components/buyer/LocationNudge.tsx`; `src/pages/Profile.tsx`, `src/pages/MyQuotes.tsx`; i18n.

- [ ] Spec: a buyer with no state sees "Add your business location to get nearby suppliers first" on the profile and My Quotes, linking to `/profile/business-details`; a buyer with a state doesn't; the requirement form never shows it.
- [ ] RED; implement; checks; GREEN; commit.

### Task 5: Docs and release

- [ ] `claude.md`, `technicalimplementation.md`, `MIGRATIONS.md`, `changelog.md`; full local suite; ask Mitra; apply; rename; md5; harness live; merge and push; deploys.
