# Product moderation (remove / flag / reasons) Implementation Plan

> **For agentic workers:** executed natively (superpowers:executing-plans) in the session that wrote it, at
> Mitra's instruction ("plan it and then build it, don't hard stop"). Steps use checkbox syntax.

**Goal:** product moderators and managers remove or flag a product with a reason picked in the action's dialog from
manager-editable templates; the vendor is notified; everything reaches the Admin Log.

**Architecture:** one migration in textile-spark-net adds two admin tables (templates, action ledger), four
vendor-facing columns on `products`, a guard trigger and six SECURITY DEFINER RPCs, and admits `manager` to product
moderation. Cosora-Admin gets dialogs on Products and a templates page; the vendor app shows the outcome on My
Products and in the bell.

**Tech Stack:** Postgres 17 / Supabase (RLS, plpgsql), React 18 + TanStack Query + Vite in both apps, Playwright.

**Spec:** `documentation/product-moderation-design-2026-10-07.md`

## Global Constraints
- Policies wrap helpers: `(select auth.uid())`, `(select public.is_admin())`, `(select public.admin_role())`.
- Every definer function: `search_path ''`, `revoke ... from public, anon`, `grant ... to authenticated`, coalesced
  role checks (a NULL guard does not fire).
- No `drop policy` / `drop function` / `drop constraint` in the migration (`apply_migration` declines them): policies
  change with `alter policy`, new constraints are added, not swapped.
- Reasons are data (`admin.product_moderation_reasons`), never a UI constant.
- Admin mutations judge success on returned rows or errors (`assertWrote`).
- Copy: no em or en dashes in user-visible admin text (`scripts/copy-audit.mjs`); no raw palette colours in admin.
- Every new vendor-app string has Hindi and Gujarati (`npm run i18n:check`).
- Never touch sign-in files.

## Review Focus
1. A moderator double-clicks Remove: the second call must fail cleanly (55000), not write a second ledger row or
   notification. Test: remove twice in the harness, ledger count 1.
2. A template switched off while a dialog is open: the RPC must refuse the inactive reason (22023), not use it.
   Test: deactivate, then remove with it.
3. A vendor withdraws a flagged listing to draft and resubmits to dodge the flag: the flag must survive. Test: vendor
   draft → under_review keeps `flagged_at`.
4. Reinstate must not bypass the plan cap: it lands in draft, and resubmitting at the cap is refused (P0001). Test in
   harness.
5. A vendor deletes a removed listing: the ledger keeps the record (`product_id` null, name kept). Test in harness.

---

### Task 1: Database migration + SQL harness (textile-spark-net)

**Files:**
- Create: `supabase/migrations/20261007160000_product_moderation.sql` (renamed to its live version after apply)
- Create: `scripts/product-moderation/pm1_remove_flag.sql`

**Interfaces (produces):**
- `admin_product_reasons(p_include_inactive boolean default false) returns table(id uuid, label text, vendor_message text, applies_to text[], active boolean, sort int)`
- `admin_product_reason_save(p_id uuid, p_label text, p_vendor_message text, p_applies_to text[], p_active boolean, p_sort int) returns uuid`
- `admin_product_remove(p_product_id uuid, p_reason_id uuid, p_note text default null) returns table(id uuid, removed_at timestamptz)`
- `admin_product_flag(p_product_id uuid, p_reason_id uuid, p_note text default null) returns table(id uuid, flagged_at timestamptz)`
- `admin_product_reinstate(p_product_id uuid, p_note text) returns table(id uuid, status text)`
- `admin_product_moderation_history(p_product_id uuid) returns table(id uuid, action text, reason_label text, message text, note text, actor_name text, actor_role text, created_at timestamptz)`
- `products.removed_at/removed_reason/flagged_at/flag_reason`; notification kinds `product_removed`, `product_flagged`, `product_reinstated`.

- [ ] Write the harness first (rolled-back `DO` blocks that `set local role authenticated` + `request.jwt.claims`
      per persona; prints `PASS`/`FAIL` lines). Cases: role matrix per RPC (super_admin, product_moderator, manager
      allowed; vendor_ops, ads_moderator, finance_admin, support, vendor, buyer refused 42501); blank/inactive/wrong-
      kind reason 22023; remove twice 55000 with one ledger row; flag non-live 55000; vendor can't update a removed
      listing, can't set the columns on insert/update, can delete it (ledger survives); vendor draft→under_review keeps
      the flag; moderator approve clears the flag; reinstate → draft, then resubmit at cap → P0001; Admin Log row with
      reason for each action; one notification per action; vendor and buyer read 0 rows of both admin tables;
      `admin_flag_add('product')` refused for support, allowed for manager; manager approves a queued listing directly.
- [ ] Run it on the local stack before the migration: expect failures (functions missing).
- [ ] Write the migration (sections: tables + seed, columns + checks, guard trigger, moderation trigger + policies +
      approve/reject RPCs admit manager, helper gates, the six RPCs, `admin_flag_add`, grants, self-check `DO` block).
- [ ] Apply to the local stack: `docker exec -i supabase_db_localstack psql -U postgres -v ON_ERROR_STOP=1 --single-transaction < <file>`.
- [ ] Run the harness: all PASS.
- [ ] Commit.

### Task 2: Cosora-Admin Products page + reason dialog + templates page

**Files:**
- Create: `src/lib/productModeration.ts` (types, `useProductReasons`, mutations, history query)
- Create: `src/components/ProductModerationDialog.tsx` (Remove and Flag: reason select required, note, preview of the vendor's text)
- Create: `src/pages/ModerationReasons.tsx`
- Modify: `src/pages/Products.tsx` (Removed tab, paging, Flag/Remove/Reinstate, flagged badge, history)
- Modify: `src/lib/roles.ts` (manager on `products`; section `moderation-reasons`), `src/App.tsx` (route), `src/components/Shell.tsx` (nav), `src/pages/AdminLog.tsx` (table label), `src/components/FlagLog.tsx` (copy), `src/lib/database.types.ts` (new RPCs and columns)

**Consumes:** Task 1's RPC signatures. **Produces:** UI only.

- [ ] Types, then `npm run typecheck` (0), `node scripts/copy-audit.mjs` (pass), `npm run build`.
- [ ] Commit.

### Task 3: Vendor app — My Products notices and notification kinds

**Files:**
- Modify: `src/lib/queries/products.ts` (`VendorProductRow.moderation`), `src/pages/Products.tsx` (notices, no Edit when removed),
  `src/lib/notificationsStore.ts` (three kinds → `/products`), `src/lib/queries/notifications.ts` (kind union),
  `src/lib/database.types.ts`, `src/i18n/hi.json`, `src/i18n/gu.json`, `src/i18n/external-strings.json` (notice titles, seeded templates)

- [ ] `npx tsc --noEmit --skipLibCheck -p tsconfig.app.json` (0), `npm run i18n:check` (0 missing), `npm run build`.
- [ ] Commit.

### Task 4: Browser spec on the local stack

**Files:** Create `tests/local/product-moderation.spec.ts`.

- [ ] Admin as product moderator: Remove opens the dialog; the confirm button stays disabled until a reason is picked;
      removing moves the card to Removed with the reason; the server row says `rejected` + `removed_at`.
- [ ] Manager: edits a template on Moderation reasons, flags a live listing with it, reinstates the removed one.
- [ ] Vendor: My Products shows "Removed by Cosora" and the reason with no Edit; the bell lists the notice.
- [ ] Run with both apps on :8090 / :5184 against the local stack. Commit.

### Task 5: Docs, then production (with Mitra's permission)
- [ ] `claude.md` rule, `technicalimplementation.md`, `sides.md`, `changelog.md`, `test.md`, Cosora-Admin README and CHANGELOG.
- [ ] Ask Mitra; then `apply_migration`, read the live version, rename the file, md5-compare, run the harness's
      read-only checks live, regenerate types, merge both branches to `main`, check the Vercel deploys.
