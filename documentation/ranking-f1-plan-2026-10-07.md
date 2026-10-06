# Ranking Part 1 · F1 (keep what the forms collect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every answer the product and requirement forms already ask is stored (`attributes`), searchable, embedded, and shown to the vendor and admin who need it.

**Architecture:** One migration adds `attributes jsonb` to `products` and `rfqs`, folds attribute values into the generated `search_text`/`fts` through an immutable helper, widens both embedding triggers, and returns attributes from `admin_lead_detail`. Two pure helpers decide what goes into `attributes` from each form's values; the forms call them. The vendor lead card and the admin lead detail render the values.

**Tech Stack:** Postgres 17 (Supabase), React 18 + TypeScript, Playwright (local stack).

**Spec:** `documentation/ranking-foundations-design-2026-10-07.md` (section F1).

## Global Constraints

- No question is added, removed or reworded in F1.
- `attributes` is an object whose values are strings, numbers or arrays of strings; at most 8 KB; empty values are not stored.
- A field that has a `products` column keeps writing that column, not `attributes`. `location` now writes `products.location` (it was asked and dropped).
- Rows with empty attributes keep exactly today's `search_text` (no trailing-space change).
- No `DROP` statements (the migration tool refuses them): `SET EXPRESSION`, `CREATE OR REPLACE TRIGGER`, `CREATE OR REPLACE FUNCTION`.
- New UI strings get Hindi and Gujarati; attribute keys shown to users are humanised from their ids until F3 brings labelled definitions (marked `data-no-translate` on the value only).
- Ask Mitra before the production apply and before merging to `main`.

## Review Focus

- **Editing a product must not wipe its attributes.** The edit flow skips the Details step; attributes must be loaded into the form and written back (Task 2 spec "edit keeps attributes").
- **A requirement posted with no category answers** stores `{}`, not `null` and not keys with empty values (Task 3 unit cases).
- **Arrays with a single empty string** (a cleared multiselect) are not stored (Task 2 and 3 unit cases).
- **A vendor's lead card with 12 attributes** stays compact: at most 4 shown, then "+N more" (Task 4).
- **search_text for rows without attributes is unchanged**, so existing embeddings aren't invalidated (Task 1 harness case).

---

### Task 1: Database — attributes, search text, triggers, admin detail

**Files:** Create `scripts/ranking/f1_attributes.sql`, `supabase/migrations/20261007100000_attributes_capture.sql`.

- [ ] Write the harness (cases: default `{}`; non-object refused; oversize refused; product `search_text` and `fts` include values; empty attributes leave `search_text` equal to the old expression; changing product attributes enqueues one embedding job; requirement `search_text` includes values; changing requirement attributes enqueues one job; admin lead detail returns attributes; a vendor reads an open requirement's attributes).
- [ ] Run locally — expect FAIL (column missing).
- [ ] Write the migration: `public.attributes_search_text(jsonb)` (immutable; returns `''` for none, else a leading space plus the string, number and array-element values ordered by key); the two columns with `*_attributes_shape` checks; `SET EXPRESSION` on `products.search_text`, `products.fts`, `rfqs.search_text` (today's expression `|| public.attributes_search_text(attributes)`); `CREATE OR REPLACE TRIGGER` for both embedding triggers with `attributes` added; `admin_lead_detail` with `'attributes', r.attributes`; self-check.
- [ ] Apply locally; harness all PASS; R3 harness still 27/27.
- [ ] Commit.

### Task 2: Product form saves every field

**Files:** Create `src/lib/formAttributes.ts`; modify `src/pages/Upload.tsx`, `src/lib/queries/products.ts`, `src/lib/database.types.ts`; test `tests/local/ranking-f1.spec.ts`.

- [ ] Unit cases (Playwright test with no page): `productAttributes()` drops column keys (`moq, fabric, gsm, fit, fit_type, gender, sizes, colors, color, pattern, occasion, neckType, sleeveType, collarType, originCountry, waistSizes, lengths, location, customizationAvailable`), drops empty strings and empty or all-blank arrays, trims strings, keeps numbers-as-strings.
- [ ] Spec: a product planted with attributes and a location, edited through `/upload?edit=<id>` (name changed), keeps both.
- [ ] Run — expect FAIL.
- [ ] Implement: helper; insert and update send `attributes` and `location`; `fetchProductForEdit` reads `attributes, location`; the edit prefill spreads attributes into `formValues` and sets `location`; types.
- [ ] Typecheck, i18n, lint; spec PASS; commit.

### Task 3: Requirement form saves its answers

**Files:** modify `src/lib/formAttributes.ts`, `src/pages/PostRequirement.tsx`, `src/lib/queries/rfqs.ts`; test the same spec file.

- [ ] Unit cases: `requirementAttributes()` drops `description` and empty values, keeps the category answers, returns `{}` when nothing is left.
- [ ] Spec: `createRfq` called through the page's submit path — a buyer posts a Raw Materials requirement with one category answer; the row's `attributes` holds it.
- [ ] Run — expect FAIL. Implement: `NewRfq.attributes`; `createRfq` inserts `attributes ?? {}`; the page passes `requirementAttributes(values)`.
- [ ] Checks; spec PASS; commit.

### Task 4: Vendors and admins see the details

**Files:** `src/lib/queries/rfqs.ts` (`RFQ_COLUMNS`, `RawRfq`, `LeadRfq.details`), `src/components/vendor/OpenRfqLeads.tsx`, `src/lib/formAttributes.ts` (`attributeDetails()` humanises keys, joins arrays); Cosora-Admin `src/lib/leads.ts` (`LeadDetail.attributes`), `src/pages/Leads.tsx` (a details list in the modal).

- [ ] Unit cases: `attributeDetails({fabricType: "Linen", sizes: ["S","M"]})` → `[{label: "Fabric type", value: "Linen"}, {label: "Sizes", value: "S, M"}]`.
- [ ] Spec: a planted open requirement with 6 attributes shows 4 details and "+2 more" on the vendor's `/leads` card; the admin lead detail lists all 6.
- [ ] Run — expect FAIL. Implement. Checks (both apps); spec PASS; commit both repos.

### Task 5: Docs and release

- [ ] `claude.md` (attributes rule), `technicalimplementation.md`, `MIGRATIONS.md`, `changelog.md`.
- [ ] Ask Mitra; apply through `apply_migration`; rename to the live version; md5; run the harness live; merge (buyer, then admin) and push; check both deploys.
