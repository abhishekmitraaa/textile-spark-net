# Ranking F3: one vocabulary, editable by admins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the listing form's and the requirement form's category questions into one database table that super admins edit in Cosora-Admin, with each requirement question mapped to the listing question it means, so Fit (Part 3) can compare them.

**Architecture:** `public.attribute_definitions` holds every question of both forms, seeded by a generated migration from today's code lists, so day one shows exactly today's questions. The buyer app reads the active rows once (cached) and rebuilds the same structures the forms already consume (`SellerCategory[]` for listings, `Section[]` per schema for requirements); the code lists stay as the fallback. Requirement rows carry `match_key` (the listing question they mean) and `match_weight`, which Fit reads. A trigger refuses unknown attribute keys and wrong value kinds from browsers. Cosora-Admin gets an Attributes page writing through `admin_attribute_*` RPCs, audited.

**Tech Stack:** Supabase Postgres 17 (migrations applied with the CLI), React + TypeScript + TanStack Query (buyer app and Cosora-Admin), Playwright local-stack specs, esbuild for the seed generator.

**Spec:** `documentation/ranking-foundations-design-2026-10-07.md`, section F3 (approved by Mitra 2026-10-07). Mitra 2026-10-31: "fix on your own" — the calls below are mine.

## Decisions made in this plan (refining the spec)

- **Two forms, one table.** Rows carry `form` = `product` or `requirement`. Product rows keep the listing form's three layers exactly (`layer` = `base` per seller type, `sub` per subcategory, `common` category fallback with `applies_to_subcategories`); requirement rows keep the requirement form's schema and sections (`schema_key`, `section_title`, `section_position`). Rebuilding the forms from the rows must give today's questions, field for field.
- **The spec's "requirement form built from the shared definitions" becomes "requirement questions mapped to the shared keys".** Rewriting the buyer form's question sets now would change what every buyer sees for no matching gain; instead each requirement question has `match_key` → the listing question id it means (`colors` → `colors`, `fabric` → `fabric`, `gsm` → `gsm`, `sizes` → `sizes`, `pattern` → `pattern`, `fit` → `fit`, `material` → `material`, …). F1's stored keys therefore need no rewriting: they are already the requirement keys.
- **Core requirement fields** (`quantity`, `budget`, `description`, `files`, `productType`, `productName`) are rows with `core = true`: admins can relabel them, not deactivate them or change their kind.
- **Validation** applies to browser writes by non-staff (`auth.role() = 'authenticated'` and not `is_admin()`), only when `attributes` changes: every key must be an active definition of that form (any category) or a system key, and the value kind must match one definition of that key. System keys: products `sku`, `subType`, `colours`; requirements none beyond the core rows.
- **Translations:** `label_hi`, `label_gu` columns; the app shows them when set (with `data-no-translate`), else the English label goes through the page dictionary as today.

## Global Constraints

- Releases: migration applied with the Supabase CLI (`db query --linked -f`, wrapped `begin;…commit;`), pinned on everything it replaces; not in the ledger; production read-back must equal the local tested bodies.
- No question added, removed or reworded on day one: the seeded forms equal today's.
- Every admin change lands in the Admin Log (`admin.audit_row_change`).
- Local specs only (`playwright.local.config.ts`); full suite green before release (with `LOCAL_INVOICE_RENDER_URL`).
- Buyer CLAUDE rules: a public column needs its own grant; a browser-written URL is not involved here.

## Review Focus

- A definitions read that fails or returns nothing: both forms must still show today's questions (code fallback) — pinned in Task 3 and Task 5.
- An admin deactivating a question that existing listings answered: old answers stay stored and still display on the listing; only the form stops asking — pinned in Task 3.
- A requirement posted with every one of the 13 schemas still saves (the validation trigger must know every core key) — pinned in Task 4 (SQL harness over the seed).
- Staff approving a requirement (rfq_submissions → rfqs) is never refused by validation — pinned in Task 4.
- Two definitions with the same key and different kinds (e.g. a select in one category, multiselect in another): either kind is accepted — pinned in Task 4.

---

### Task 1: Extract the requirement schemas; generate the seed

**Files:**
- Create: `src/data/requirementSchemas.ts` (moved from `src/pages/PostRequirement.tsx`: `FieldType`, `Field`, `Section`, option lists, builders, `SCHEMAS`, `SCHEMA_BY_TAXONOMY`; exports `requirementSchemas`, `schemaForCategory(categoryId)`)
- Modify: `src/pages/PostRequirement.tsx` (imports them; behaviour unchanged)
- Create: `scripts/ranking/f3-seed.mjs` (esbuild-bundles `src/data/sellerCategories.ts` and `requirementSchemas.ts`, prints the seed `insert` statements)
- Create: `scripts/ranking/f3-match-keys.json` (requirement key → listing field id, weight)

**Interfaces:**
- Produces: `requirementSchemas: Record<string, Section[]>`, `schemaForCategory(categoryId: string | undefined): Section[]`, and the seed SQL text used by Task 2.

- [ ] Step 1: Move the schema code; `npm run typecheck` 0; `tests/local/rfq-leads.spec.ts` and `first-fixes.spec.ts` (requirement form) still pass.
- [ ] Step 2: Write the generator; it emits one row per field per layer with `position` = order of appearance; requirement rows get `match_key`/`match_weight` from the JSON (weight 1 for matched keys, 0 otherwise).
- [ ] Step 3: Commit.

### Task 2: The table, RPCs and the seed (migration `20261031100000_ranking_f3_attribute_definitions.sql`)

**Files:**
- Create: the migration; `scripts/ranking/f3-harness.sql` (self-rolling-back)

**Interfaces:**
- Produces: table `public.attribute_definitions(id uuid pk, form text check in ('product','requirement'), category_id text, subcategory_id text, layer text check in ('base','sub','common'), seller_type text, applies_to_subcategories text[], schema_key text, section_title text, section_position int, key text, label text, label_hi text, label_gu text, kind text, options text[], unit text, placeholder text, required bool, full_width bool, half bool, core bool, match_key text, match_weight numeric, position int, active bool, updated_at timestamptz)`; anon/authenticated SELECT of active rows; no client writes.
- RPCs (definer, `search_path=''`, super_admin only): `admin_attribute_save(p_id uuid, p_row jsonb) returns uuid` (insert when p_id null; core rows keep `key`, `kind`, `active`), `admin_attribute_set_active(p_id uuid, p_active bool)`; `trg_admin_audit` on the table.

- [ ] Step 1: Harness first: counts per form equal the generator's; anon reads only active rows; a non-super-admin is refused by both RPCs; a core row can't be deactivated; an audit row appears. Run on the local stack → fails (no table).
- [ ] Step 2: Write the migration (table, policies, grants, RPCs, audit trigger, seed, self-checks); apply locally; harness passes.
- [ ] Step 3: Commit.

### Task 3: The listing form and search facets read the definitions

**Files:**
- Create: `src/lib/queries/attributeDefinitions.ts` — `fetchAttributeDefinitions(): Promise<AttributeDefinition[]>`, `useVocabulary(): { categories: SellerCategory[]; requirementSchemas: Record<string, Section[]>; fromDatabase: boolean }` (staleTime 10 min; falls back to the code lists on error or zero rows)
- Modify: `src/data/sellerCategories.ts` (resolution helpers take an optional `categories: SellerCategory[]` argument, default the code list), `src/pages/Upload.tsx`, `src/lib/searchFilters.ts` (facet options from the vocabulary)
- Test: `tests/local/ranking-f3.spec.ts`

**Interfaces:**
- Consumes: Task 2's table.
- Produces: `useVocabulary()` for Task 5; `buildCategories(rows): SellerCategory[]`, `buildRequirementSchemas(rows): Record<string, Section[]>` (pure, exported for the harness).

- [ ] Step 1: Spec tests: (a) a super admin relabels a T-shirt question and adds an option in the database → the listing form shows both; (b) a deactivated question is gone from the form, but a listing that answered it still shows the answer on its page; (c) with the definitions read blocked (route abort) the form shows today's questions. Run → (a), (b) fail.
- [ ] Step 2: Implement; run → pass. Commit.

### Task 4: Validation of browser-written attributes

**Files:**
- Modify: migration from Task 2 (`public.attributes_valid(p_form text, p_attrs jsonb) returns boolean`, trigger `trg_products_attributes_valid`, `trg_rfqs_attributes_valid`, before insert/update of `attributes`)
- Test: `scripts/ranking/f3-harness.sql` (extended), `tests/local/ranking-f3.spec.ts`

- [ ] Step 1: Harness: as a seller, an unknown key and a number where the definition is a choice are refused; `sku`/`subType`/`colours` accepted; every schema's full answer set (generated from the seed) accepted for requirements; as staff and as postgres nothing is refused; a key defined with two kinds accepts both. Run → fails.
- [ ] Step 2: Implement; harness passes; existing specs `listing-edits`, `sizes-media`, `rfq-leads`, `rfq-review`, `buyer-minor-fixes-b` still pass. Commit.

### Task 5: The requirement form reads the definitions

**Files:**
- Modify: `src/pages/PostRequirement.tsx` (sections from `useVocabulary().requirementSchemas`, fallback `requirementSchemas`)
- Test: `tests/local/ranking-f3.spec.ts`

- [ ] Step 1: Spec: an admin adds a requirement question to the apparel schema → the buyer sees it; the answer is stored in `rfq_submissions.attributes` under its key; with the read blocked the form is today's. Run → fails.
- [ ] Step 2: Implement; pass. Commit.

### Task 6: Cosora-Admin › Attributes (super admin)

**Files (Cosora-Admin):**
- Create: `src/pages/Attributes.tsx`, `src/lib/attributes.ts`
- Modify: `src/App.tsx`, `src/components/Shell.tsx`, `src/lib/roles.ts` (section `attributes`, super_admin write, manager read)
- Test (buyer repo): `tests/local/ranking-f3.spec.ts`, `tests/local/admin-pages.spec.ts` (page list)

- [ ] Step 1: Spec: a super admin filters by form and category, edits a label and its Hindi label, adds an option, adds a question, deactivates one; each shows in the buyer form and in the Admin Log; a core question has no Deactivate. Run → fails.
- [ ] Step 2: Implement (list grouped by form › category/schema › layer/section; edit dialog; add dialog; deactivate/reactivate). Admin typecheck + build. Pass. Commit.

### Task 7: Release

- [ ] Full local suite green; rehearsal from production's state; pins re-read; apply with the CLI; production bodies = local; push buyer and admin main; docs (changelog, test, technicalimplementation, securityflags if relevant); memory.
