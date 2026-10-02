# RFQ / Leads Pipeline (R1–R3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-out visitors read no RFQs (R1); every vendor gets the same ranked, uncapped lead feed (R2); admins can remove (with a reason the buyer reads) or flag any RFQ, and no browser can hard-delete one (R3).

**Architecture:** Three releases, each one migration in `textile-spark-net/supabase/migrations/` plus app changes, stacked on branches `rfq-leads/r1-anon` → `rfq-leads/r2-plan-independent` → `rfq-leads/r3-oversight` (buyer repo) and `rfq-leads/r3-oversight` (Cosora-Admin). Each migration carries its own self-check; each release has a self-rolling-back SQL harness in `scripts/rfq-leads/` that is the failing test before the migration and the passing test after. Browser behaviour is pinned by one local-stack Playwright spec.

**Tech Stack:** Postgres 17 (Supabase), PL/pgSQL, React 18 + TypeScript + Vite, TanStack Query, supabase-js, Playwright (local stack only).

**Spec:** `documentation/rfq-leads-pipeline-design-2026-10-02.md`

## Global Constraints

- Every policy writes `(select auth.uid())`, `(select public.is_admin())`, `(select public.admin_role())`, never the bare call; one policy per command (claude.md, Phase 12).
- No `DROP FUNCTION` anywhere (the migration tool refuses it): change functions with `create or replace` and the same signature.
- New definer functions: `security definer`, `set search_path = ''`, EXECUTE revoked from `public, anon`, granted to `authenticated`.
- New trigger functions: EXECUTE revoked from `public, anon, authenticated` (`20261001113147`).
- Admin write roles for leads: `super_admin` and `product_moderator` only. Readers stay `super_admin, vendor_ops, product_moderator, support`.
- A removal reason is mandatory and is shown to the buyer.
- Never touch sign-in: `src/lib/auth/otp.ts`, `Login.tsx`, `OtpVerify.tsx`, `AuthContext.tsx`, `supabase/functions/otp-dev-verify/`. Linking to `/login` is allowed.
- Every new UI string in the buyer app gets Hindi and Gujarati in `src/i18n/hi.json` and `src/i18n/gu.json`; `npm run i18n:check` passes.
- Migration files carry an authored timestamp until applied, then are renamed to the version production stamps, with statements md5-equal to what was applied (claude.md, Master Prompt 12).
- Every merge to `main` deploys production: ask Mitra before each merge, push and production apply. Never stage `.claude/tmp` or `documentation/cosora-admin-feature-audit-2026-10-02`.
- Fixture accounts that exist both locally and in production: buyer `11111111-1111-1111-1111-111111111111`, vendor `22222222-2222-2222-2222-222222222222` (Gold, expired, so effectively Free), admin `33333333-3333-3333-3333-333333333333`.

## Review Focus

- **A signed-in vendor while auth is still loading** must not see the "Sign in" prompt flash: the prompt waits for `loading === false` (Task 2 spec checks the signed-in page never shows it).
- **A removed direct request** must vanish from the target vendor's Direct inbox, not only from the open pool (Task 10 harness case "target vendor no longer sees it").
- **A buyer who was also given an admin role** must still be unable to reopen their own removed RFQ through `rfqs_update` (Task 10 harness case "buyer cannot reopen" uses a plain buyer; the guard ignores admin status by design, case "admin cannot reopen either").
- **A removal reason with only spaces** must be refused, not stored as blank (Task 10 harness case "blank reason").
- **Re-quoting an RFQ the vendor already quoted before removal** must be refused (the upsert path in `submitQuote`), not silently accepted (Task 10 harness case "quote refused after removal" uses the upsert shape).

---

## Release R1 — no RFQ data for signed-out visitors

### Task 1: `rfqs_select` admits signed-in users only

**Files:**
- Create: `scripts/rfq-leads/r1_anon_lockdown.sql`
- Create: `supabase/migrations/20261003090000_rfqs_select_signed_in_only.sql`

**Interfaces:**
- Produces: policy `rfqs_select` on `public.rfqs`, `TO authenticated`, predicate unchanged.

- [ ] **Step 1: Write the failing harness** — `scripts/rfq-leads/r1_anon_lockdown.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/LEADS HARNESS R1: signed-out visitors read no RFQ (2026-10-03).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R1".
-- Each case plants its fixtures in its own rolled-back subtransaction:
--   A open marketplace, active   B the buyer's, closed   C direct to the vendor, active
--   plus one quote on A by the vendor.
-- Every line prints PASS or FAIL with what it saw.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
--   local:  docker exec -i supabase_db_localstack psql -U postgres -At < scripts/rfq-leads/r1_anon_lockdown.sql
-- ─────────────────────────────────────────────────────────────────────────────
do $r1$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admn   uuid := '33333333-3333-3333-3333-333333333333';
  a uuid; b uuid; c uuid;
  labels text[] := array[
    'anon reads no RFQ', 'anon reads no quote', 'a signed-in stranger reads the open board only',
    'the buyer reads all three', 'the target vendor reads open + direct', 'an admin reads all three'];
  wants text[] := array['0', '0', 'A', 'A,B,C', 'A,C', 'A,B,C'];
  who uuid; got text; i int;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      a := gen_random_uuid(); b := gen_random_uuid(); c := gen_random_uuid();
      insert into public.rfqs (id, buyer_id, title, status) values
        (a, buyer, 'R1 open', 'active'), (b, buyer, 'R1 closed', 'closed');
      insert into public.rfqs (id, buyer_id, title, status, vendor_id) values (c, buyer, 'R1 direct', 'active', vendor);
      insert into public.quotes (rfq_id, vendor_id) values (a, vendor);
      insert into admin.admin_users (id, admin_role, is_active) values (admn, 'super_admin', true)
        on conflict (id) do update set admin_role = 'super_admin', is_active = true;

      if i <= 2 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        who := case i when 3 then gen_random_uuid() when 4 then buyer when 5 then vendor else admn end;
        perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', who::text, true);
        set local role authenticated;
      end if;

      if i = 1 then
        select count(*)::text into got from public.rfqs;
      elsif i = 2 then
        select count(*)::text into got from public.quotes;
      else
        select coalesce(string_agg(case r.id when a then 'A' when b then 'B' else 'C' end, ',' order by 1), '')
          into got from public.rfqs r where r.id in (a, b, c);
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = wants[i] then 'PASS ' else 'FAIL ' end) || got || ' (want ' || wants[i] || ')';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 110) || E'\n';
    end;
  end loop;
  raise exception 'R1 (rolled back)%', E'\n' || out;
end
$r1$;
```

Note on case 1: "anon reads no RFQ" counts the whole table, so on production it also proves the 3 live RFQs are hidden.

- [ ] **Step 2: Run it on the local stack to see it fail**

Run: `docker exec -i supabase_db_localstack psql -U postgres -At < scripts/rfq-leads/r1_anon_lockdown.sql`
Expected: `ERROR:  R1 (rolled back)` followed by `anon reads no RFQ: FAIL 1 (want 0)` (local has no other RFQs; the fixture A is visible), `anon reads no quote: PASS 0`, and PASS on cases 3–6.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261003090000_rfqs_select_signed_in_only.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/leads R1: no RFQ data for signed-out visitors (Mitra, 2026-10-02).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R1".
--
-- rfqs_select applied TO public, and its open-marketplace branch
-- (status = 'active' and vendor_id is null) never looked at the caller, so the anon
-- key read every active open RFQ (3 of 3, measured 2026-10-02). The policy now applies
-- to `authenticated` only: anon matches no SELECT policy and reads nothing. The
-- predicate is unchanged, so every signed-in user keeps exactly today's access,
-- including a signed-in non-vendor reading the open board (claude.md, "Any signed-in
-- user may read any ACTIVE open-marketplace RFQ").
--
-- quotes_select needs nothing: vendor_id and owns_rfq() compare with auth.uid(), which
-- is null for anon (0 rows, measured). scripts/rfq-leads/r1_anon_lockdown.sql pins both.
-- ─────────────────────────────────────────────────────────────────────────────
alter policy rfqs_select on public.rfqs
  to authenticated
  using (
    ((status = 'active'::public.rfq_status) and ((vendor_id is null) or (vendor_id = (select auth.uid()))))
    or (buyer_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- ── Self-check ──────────────────────────────────────────────────────────────
do $check$
declare
  v_roles text;
  v_n     int;
begin
  select roles::text into v_roles from pg_policies
   where schemaname = 'public' and tablename = 'rfqs' and policyname = 'rfqs_select';
  if v_roles is distinct from '{authenticated}' then
    raise exception 'R1 self-check: rfqs_select applies to %, expected {authenticated}', v_roles;
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'rfqs' and cmd in ('SELECT', 'ALL')
     and roles && array['public', 'anon']::name[];
  if v_n <> 0 then
    raise exception 'R1 self-check: % rfqs policies still let anon read', v_n;
  end if;
end
$check$;
```

- [ ] **Step 4: Apply locally and run the harness to see it pass**

Run: `docker exec -i supabase_db_localstack psql -U postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/20261003090000_rfqs_select_signed_in_only.sql`
Expected: `ALTER POLICY` then `DO`.
Run: `docker exec -i supabase_db_localstack psql -U postgres -At < scripts/rfq-leads/r1_anon_lockdown.sql`
Expected: six lines, all `PASS`.

- [ ] **Step 5: Prove no signed-in access changed** — run `scripts/admin-completion/16_rls_equivalence.sql` locally before and after if it covers `rfqs`; otherwise the harness cases 3–6 are the equivalence proof. Record which in the changelog.

- [ ] **Step 6: Commit**

```bash
git add scripts/rfq-leads/r1_anon_lockdown.sql supabase/migrations/20261003090000_rfqs_select_signed_in_only.sql
git commit -m "R1: rfqs_select admits signed-in users only; harness"
```

### Task 2: Signed-out `/leads` and seller home ask the visitor to sign in

**Files:**
- Create: `src/components/vendor/SignInForLeads.tsx`
- Modify: `src/pages/Leads.tsx` (the `useAuth` line and the panel block)
- Modify: `src/pages/SellerHome.tsx` (the `recentLeads.length === 0` block)
- Modify: `src/i18n/hi.json`, `src/i18n/gu.json`
- Create: `tests/local/rfq-leads.spec.ts`

**Interfaces:**
- Produces: `export default function SignInForLeads({ compact }: { compact?: boolean })`.

- [ ] **Step 1: Write the failing spec** — `tests/local/rfq-leads.spec.ts`:

```ts
/**
 * RFQ/leads pipeline (documentation/rfq-leads-pipeline-design-2026-10-02.md), on the
 * local stack only. R1: a signed-out visitor is asked to sign in instead of being told
 * there are no requirements, and a signed-in vendor never sees that prompt.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, signedInContext, watchErrors } from "./stack";

test.describe("R1: signed-out visitors", () => {
  test("/leads asks a signed-out visitor to sign in", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${BUYER_URL}/leads`);
    await expect(page.getByText("Sign in to see buyer requirements")).toBeVisible();
    await expect(page.getByText("No open buyer requirements right now")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/login");
    expect(errors).toEqual([]);
  });

  test("/seller-home asks a signed-out visitor to sign in", async ({ page }) => {
    await page.goto(`${BUYER_URL}/seller-home`);
    await expect(page.getByText("Sign in to see buyer requirements")).toBeVisible();
    await expect(page.getByText("No open buyer requirements right now. Check back soon.")).toHaveCount(0);
  });

  test("a signed-in vendor never sees the sign-in prompt", async ({ browser }) => {
    const ctx = await signedInContext(browser, "vendor", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/leads`);
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Sign in to see buyer requirements")).toHaveCount(0);
    await ctx.close();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (apps started per `scripts/local-stack/README.md` step 8): `LOCAL_STACK_ENV="<main checkout>/.claude/tmp/local-stack-env.json" npx playwright test -c playwright.local.config.ts tests/local/rfq-leads.spec.ts`
Expected: the two signed-out tests FAIL (prompt text not found); the signed-in test PASSES.

- [ ] **Step 3: Create the component** — `src/components/vendor/SignInForLeads.tsx`:

```tsx
import { Link } from "react-router-dom";
import { LogIn } from "lucide-react";

// Buyer requirements are for signed-in accounts only: since RFQ/leads R1 the
// rfqs_select policy is TO authenticated, so a signed-out visitor reads none.
// Shown in place of the "no open requirements" empty state, which would tell a
// signed-out visitor something untrue. Links to the existing sign-in page; the
// sign-in flow itself is not touched here.
export default function SignInForLeads({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        <Link to="/login" className="font-semibold text-brand-vendor underline-offset-2 hover:underline">
          Sign in to see buyer requirements
        </Link>
      </p>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-vendor/10">
        <LogIn className="h-6 w-6 text-brand-vendor" />
      </div>
      <p className="text-base font-bold text-gray-900">Sign in to see buyer requirements</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">Buyer requirements are shown to signed-in sellers only.</p>
      <Link
        to="/login"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-brand-vendor px-4 py-2 text-xs font-bold text-white hover:bg-brand-vendor/90 transition-colors"
      >
        <LogIn className="h-4 w-4" /> Sign in
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Use it on `/leads`** — in `src/pages/Leads.tsx`, import it, read `loading` from `useAuth()`, and render it in place of the panels when auth has settled with no user:

```tsx
import SignInForLeads from "@/components/vendor/SignInForLeads";
// …
  const { user, loading } = useAuth();
// …
        <motion.div variants={section}>
          {!loading && !user ? (
            <SignInForLeads />
          ) : (
            <>
              <DirectQuoteRequests />
              <OpenRfqLeads />

              {!isLoading && !hasLeads && (
                /* the existing empty-state card, unchanged */
              )}
            </>
          )}
        </motion.div>
```

- [ ] **Step 5: Use it on seller home** — in `src/pages/SellerHome.tsx`, read `loading` from `useAuth()` beside `user`, import the component, and replace the empty-state paragraph:

```tsx
              {recentLeads.length === 0 && (
                !loading && !user
                  ? <SignInForLeads compact />
                  : <p className="py-6 text-center text-sm text-gray-400">No open buyer requirements right now. Check back soon.</p>
              )}
```

- [ ] **Step 6: Translate the two new strings** — add to `src/i18n/hi.json`:
  `"Sign in to see buyer requirements": "खरीदार आवश्यकताएँ देखने के लिए साइन इन करें"`,
  `"Buyer requirements are shown to signed-in sellers only.": "खरीदार आवश्यकताएँ केवल साइन इन किए हुए विक्रेताओं को दिखती हैं।"`;
  and to `src/i18n/gu.json`:
  `"Sign in to see buyer requirements": "ખરીદારની જરૂરિયાતો જોવા માટે સાઇન ઇન કરો"`,
  `"Buyer requirements are shown to signed-in sellers only.": "ખરીદારની જરૂરિયાતો ફક્ત સાઇન ઇન કરેલા વિક્રેતાઓને જ દેખાય છે."`.
  ("Sign in" already has entries; confirm with the check.)

- [ ] **Step 7: Run the checks and the spec**

Run: `npm run typecheck && npm run i18n:check && npm run lint -- src/components/vendor/SignInForLeads.tsx src/pages/Leads.tsx src/pages/SellerHome.tsx`
Expected: no errors, "every string has hi and gu".
Run the spec again (Step 2 command). Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add src/components/vendor/SignInForLeads.tsx src/pages/Leads.tsx src/pages/SellerHome.tsx src/i18n/hi.json src/i18n/gu.json tests/local/rfq-leads.spec.ts
git commit -m "R1: signed-out /leads and seller home ask the visitor to sign in"
```

### Task 3: R1 docs and release

**Files:**
- Modify: `documentation/claude.md` (the "Any signed-in user may read any ACTIVE open-marketplace RFQ" rule)
- Modify: `MIGRATIONS.md` (ledger table), `documentation/changelog.md` (new top entry), `documentation/technicalimplementation.md` (RLS section, one paragraph)

- [ ] **Step 1: claude.md** — append to the rule: "Signed-out visitors read none: `rfqs_select` is `TO authenticated` (RFQ/leads R1, Mitra 2026-10-02, migration `<version>_rfqs_select_signed_in_only.sql`). Harness `scripts/rfq-leads/r1_anon_lockdown.sql`."
- [ ] **Step 2: changelog, MIGRATIONS.md, technicalimplementation.md** — one entry each naming the migration, the harness result (6/6 PASS locally) and that it is not yet applied.
- [ ] **Step 3: Commit** — `git commit -m "R1: docs"`.
- [ ] **Step 4: Production rehearsal (rolled back)** — run, through MCP `execute_sql`, the migration's statements followed by the harness, as one statement wrapped in `begin; … ` so the harness's final `raise` rolls everything back. Expected: the harness error text with six PASS lines. If the tool declines, say so and leave it for the SQL editor.
- [ ] **Step 5: Ask Mitra** for permission to apply R1 and merge it. Then: `apply_migration` (name `rfqs_select_signed_in_only`), read the stamped version from `supabase_migrations.schema_migrations`, `git mv` the file to `<version>_rfqs_select_signed_in_only.sql`, compare md5 (LF) of the file's statements with the recorded statement, run the harness live (expect 6 PASS), update the docs' "not yet applied" to "applied", commit, merge `rfq-leads/r1-anon` into `main`, push. Check the Vercel production deploy with `npx vercel ls textile-spark-net --prod`.

---

## Release R2 — the same leads on every plan

### Task 4: Cap off and FAQ rewritten, in the database

**Files:**
- Create: `scripts/rfq-leads/r2_same_leads.sql`
- Create: `supabase/migrations/20261003090100_leads_same_on_every_plan.sql`

**Interfaces:**
- Produces: `subscription_plans.limits.leads_per_month = -1` and `display.leads = 'Unlimited'` on every plan; the seven FAQ rows below rewritten with `translations.hi` and `translations.gu`.

- [ ] **Step 1: Write the failing harness** — `scripts/rfq-leads/r2_same_leads.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/LEADS HARNESS R2: the same leads on every plan (2026-10-03).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R2".
--   every plan unlimited      limits.leads_per_month = -1 on all five plans
--   eleven leads, free plan   a vendor with no active plan quotes on 11 open RFQs in one
--                             period (the old free cap was 10)
--   the vendor's own plan     get_vendor_plan() reports -1
--   ranking for a free vendor match_vendor_rfqs scores the fixtures for that vendor
--   no FAQ promises a cap     no active FAQ mentions a lead limit, leads a month,
--                             pay-per-lead or lead access
--   rewritten FAQs translated every rewritten row present carries Hindi and Gujarati
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $r2$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  rewritten uuid[] := array[
    '8df64c7b-3c9a-4903-ac60-c42c4f15cdff', '28d6da8b-e415-4f5f-bc72-07956978bbcb',
    '8b7e9d19-0058-48dd-9d47-6599ec213aa9', '8394ec5f-babe-43b9-aecc-5720de8532b7',
    '92465a9f-516b-4250-a27d-daa2d64a4629', '74229530-ef50-48c8-b100-8221f067d59b',
    '0bcaaa6a-5316-4ff1-a3a2-eeb043a69b57']::uuid[];
  labels text[] := array[
    'every plan unlimited', 'eleven leads on a free plan', 'get_vendor_plan says unlimited',
    'ranking for a free vendor', 'no FAQ promises a cap', 'rewritten FAQs translated'];
  ids uuid[]; got text; want text; i int; k int; n int; present int;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      if i in (2, 4) then
        update public.vendor_subscriptions set status = 'expired' where vendor_id = vendor;
        ids := '{}';
        for k in 1..11 loop
          ids := ids || gen_random_uuid();
          insert into public.rfqs (id, buyer_id, title, status) values (ids[k], buyer, 'R2 lead ' || k, 'active');
        end loop;
      end if;
      if i in (2, 3, 4) then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', vendor::text, true);
        set local role authenticated;
      end if;

      if i = 1 then
        select string_agg(distinct coalesce(limits ->> 'leads_per_month', 'null'), ',') into got from public.subscription_plans;
        want := '-1';
      elsif i = 2 then
        n := 0;
        for k in 1..11 loop
          insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr) values (ids[k], vendor, 100, 100);
          n := n + 1;
        end loop;
        got := n || ' quoted'; want := '11 quoted';
      elsif i = 3 then
        got := public.get_vendor_plan() -> 'limits' ->> 'leads_per_month'; want := '-1';
      elsif i = 4 then
        select count(*) into n from public.match_vendor_rfqs(vendor, 500) m where m.rfq_id = any (ids);
        got := n || ' scored'; want := '11 scored';
      elsif i = 5 then
        select count(*) into n from public.faqs
         where active and (question || ' ' || answer) ~* '(lead limit|leads a month|pay-per-lead|lead access)';
        got := n::text; want := '0';
      else
        select count(*), count(*) filter (where translations ? 'hi' and translations ? 'gu')
          into present, n from public.faqs where id = any (rewritten);
        got := n || ' of ' || present; want := present || ' of ' || present;
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 140) || E'\n';
    end;
  end loop;
  raise exception 'R2 (rolled back)%', E'\n' || out;
end
$r2$;
```

- [ ] **Step 2: Run it locally to see it fail**

Run: `docker exec -i supabase_db_localstack psql -U postgres -At < scripts/rfq-leads/r2_same_leads.sql`
Expected: `every plan unlimited: FAIL`, `eleven leads on a free plan: FAIL -> P0001 Monthly lead limit reached…`, `get_vendor_plan says unlimited: FAIL 10`, `ranking for a free vendor: PASS`, `no FAQ promises a cap: FAIL`, `rewritten FAQs translated: FAIL`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261003090100_leads_same_on_every_plan.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/leads R2: the same leads on every plan (Mitra, 2026-10-02).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R2".
--
-- 1. The lead cap is off. enforce_lead_cap() lets a quote through when the plan's
--    leads_per_month is below 0, so -1 on all five plans switches it off without
--    dropping the trigger; a cap could come back later as a data change.
--    display.leads says "Unlimited" so nothing that still reads it shows a number.
--    get_vendor_plan() is unchanged and reports -1.
-- 2. Seven FAQ answers promised a lead cap, pay-per-lead plans or plan-dependent lead
--    access. Each is rewritten in English, Hindi and Gujarati (faqs.translations), so
--    the snapshot (trg_faqs_snapshot) and the app show the new text in all three.
--    One answer also claimed email/WhatsApp lead alerts; nothing sends those today
--    (claude.md, "No quote, message or RFQ event notifies anyone").
-- Harness: scripts/rfq-leads/r2_same_leads.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The cap ──────────────────────────────────────────────────────────────
update public.subscription_plans
   set limits  = jsonb_set(limits, '{leads_per_month}', '-1'::jsonb),
       display = jsonb_set(display, '{leads}', '"Unlimited"'::jsonb);

-- ── 2. The FAQ ──────────────────────────────────────────────────────────────
-- Subscription and Seller Help: "What happens when I reach my lead limit?"
update public.faqs
   set question = $q$Is there a limit on how many leads I can quote on?$q$,
       answer   = $a$No. Every plan, Free included, can quote on as many buyer requirements as you like. Your plan doesn't change which requirements you see or the order they're in.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$क्या लीड पर कोटेशन भेजने की कोई सीमा है?$q$,
           'answer',   $a$नहीं। मुफ़्त प्लान समेत हर प्लान पर आप जितनी चाहें उतनी खरीदार आवश्यकताओं पर कोटेशन भेज सकते हैं। आपका प्लान यह नहीं बदलता कि आपको कौन-सी आवश्यकताएँ दिखती हैं या वे किस क्रम में दिखती हैं।$a$),
         'gu', jsonb_build_object(
           'question', $q$લીડ પર ક્વોટ મોકલવાની કોઈ મર્યાદા છે?$q$,
           'answer',   $a$ના. મફત પ્લાન સહિત દરેક પ્લાન પર તમે ઇચ્છો તેટલી ખરીદારની જરૂરિયાતો પર ક્વોટ મોકલી શકો છો. તમારો પ્લાન એ બદલતો નથી કે તમને કઈ જરૂરિયાતો દેખાય છે કે તે કયા ક્રમમાં દેખાય છે.$a$))
 where id in ('8df64c7b-3c9a-4903-ac60-c42c4f15cdff', '28d6da8b-e415-4f5f-bc72-07956978bbcb');

-- Seller Help: "What counts as a lead?"
update public.faqs
   set answer = $a$A lead is a buyer's open requirement that you can quote on. There's no limit on any plan. Requests a buyer sends to you directly have their own list on the Leads page.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$लीड किसे गिना जाता है?$q$,
           'answer',   $a$लीड किसी खरीदार की खुली आवश्यकता है जिस पर आप कोटेशन भेज सकते हैं। किसी भी प्लान पर कोई सीमा नहीं है। कोई खरीदार सीधे आपको जो अनुरोध भेजता है, वे लीड्स पेज पर अपनी अलग सूची में दिखते हैं।$a$),
         'gu', jsonb_build_object(
           'question', $q$લીડ કોને ગણવામાં આવે છે?$q$,
           'answer',   $a$લીડ એટલે કોઈ ખરીદારની ખુલ્લી જરૂરિયાત જેના પર તમે ક્વોટ મોકલી શકો છો. કોઈ પણ પ્લાન પર કોઈ મર્યાદા નથી. કોઈ ખરીદાર સીધી તમને જે વિનંતીઓ મોકલે છે, તે લીડ્સ પેજ પર તેમની અલગ યાદીમાં દેખાય છે.$a$))
 where id = '8b7e9d19-0058-48dd-9d47-6599ec213aa9';

-- Subscription: "Lowest billing plan?"
update public.faqs
   set answer = $a$Yes! Plans start at just ₹699/month (or ₹6,990/year) with Basic: 10 product listings. Just getting started? Our Free plan costs nothing and gives you 2 listings. Every plan can quote on unlimited buyer leads. Prices exclude GST.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$सबसे कम बिलिंग प्लान?$q$,
           'answer',   $a$हाँ! प्लान केवल ₹699/माह (या ₹6,990/वर्ष) से शुरू होते हैं, बेसिक में: 10 उत्पाद लिस्टिंग। अभी शुरुआत कर रहे हैं? हमारा मुफ़्त प्लान कुछ नहीं लेता और 2 लिस्टिंग देता है। हर प्लान पर आप असीमित खरीदार लीड पर कोटेशन भेज सकते हैं। कीमतों में GST शामिल नहीं है।$a$),
         'gu', jsonb_build_object(
           'question', $q$સૌથી ઓછો બિલિંગ પ્લાન?$q$,
           'answer',   $a$હા! પ્લાન ફક્ત ₹699/મહિનો (અથવા ₹6,990/વર્ષ)થી શરૂ થાય છે, બેઝિકમાં: 10 ઉત્પાદન લિસ્ટિંગ. હમણાં શરૂઆત કરો છો? અમારો મફત પ્લાન કંઈ લેતો નથી અને 2 લિસ્ટિંગ આપે છે. દરેક પ્લાન પર તમે અમર્યાદિત ખરીદાર લીડ્સ પર ક્વોટ મોકલી શકો છો. કિંમતોમાં GST શામેલ નથી.$a$))
 where id = '8394ec5f-babe-43b9-aecc-5720de8532b7';

-- Seller registration: "Is there any cost to register?" (drops the pay-per-lead bullet)
update public.faqs
   set answer = $a$NO, Basic registration is free. You only pay if you opt for:
• Premium listings
• Featured vendor badges$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$क्या पंजीकरण की कोई लागत है?$q$,
           'answer',   $a$नहीं, बेसिक पंजीकरण मुफ़्त है। आप केवल तभी भुगतान करते हैं जब आप चुनते हैं:
• प्रीमियम लिस्टिंग
• फ़ीचर्ड विक्रेता बैज$a$),
         'gu', jsonb_build_object(
           'question', $q$શું નોંધણીનો કોઈ ખર્ચ છે?$q$,
           'answer',   $a$ના, બેઝિક નોંધણી મફત છે. તમે ત્યારે જ ચુકવણી કરો છો જ્યારે તમે પસંદ કરો:
• પ્રીમિયમ લિસ્ટિંગ
• ફીચર્ડ વિક્રેતા બેજ$a$))
 where id = '92465a9f-516b-4250-a27d-daa2d64a4629';

-- Seller registration: "How are leads managed on Cosora?"
update public.faqs
   set answer = $a$Buyer requirements appear on your Leads page, ranked to fit your catalogue. Every plan sees the same requirements and can quote on all of them.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$कोसोरा पर लीड कैसे संभाली जाती हैं?$q$,
           'answer',   $a$खरीदारों की आवश्यकताएँ आपके लीड्स पेज पर दिखती हैं, आपके कैटलॉग से मेल के हिसाब से क्रम में। हर प्लान को वही आवश्यकताएँ दिखती हैं और वह उन सभी पर कोटेशन भेज सकता है।$a$),
         'gu', jsonb_build_object(
           'question', $q$કોસોરા પર લીડ્સ કેવી રીતે સંભાળાય છે?$q$,
           'answer',   $a$ખરીદારોની જરૂરિયાતો તમારા લીડ્સ પેજ પર દેખાય છે, તમારા કેટલોગ સાથેના મેળ પ્રમાણે ક્રમમાં. દરેક પ્લાનને એ જ જરૂરિયાતો દેખાય છે અને તે બધી પર ક્વોટ મોકલી શકે છે.$a$))
 where id = '74229530-ef50-48c8-b100-8221f067d59b';

-- Seller registration: "I don't have a GST number. Can I still register?"
update public.faqs
   set answer = $a$Yes, but your account will be marked as "Unverified Seller", which may affect visibility. We recommend registering your business officially.$a$,
       translations = jsonb_build_object(
         'hi', jsonb_build_object(
           'question', $q$मेरे पास GST नंबर नहीं है। क्या मैं फिर भी पंजीकरण कर सकता हूँ?$q$,
           'answer',   $a$हाँ, पर आपका खाता "असत्यापित विक्रेता" के रूप में मार्क होगा, जिससे दृश्यता पर असर पड़ सकता है। हम अपने व्यवसाय का आधिकारिक पंजीकरण करवाने की सलाह देते हैं।$a$),
         'gu', jsonb_build_object(
           'question', $q$મારી પાસે GST નંબર નથી. શું હું તો પણ નોંધણી કરી શકું?$q$,
           'answer',   $a$હા, પણ તમારું ખાતું "અચકાસાયેલ વિક્રેતા" તરીકે ચિહ્નિત થશે, જેનાથી દૃશ્યતા પર અસર પડી શકે. અમે તમારા વ્યવસાયની સત્તાવાર નોંધણી કરાવવાની ભલામણ કરીએ છીએ.$a$))
 where id = '0bcaaa6a-5316-4ff1-a3a2-eeb043a69b57';

-- ── Self-check ──────────────────────────────────────────────────────────────
do $check$
declare
  v_bad text;
begin
  select string_agg(id, ', ') into v_bad from public.subscription_plans
   where coalesce((limits ->> 'leads_per_month')::int, 0) <> -1;
  if v_bad is not null then
    raise exception 'R2 self-check: plans still capped: %', v_bad;
  end if;
  select string_agg(left(question, 60), ' | ') into v_bad from public.faqs
   where active and (question || ' ' || answer) ~* '(lead limit|leads a month|pay-per-lead|lead access)';
  if v_bad is not null then
    raise exception 'R2 self-check: FAQ still promises a cap: %', v_bad;
  end if;
end
$check$;
```

- [ ] **Step 4: Apply locally and run the harness to see it pass**

Run: `docker exec -i supabase_db_localstack psql -U postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/20261003090100_leads_same_on_every_plan.sql`
Expected: `UPDATE 5`, then `UPDATE n` per FAQ statement (0 where the local copy lacks a row), then `DO`.
Run the harness (Step 2 command). Expected: six PASS lines.

- [ ] **Step 5: Commit**

```bash
git add scripts/rfq-leads/r2_same_leads.sql supabase/migrations/20261003090100_leads_same_on_every_plan.sql
git commit -m "R2: lead cap off on every plan; FAQ no longer promises a cap; harness"
```

### Task 5: Every vendor gets the ranked feed; the cap leaves the vendor UI

**Files:**
- Modify: `src/lib/queries/rfqs.ts` (`LeadRfq` doc comments, `fetchOpenRfqs`)
- Modify: `src/components/vendor/OpenRfqLeads.tsx`
- Modify: `src/pages/Subscription.tsx` (`FEATURE_ROWS`, the usage tiles, the plan-card feature list)
- Modify: `src/lib/plan.ts` (the `leads_per_month` comment)
- Modify: `src/i18n/hi.json`, `src/i18n/gu.json`
- Modify: `tests/local/rfq-leads.spec.ts`

**Interfaces:**
- Consumes: `match_vendor_rfqs(p_vendor_id uuid, match_count int)` → `{ rfq_id, similarity, category_match, score }[]` (unchanged).
- Produces: `LeadRfq` unchanged in shape; `matched`, `similarity`, `score`, `strongMatch` now filled for every vendor.

- [ ] **Step 1: Add the failing spec** — append to `tests/local/rfq-leads.spec.ts`:

```ts
import { clientAs, service, sql } from "./stack";

test.describe("R2: the same leads on every plan", () => {
  test("a vendor with no plan quotes on 11 leads and sees no cap anywhere", async ({ browser }) => {
    const db = service();
    const buyer = (await db.from("profiles").select("id").eq("id", "11111111-1111-1111-1111-111111111111").single()).data!.id;
    sql(`update public.vendor_subscriptions set status = 'expired' where vendor_id = '22222222-2222-2222-2222-222222222222'`);
    const { data: rfqs } = await db.from("rfqs")
      .insert(Array.from({ length: 11 }, (_, i) => ({ buyer_id: buyer, title: `R2 spec lead ${i + 1}`, status: "active" })))
      .select("id");
    try {
      const vendor = await clientAs("vendor");
      for (const r of rfqs!) {
        const { error } = await vendor.from("quotes").upsert(
          { rfq_id: r.id, vendor_id: "22222222-2222-2222-2222-222222222222", price_per_unit: 100, price_inr: 100, status: "pending" },
          { onConflict: "rfq_id,vendor_id" },
        );
        expect(error).toBeNull();
      }

      const ctx = await signedInContext(browser, "vendor", { width: 1440, height: 1000 });
      const page = await ctx.newPage();
      await page.goto(`${BUYER_URL}/leads`);
      await expect(page.getByText("Buyer Requirements")).toBeVisible();
      await expect(page.getByText(/leads used/)).toHaveCount(0);
      await expect(page.getByText(/Monthly lead limit/)).toHaveCount(0);
      await expect(page.getByText("Upgrade to quote")).toHaveCount(0);

      await page.goto(`${BUYER_URL}/subscription`);
      await expect(page.getByText("Current billing")).toBeVisible();
      await expect(page.getByText("Monthly Leads")).toHaveCount(0);
      await expect(page.getByText(/leads \/ month/)).toHaveCount(0);
      await expect(page.getByText("Leads / month (est.)")).toHaveCount(0);
      await ctx.close();
    } finally {
      await db.from("quotes").delete().in("rfq_id", rfqs!.map((r) => r.id));
      sql(`delete from public.rfqs where title like 'R2 spec lead %'`);
    }
  });
});
```

(Fold the new imports into the file's single import line from `./stack`.)

- [ ] **Step 2: Run it to see it fail** — the R2 test FAILS on "leads used" being visible (the counter still renders).

- [ ] **Step 3: Rank for everyone** — in `src/lib/queries/rfqs.ts`, replace the plan read and the `isPaid` branches of `fetchOpenRfqs` with:

```ts
  // Every vendor gets the same ranking (Mitra, 2026-10-02: leads are the same on
  // every plan; documentation/rfq-leads-pipeline-design-2026-10-02.md, R2). The
  // weighting lives in one place server-side (match_vendor_rfqs), the same way
  // match_products owns product ranking.
  //
  // Degrades to the chronological list rather than failing: until both sides
  // have an embedding, similarity comes back null and score collapses to the
  // category term alone; a failed RPC leaves every score at 0.
  let matchOf = new Map<string, { similarity: number | null; categoryMatch: boolean; score: number }>();
  const { data: scores, error: scoreErr } = await supabase
    .rpc("match_vendor_rfqs", { p_vendor_id: vendorId, match_count: 200 });
  if (!scoreErr && scores) {
    matchOf = new Map((scores as { rfq_id: string; similarity: number | null; category_match: boolean; score: number }[])
      .map((s) => [s.rfq_id, { similarity: s.similarity, categoryMatch: s.category_match, score: s.score }]));
  }

  const leads: LeadRfq[] = rows.map((r) => {
    const m = matchOf.get(r.id);
    return {
      id: r.id, title: r.title, productName: r.product_name ?? r.title, units: r.quantity ?? 0,
      priceMin: Number(r.budget_min ?? 0), priceMax: Number(r.budget_max ?? 0), image: r.image ?? "",
      date: new Date(r.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
      alreadyQuoted: quoted.has(r.id),
      categoryId: r.category_id ?? null,
      matched: m?.categoryMatch ?? false,
      similarity: m?.similarity ?? null,
      score: m?.score ?? 0,
      strongMatch: (m?.similarity ?? 0) >= STRONG_MATCH_SIMILARITY,
    };
  });

  // Best fit first; ties keep the created_at desc the query already applied.
  return leads.sort((a, b) => b.score - a.score);
```

and update the `LeadRfq` comments: `matched` — "True when this RFQ's category is one of the vendor's live product categories."; `similarity` — "null when either side has no embedding yet, or when scoring failed."

- [ ] **Step 4: Remove the cap from `OpenRfqLeads.tsx`** — drop the imports `Link`, `Crown`, `useVendorPlan`, `capReached`, `isUnlimited`, `remaining`; drop `vplan`, `leadCap`, `leadsUsed`, `capHit`, `leadsLeft`; drop the `if (capHit)` guard in `submit` and the `qc.invalidateQueries({ queryKey: ["vendor_plan"] })` line; drop the header's right-hand counter span, the cap banner `Link`, and the `capHit ?` branch in the per-card ternary (so it reads `r.alreadyQuoted ? … : openId === r.id ? … : …`). Replace the header comment's "Subscription-aware" paragraph with:

```ts
// The same for every plan (RFQ/leads R2, Mitra 2026-10-02): every vendor sees
// the ranked pool with both match badges, and nothing caps how many leads a
// vendor quotes on. enforce_lead_cap() is still installed but every plan's
// leads_per_month is -1, which it treats as unlimited.
```

- [ ] **Step 5: Remove leads from plan copy in `Subscription.tsx`**:
  - delete `{ key: "leads", label: "Leads / month (est.)" },` from `FEATURE_ROWS`;
  - delete the "Monthly Leads" `UsageTile` and change its grid to `grid gap-4 sm:grid-cols-2`;
  - change `"Upgrade for more leads & products"` to `"Upgrade for more products"`;
  - delete the `` `${plan.display.leads} leads / month`, `` line from the plan-card list;
  - remove the `Users` icon import if nothing else uses it.

- [ ] **Step 6: plan.ts comment** — replace the `leads_per_month` comment with: "leads_per_month: -1 on every plan since RFQ/leads R2 (Mitra, 2026-10-02): leads are the same on every plan. enforce_lead_cap() treats a negative value as unlimited; nothing in the app shows it."

- [ ] **Step 7: Translate** — add `"Upgrade for more products"`: hi `"ज़्यादा उत्पादों के लिए अपग्रेड करें"`, gu `"વધુ ઉત્પાદનો માટે અપગ્રેડ કરો"`.

- [ ] **Step 8: Run checks and the spec**

Run: `npm run typecheck && npm run i18n:check && npm run lint -- src/lib/queries/rfqs.ts src/components/vendor/OpenRfqLeads.tsx src/pages/Subscription.tsx`
Expected: clean. Run the spec. Expected: all R1 and R2 tests pass.

- [ ] **Step 9: Commit** — `git commit -m "R2: ranked feed for every vendor; no lead cap in the vendor UI or plan copy"`.

### Task 6: R2 docs, retired cap scripts, release

**Files:**
- Modify: `documentation/claude.md` (the "Subscription tiers" line; "The lead cap applies to the open marketplace only" rule; the plan-cap concurrency rule's lead-cap mention)
- Modify: `documentation/technicalimplementation.md` ("Plan caps" section)
- Modify: `documentation/seller-registration-and-subscription-faq-content.md`
- Modify: `src/i18n/external-strings.json` (remove the FAQ strings that no longer exist)
- Modify: `scripts/cap-race-check.mjs`, `scripts/targeted-lead-cap-check.mjs` (header note)
- Modify: `MIGRATIONS.md`, `documentation/changelog.md`

- [ ] **Step 1: claude.md** — "Subscription tiers (Basic / Silver / Gold) determine vendor lead volume, product listing caps, and geographic ad reach." becomes "…determine product listing caps and geographic ad reach. Leads are the same on every plan (Mitra, 2026-10-02): same ranked feed, no cap." Prefix the lead-cap rule with "**Superseded 2026-10-02 (Mitra): the lead cap is off on every plan (`leads_per_month = -1`, migration `<version>_leads_same_on_every_plan.sql`). Kept for the record:**".
- [ ] **Step 2: technicalimplementation.md "Plan caps"** — add a first paragraph: the lead cap is off at -1 (R2), the trigger stays installed, the product cap is unchanged.
- [ ] **Step 3: FAQ content doc** — replace the lead-limit questions and the "150 leads a month" / "10 leads" figures with the new answers from the migration.
- [ ] **Step 4: external-strings.json** — delete from the `faqs` list: "What happens when I reach my lead limit?", "You'll receive notifications as you approach your limit. You can always upgrade your plan to get more leads or wait for the next billing cycle.", the old "Yes! Plans start at just ₹699/month…" answer, the old "NO, Basic registration is free…" answer, the old "Yes, but your account will be marked as \"Unverified Seller\"…" answer, and the old "You'll get notified via dashboard, email, or WhatsApp…" answer. Each rewritten row carries its own translations. Run `npm run i18n:check`: expected clean.
- [ ] **Step 5: Cap scripts** — add to the top comment of each: "RETIRED 2026-10-03: the lead cap is off on every plan (RFQ/leads R2). This script tests the cap and now reports no refusal; keep it for if a cap ever returns." In `cap-race-check.mjs`, keep the product-cap half live if it has one.
- [ ] **Step 6: MIGRATIONS.md, changelog** — entries as in Task 3.
- [ ] **Step 7: Commit** — `git commit -m "R2: docs, retired lead-cap scripts, FAQ catalogue"`.
- [ ] **Step 8: Release** — rehearsal and permission exactly as Task 3 Steps 4–5, with name `leads_same_on_every_plan`, harness `r2_same_leads.sql` (expect six PASS live), branch `rfq-leads/r2-plan-independent`.

---

## Release R3 — admin oversight: remove and flag

### Task 7: Removal state, guard, audit, no browser deletes, admin RPCs (database)

**Files:**
- Create: `scripts/rfq-leads/r3_oversight.sql`
- Create: `supabase/migrations/20261003090200_rfq_admin_oversight.sql`

**Interfaces:**
- Produces:
  - columns `public.rfqs.removed_at timestamptz`, `removed_by uuid`, `removed_reason text`;
  - `public.admin_lead_remove(p_rfq_id uuid, p_reason text) returns table (id uuid, removed_at timestamptz)`;
  - `admin.lead_rows.stage` may be `'removed'`; new trailing columns `removed_at, removed_by, removed_reason`;
  - `admin_leads_list(p_stage => 'removed')` accepted;
  - `admin_leads_summary(...) -> window.removed int`;
  - `admin_lead_detail(...) -> removal: { at, by, reason } | null`;
  - `admin_flag_add('rfq', …)` for super_admin / product_moderator.

- [ ] **Step 1: Write the failing harness** — `scripts/rfq-leads/r3_oversight.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/LEADS HARNESS R3: admins remove or flag a lead; nobody hard-deletes (2026-10-03).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R3".
-- Fixtures per case: O open-marketplace RFQ with the vendor's quote, D direct RFQ to
-- the vendor. Every line prints PASS or FAIL with what it saw.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $r3$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admn   uuid := '33333333-3333-3333-3333-333333333333';
  o uuid; d uuid;
  labels text[] := array[
    'super_admin removes', 'product_moderator removes', 'vendor_ops refused', 'support refused',
    'finance_admin refused', 'a buyer refused', 'anon refused', 'blank reason', 'unknown RFQ', 'removed twice',
    'buyer cannot reopen', 'buyer cannot edit', 'buyer cannot un-remove', 'buyer cannot insert removed',
    'admin cannot reopen either', 'target vendor no longer sees it', 'quote refused after removal',
    'buyer reads the reason', 'Admin Log row with the reason', 'stage and filter', 'summary counts it apart',
    'detail carries the removal', 'flag rfq as product_moderator', 'flag rfq as support refused',
    'support still flags a product', 'buyer DELETE refused', 'admin DELETE refused'];
  wants text[] := array[
    'closed|removed', 'closed|removed', '42501', '42501',
    '42501', '42501', '42501', '22023', 'P0002', '55000',
    '42501', '42501', '42501', '42501',
    '42501', '0', 'P0001',
    'Spam', '1|Spam', 'removed|1', '1|0', 'Spam|named', 'ok', '42501',
    'ok', '42501', '42501'];
  roles text[] := array['super_admin', 'product_moderator', 'vendor_ops', 'support', 'finance_admin'];
  got text; i int; n int; j jsonb; s0 jsonb; s1 jsonb;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      o := gen_random_uuid(); d := gen_random_uuid();
      insert into public.rfqs (id, buyer_id, title, status) values (o, buyer, 'R3 open', 'active');
      insert into public.rfqs (id, buyer_id, title, status, vendor_id) values (d, buyer, 'R3 direct', 'active', vendor);
      insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr) values (o, vendor, 100, 100);
      insert into admin.admin_users (id, admin_role, is_active)
        values (admn, (case when i between 1 and 5 then roles[i] when i in (23) then 'product_moderator'
                            when i in (24, 25) then 'support' else 'super_admin' end)::public.admin_role_type, true)
        on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;

      -- Cases that need a removed RFQ first: remove D (direct) or O as super_admin.
      if i in (10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22) then
        perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', admn::text, true);
        set local role authenticated;
        if i = 21 then s0 := public.admin_leads_summary(null); end if;
        perform public.admin_lead_remove(case when i = 16 then d else o end, 'Spam');
        reset role;
      end if;

      -- Who acts in the case.
      if i = 7 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object('sub',
          case when i in (6, 11, 12, 13, 14, 18, 26) then buyer when i in (16, 17) then vendor else admn end,
          'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub',
          (case when i in (6, 11, 12, 13, 14, 18, 26) then buyer when i in (16, 17) then vendor else admn end)::text, true);
        set local role authenticated;
      end if;

      begin
        if i between 1 and 7 then
          perform public.admin_lead_remove(o, 'Spam');
          reset role;
          select r.status || '|' || case when r.removed_at is not null and r.removed_reason = 'Spam' and r.removed_by = admn
                                        then 'removed' else 'not removed' end
            into got from public.rfqs r where r.id = o;
        elsif i = 8 then
          perform public.admin_lead_remove(o, '   ');
          got := 'accepted';
        elsif i = 9 then
          perform public.admin_lead_remove(gen_random_uuid(), 'Spam');
          got := 'accepted';
        elsif i = 10 then
          perform public.admin_lead_remove(o, 'Again');
          got := 'accepted';
        elsif i = 11 or i = 15 then
          update public.rfqs set status = 'active' where id = o;
          got := 'accepted';
        elsif i = 12 then
          update public.rfqs set title = 'edited' where id = o;
          got := 'accepted';
        elsif i = 13 then
          update public.rfqs set removed_at = null, removed_reason = null where id = o;
          got := 'accepted';
        elsif i = 14 then
          insert into public.rfqs (buyer_id, title, status, removed_at, removed_reason)
          values (buyer, 'R3 sneaky', 'closed', now(), 'self');
          got := 'accepted';
        elsif i = 16 then
          select count(*)::text into got from public.rfqs where id = d;
        elsif i = 17 then
          insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr, status)
          values (o, vendor, 90, 90, 'pending')
          on conflict (rfq_id, vendor_id) do update set price_per_unit = excluded.price_per_unit, status = 'pending';
          got := 'accepted';
        elsif i = 18 then
          select removed_reason into got from public.rfqs where id = o;
        elsif i = 19 then
          reset role;
          select count(*) || '|' || max(reason) into got from admin.audit_log
           where target_table = 'public.rfqs' and target_id = o::text and action = 'update';
        elsif i = 20 then
          select count(*) into n from public.admin_leads_list(p_stage => 'removed', p_limit => 200) l where l.id = o;
          select l.stage || '|' || n into got from public.admin_leads_list(p_limit => 200) l where l.id = o;
        elsif i = 21 then
          s1 := public.admin_leads_summary(null);
          got := ((s1 -> 'window' ->> 'removed')::int - coalesce((s0 -> 'window' ->> 'removed')::int, 0)) || '|'
              || ((s1 -> 'window' ->> 'closed')::int - (s0 -> 'window' ->> 'closed')::int);
        elsif i = 22 then
          j := public.admin_lead_detail(o);
          got := (j -> 'removal' ->> 'reason') || '|' || case when coalesce(j -> 'removal' ->> 'by', '') <> '' then 'named' else 'unnamed' end;
        elsif i = 23 or i = 24 then
          perform public.admin_flag_add('rfq', o, 'Looks like a duplicate');
          got := 'ok';
        elsif i = 25 then
          perform public.admin_flag_add('product', gen_random_uuid(), 'Check the photos');
          got := 'ok';
        elsif i = 26 or i = 27 then
          delete from public.rfqs where id = o;
          get diagnostics n = row_count;
          got := 'deleted ' || n;
        end if;
      exception when others then
        got := sqlstate;
      end;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = wants[i] then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || wants[i] || ')';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 140) || E'\n';
    end;
  end loop;
  raise exception 'R3 (rolled back)%', E'\n' || out;
end
$r3$;
```

- [ ] **Step 2: Run it locally to see it fail** — expected: most cases FAIL (`42883` function does not exist, `42703` column does not exist); `buyer DELETE refused` FAILs with `deleted 1` (the open delete path today).

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261003090200_rfq_admin_oversight.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/leads R3: admin oversight, remove and flag (Mitra, 2026-10-02).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R3".
--
-- An RFQ still goes live the moment it's posted. Afterwards an admin (super_admin or
-- product_moderator) can:
--   * REMOVE it, with a reason the buyer reads: admin_lead_remove() sets status
--     'closed' plus removed_at / removed_by / removed_reason. Everything that shows
--     only active RFQs (rfqs_select, trg_quotes_accepting_rfq, match_vendor_rfqs, the
--     vendor pool and Direct inbox) drops it unchanged. Quotes stay as history.
--   * FLAG it: admin.admin_flags accepts 'rfq'; a flag is a note, not a takedown.
-- A removal is final for every browser client: trg_rfqs_removal_guard refuses any
-- change to a removed RFQ, and any write of the removal columns, by `authenticated`.
-- admin_lead_remove is a definer function, so its own update runs as the owner.
-- Nobody deletes an RFQ from a browser any more: rfqs_delete is dropped and DELETE is
-- revoked from anon and authenticated (a delete cascades to every quote, accepted
-- ones included, and is refused once chat references the RFQ).
-- Admin changes to rfqs now reach the Admin Log (trg_admin_audit, admins only).
-- Harness: scripts/rfq-leads/r3_oversight.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Removal columns ──────────────────────────────────────────────────────
alter table public.rfqs
  add column removed_at     timestamptz,
  add column removed_by     uuid references public.profiles(id) on delete set null,
  add column removed_reason text;
alter table public.rfqs add constraint rfqs_removal_shape check (
  (removed_at is null and removed_reason is null)
  or (removed_at is not null and status = 'closed'::public.rfq_status and length(btrim(removed_reason)) > 0)
);
comment on column public.rfqs.removed_at is
  'Set by admin_lead_remove() when Cosora takes the RFQ down. A removed RFQ is closed and can''t change again from a browser.';
comment on column public.rfqs.removed_reason is
  'Why Cosora removed it. The buyer reads it in My Quotes.';

-- ── 2. The guard ────────────────────────────────────────────────────────────
create or replace function public.rfqs_removal_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Browser clients only. admin_lead_remove() is a definer function, so its update
  -- runs as the owner; service-role jobs (the embedding worker, account deletion)
  -- are not `authenticated` either.
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.removed_at is not null or new.removed_by is not null or new.removed_reason is not null then
      raise exception 'Only Cosora can mark a request as removed.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.removed_at is not null then
    raise exception 'Cosora removed this request, so it can''t be changed or reopened.' using errcode = '42501';
  end if;
  if (new.removed_at, new.removed_by, new.removed_reason) is distinct from (old.removed_at, old.removed_by, old.removed_reason) then
    raise exception 'Only Cosora can mark a request as removed.' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke execute on function public.rfqs_removal_guard() from public, anon, authenticated;
create trigger trg_rfqs_removal_guard
  before insert or update on public.rfqs
  for each row execute function public.rfqs_removal_guard();

-- ── 3. Admin Log ────────────────────────────────────────────────────────────
create trigger trg_admin_audit
  after insert or update or delete on public.rfqs
  for each row execute function admin.audit_row_change('buyer_id');

-- ── 4. No browser deletes ───────────────────────────────────────────────────
drop policy rfqs_delete on public.rfqs;
revoke delete on public.rfqs from anon, authenticated;

-- ── 5. Remove ───────────────────────────────────────────────────────────────
create or replace function public.admin_lead_remove(p_rfq_id uuid, p_reason text)
returns table (id uuid, removed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_reason  text := nullif(btrim(p_reason), '');
  v_removed timestamptz;
begin
  if not coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[]), false) then
    raise exception 'not authorized: removing a lead needs a super admin or a product moderator' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A removal needs a reason; the buyer will read it.' using errcode = '22023';
  end if;

  select r.removed_at into v_removed from public.rfqs r where r.id = p_rfq_id for update;
  if not found then
    raise exception 'no RFQ %', p_rfq_id using errcode = 'P0002';
  end if;
  if v_removed is not null then
    raise exception 'This RFQ was already removed.' using errcode = '55000';
  end if;

  perform set_config('cosora.audit_reason', v_reason, true);
  update public.rfqs r
     set status = 'closed', removed_at = now(), removed_by = auth.uid(), removed_reason = v_reason
   where r.id = p_rfq_id;
  perform set_config('cosora.audit_reason', '', true);

  return query select r.id, r.removed_at from public.rfqs r where r.id = p_rfq_id;
end
$$;
revoke execute on function public.admin_lead_remove(uuid, text) from public, anon;
grant execute on function public.admin_lead_remove(uuid, text) to authenticated;

-- ── 6. Flags accept 'rfq' (super_admin, product_moderator) ──────────────────
alter table admin.admin_flags drop constraint admin_flags_entity_type_check;
alter table admin.admin_flags add constraint admin_flags_entity_type_check
  check (entity_type = any (array['vendor', 'product', 'ad', 'conversation', 'rfq']));

create or replace function public.admin_flag_add(p_entity_type text, p_entity_id uuid, p_note text)
 returns table(id uuid, entity_type text, entity_id uuid, note text, author_id uuid, created_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_id uuid;
begin
  -- Gate = admin_flags_insert: WITH CHECK (is_admin() AND author_id = auth.uid())
  if not coalesce(public.is_admin(), false) then
    raise exception 'Adding to the flagged-items log requires an admin account'
      using errcode = '42501';
  end if;
  -- A lead is flagged by the roles that may remove one (RFQ/leads R3).
  if p_entity_type = 'rfq'
     and not coalesce(public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[]), false) then
    raise exception 'Flagging a lead needs a super admin or a product moderator'
      using errcode = '42501';
  end if;

  -- The table's CHECK constraints (entity_type, non-blank note) still apply and
  -- raise 23514 exactly as they do for a direct insert.
  insert into admin.admin_flags as f (entity_type, entity_id, note, author_id)
  values (p_entity_type, p_entity_id, p_note, auth.uid())
  returning f.id into v_id;

  return query
    select f.id, f.entity_type, f.entity_id, f.note, f.author_id, f.created_at
      from admin.admin_flags f
     where f.id = v_id;
end
$function$;

-- ── 7. The Leads page sees removals ─────────────────────────────────────────
create or replace view admin.lead_rows as
 select r.id,
    r.created_at,
    r.status::text as rfq_status,
    r.buyer_id,
    r.vendor_id as target_vendor_id,
    r.vendor_id is not null as direct,
    coalesce(nullif(btrim(r.title), ''::text), nullif(btrim(r.product_name), ''::text), 'Untitled request'::text) as title,
    r.product_name,
    r.category_id,
    cat.name as category,
    r.quantity,
    r.budget_min,
    r.budget_max,
    coalesce(q.quotes, 0::bigint)::integer as quotes,
    q.first_quote_at,
    q.accepted_vendor_id,
        case
            when r.removed_at is not null then 'removed'::text
            when q.accepted_vendor_id is not null then 'won'::text
            when r.status::text <> 'active'::text then 'closed'::text
            when coalesce(q.quotes, 0::bigint) > 0 then 'quoted'::text
            when r.created_at > (now() - '24:00:00'::interval) then 'new'::text
            else 'unanswered'::text
        end as stage,
    r.status::text = 'active'::text and coalesce(q.quotes, 0::bigint) = 0 and r.created_at <= (now() - '48:00:00'::interval) as overdue,
    r.removed_at,
    r.removed_by,
    r.removed_reason
   from public.rfqs r
     left join public.categories cat on cat.id = r.category_id
     left join lateral ( select count(*) as quotes,
            min(x.created_at) as first_quote_at,
            (array_agg(x.vendor_id order by x.created_at) filter (where x.status::text = 'accepted'::text))[1] as accepted_vendor_id
           from public.quotes x
          where x.rfq_id = r.id) q on true;

create or replace function public.admin_leads_list(p_stage text default null::text, p_min_age_hours integer default null::integer, p_category uuid default null::uuid, p_direct boolean default null::boolean, p_search text default null::text, p_cursor_at timestamp with time zone default null::timestamp with time zone, p_cursor_id uuid default null::uuid, p_limit integer default 50)
 returns table(id uuid, created_at timestamp with time zone, title text, category text, quantity integer, budget_min numeric, budget_max numeric, buyer_id uuid, buyer_name text, direct boolean, target_vendor_id uuid, target_vendor_name text, rfq_status text, stage text, overdue boolean, quotes integer, first_quote_at timestamp with time zone, accepted_vendor_id uuid, accepted_vendor_name text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_limit  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_search text := nullif(btrim(p_search), '');
  v_like   text;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  if p_stage is not null and p_stage not in ('new', 'unanswered', 'overdue', 'quoted', 'won', 'closed', 'removed') then
    raise exception 'unknown stage %', p_stage using errcode = '22023';
  end if;
  if (p_cursor_at is null) <> (p_cursor_id is null) then
    raise exception 'a cursor needs both created_at and id' using errcode = '22023';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    select l.id, l.created_at, l.title, l.category, l.quantity, l.budget_min, l.budget_max,
           l.buyer_id,
           coalesce(nullif(btrim(bp.company), ''), nullif(btrim(p.full_name), ''), 'Unnamed buyer'),
           l.direct, l.target_vendor_id, tv.brand_name, l.rfq_status, l.stage, l.overdue, l.quotes,
           l.first_quote_at, l.accepted_vendor_id, av.brand_name
      from admin.lead_rows l
      left join public.profiles p on p.id = l.buyer_id
      left join public.buyer_profiles bp on bp.id = l.buyer_id
      left join public.vendor_profiles tv on tv.id = l.target_vendor_id
      left join public.vendor_profiles av on av.id = l.accepted_vendor_id
     where (p_stage is null or (case when p_stage = 'overdue' then l.overdue else l.stage = p_stage end))
       and (p_min_age_hours is null or l.created_at <= now() - make_interval(hours => p_min_age_hours))
       and (p_category is null or l.category_id = p_category)
       and (p_direct is null or l.direct = p_direct)
       and (v_search is null
            or l.title ilike v_like
            or l.product_name ilike v_like
            or p.full_name ilike v_like
            or bp.company ilike v_like)
       and (p_cursor_at is null or (l.created_at, l.id) < (p_cursor_at, p_cursor_id))
     order by l.created_at desc, l.id desc
     limit v_limit;
end
$function$;

create or replace function public.admin_leads_summary(p_days integer default 30)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_from   timestamptz;
  v_result jsonb;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception 'days must be between 1 and 3650' using errcode = '22023';
  end if;
  v_from := case when p_days is null then null else now() - make_interval(days => p_days) end;

  select jsonb_build_object(
    'generated_at', now(),
    'days', p_days,
    -- The open pipeline as it stands, whatever an RFQ's age.
    'open', (select jsonb_build_object(
               'new',        count(*) filter (where l.stage = 'new'),
               'unanswered', count(*) filter (where l.stage = 'unanswered'),
               'overdue',    count(*) filter (where l.overdue),
               'quoted',     count(*) filter (where l.stage = 'quoted'))
               from admin.lead_rows l where l.rfq_status = 'active'),
    -- RFQs created in the window: how they ended up, and how fast vendors answered.
    -- A removed RFQ counts as removed, never as closed (RFQ/leads R3).
    'window', (select jsonb_build_object(
               'rfqs',        count(*),
               'direct',      count(*) filter (where l.direct),
               'won',         count(*) filter (where l.stage = 'won'),
               'closed',      count(*) filter (where l.stage = 'closed'),
               'removed',     count(*) filter (where l.stage = 'removed'),
               'answered',    count(*) filter (where l.first_quote_at is not null),
               'median_first_quote_hours',
                 round((percentile_cont(0.5) within group (
                   order by extract(epoch from (l.first_quote_at - l.created_at)) / 3600)
                   filter (where l.first_quote_at is not null))::numeric, 1),
               -- Only RFQs at least 24 hours old had a full day to be answered.
               'eligible_24h', count(*) filter (where l.created_at <= now() - interval '24 hours'),
               'answered_24h', count(*) filter (where l.created_at <= now() - interval '24 hours'
                                                  and l.first_quote_at <= l.created_at + interval '24 hours'))
               from admin.lead_rows l where v_from is null or l.created_at >= v_from)
  ) into v_result;
  return v_result;
end
$function$;

create or replace function public.admin_lead_detail(p_rfq_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'id', l.id, 'created_at', l.created_at, 'title', l.title, 'product_name', l.product_name,
           'category', l.category, 'quantity', l.quantity, 'budget_min', l.budget_min, 'budget_max', l.budget_max,
           'description', r.description, 'images', to_jsonb(coalesce(r.images, array[]::text[])),
           'rfq_status', l.rfq_status, 'stage', l.stage, 'overdue', l.overdue, 'direct', l.direct,
           'buyer', jsonb_build_object('id', l.buyer_id,
                      'name', coalesce(nullif(btrim(bp.company), ''), nullif(btrim(p.full_name), ''), 'Unnamed buyer')),
           'target_vendor', case when l.target_vendor_id is null then null
                                 else jsonb_build_object('id', l.target_vendor_id, 'name', tv.brand_name) end,
           'removal', case when l.removed_at is null then null
                           else jsonb_build_object('at', l.removed_at, 'reason', l.removed_reason,
                                  'by', case when l.removed_by is null then null else admin.audit_actor_name(l.removed_by) end) end,
           'quotes', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', q.id, 'vendor_id', q.vendor_id, 'vendor_name', v.brand_name,
                         'currency', q.currency, 'price_per_unit', q.price_per_unit, 'price_inr', q.price_inr,
                         'moq', q.moq, 'lead_time', q.lead_time, 'status', q.status::text, 'created_at', q.created_at)
                         order by q.created_at)
                         from public.quotes q
                         left join public.vendor_profiles v on v.id = q.vendor_id
                        where q.rfq_id = l.id), '[]'::jsonb))
    into v_result
    from admin.lead_rows l
    join public.rfqs r on r.id = l.id
    left join public.profiles p on p.id = l.buyer_id
    left join public.buyer_profiles bp on bp.id = l.buyer_id
    left join public.vendor_profiles tv on tv.id = l.target_vendor_id
   where l.id = p_rfq_id;
  if v_result is null then
    raise exception 'no RFQ %', p_rfq_id using errcode = 'P0002';
  end if;
  return v_result;
end
$function$;

-- ── Self-check ──────────────────────────────────────────────────────────────
do $check$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rfqs' and cmd in ('DELETE', 'ALL')) then
    raise exception 'R3 self-check: a DELETE policy remains on rfqs';
  end if;
  if has_table_privilege('authenticated', 'public.rfqs', 'DELETE') or has_table_privilege('anon', 'public.rfqs', 'DELETE') then
    raise exception 'R3 self-check: a browser role can still DELETE rfqs';
  end if;
  if has_function_privilege('anon', 'public.admin_lead_remove(uuid, text)', 'EXECUTE') then
    raise exception 'R3 self-check: anon can call admin_lead_remove';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.rfqs'::regclass and tgname = 'trg_rfqs_removal_guard')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.rfqs'::regclass and tgname = 'trg_admin_audit') then
    raise exception 'R3 self-check: a trigger is missing on rfqs';
  end if;
end
$check$;
```

Before applying anywhere, diff the `admin_leads_list`, `admin_leads_summary`, `admin_lead_detail` and `admin_flag_add` bodies against `pg_get_functiondef` on the target database: the only differences must be the ones commented above.

- [ ] **Step 4: Apply locally, run the harness, see it pass** — same commands as Task 4 Step 4 with this file and `r3_oversight.sql`. Expected: 27 PASS lines. Then re-run `r1_anon_lockdown.sql` and `11_leads.sql`-style regression: `docker exec -i supabase_db_localstack psql -U postgres -At < scripts/rfq-leads/r1_anon_lockdown.sql` (6 PASS).

- [ ] **Step 5: Commit** — `git commit -m "R3: removal state, guard, audit, no browser deletes, admin remove/flag RPCs; harness"`.

### Task 8: Buyer sees "Removed by Cosora" and the reason

**Files:**
- Modify: `src/lib/queries/rfqs.ts` (`RawRfq`, `RFQ_COLUMNS`, `mapRfq`)
- Modify: `src/lib/quotesData.ts` (`Rfq`)
- Modify: `src/pages/MyQuotes.tsx` (request card)
- Modify: `src/lib/database.types.ts` (`rfqs` Row/Insert/Update, `admin_lead_remove`)
- Modify: `src/i18n/hi.json`, `src/i18n/gu.json`
- Modify: `tests/local/rfq-leads.spec.ts`

**Interfaces:**
- Produces: `Rfq.removedReason?: string | null` — non-null exactly when Cosora removed the RFQ.

- [ ] **Step 1: Add the failing spec** (buyer half of R3) — append:

```ts
test.describe("R3: a removed request", () => {
  test("the buyer sees Removed by Cosora with the reason", async ({ browser }) => {
    const db = service();
    const { data: rfq } = await db.from("rfqs")
      .insert({ buyer_id: "11111111-1111-1111-1111-111111111111", title: "R3 spec removed", status: "active" })
      .select("id").single();
    try {
      const admin = await clientAs("admin");
      const { error } = await admin.rpc("admin_lead_remove", { p_rfq_id: rfq!.id, p_reason: "Duplicate of an earlier request" });
      expect(error).toBeNull();

      const ctx = await signedInContext(browser, "buyer");
      const page = await ctx.newPage();
      await page.goto(`${BUYER_URL}/requirement/my-quotes`);
      const card = page.getByRole("button", { name: /R3 spec removed/ });
      await expect(card.getByText("Removed by Cosora")).toBeVisible();
      await expect(card.getByText("Duplicate of an earlier request")).toBeVisible();
      await ctx.close();
    } finally {
      sql(`delete from public.rfqs where id = '${rfq!.id}'`);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail** — expected FAIL: "Removed by Cosora" not found.

- [ ] **Step 3: Types** — in `src/lib/database.types.ts`, add to `rfqs` `Row`: `removed_at: string | null; removed_by: string | null; removed_reason: string | null`; to `Insert` and `Update`: the same three as optional (`?:`). Add to `Functions`:

```ts
      admin_lead_remove: {
        Args: { p_reason: string; p_rfq_id: string }
        Returns: { id: string; removed_at: string }[]
      }
```

(Regenerated from production after the apply; the hand edit must match what generation produces.)

- [ ] **Step 4: Read the columns** — `RawRfq` gains `removed_at: string | null; removed_reason: string | null;`; `RFQ_COLUMNS` gains `, removed_at, removed_reason`; `mapRfq`'s `base` gains `removedReason: r.removed_at ? (r.removed_reason ?? "") : null,`.

- [ ] **Step 5: The type** — in `src/lib/quotesData.ts` `Rfq`, after `status`:

```ts
  /** Why Cosora removed this request (RFQ/leads R3). Non-null exactly when it
   *  was removed; such a request is closed and can't be reopened. Optional so
   *  the static fixtures below need no change. */
  removedReason?: string | null;
```

- [ ] **Step 6: The card** — in `src/pages/MyQuotes.tsx`, replace the status badge and add the reason under the units line:

```tsx
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold",
                              r.removedReason != null ? "bg-red-50 text-red-600"
                                : r.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
                            )}>
                              {r.removedReason != null ? "Removed by Cosora" : r.status === "active" ? "Active" : "Closed"}
                            </span>
```

```tsx
                          {r.removedReason != null && (
                            <p className="mt-1 text-xs text-red-600">
                              <span className="font-semibold">Reason:</span>{" "}
                              <span data-no-translate>{r.removedReason}</span>
                            </p>
                          )}
```

- [ ] **Step 7: Translate** — `"Removed by Cosora"`: hi `"Cosora द्वारा हटाया गया"`, gu `"Cosora દ્વારા દૂર કરાયું"`; `"Reason:"` if missing: hi `"कारण:"`, gu `"કારણ:"`.

- [ ] **Step 8: Checks and spec** — `npm run typecheck && npm run i18n:check`; run the spec: all pass.

- [ ] **Step 9: Commit** — `git commit -m "R3: My Quotes shows Removed by Cosora and the reason"`.

### Task 9: Cosora-Admin Leads page — remove, flag, removed stage

**Files (Cosora-Admin, branch `rfq-leads/r3-oversight` from `origin/main`):**
- Modify: `src/lib/leads.ts`
- Modify: `src/pages/Leads.tsx`
- Modify: `src/components/FlagLog.tsx`
- Modify: `src/lib/roles.ts` (`SECTION_WRITE.leads` and its comments)
- Modify: `src/lib/database.types.ts` (`admin_lead_remove`)
- Test: `tests/local/rfq-leads.spec.ts` in the buyer repo (admin half)

**Interfaces:**
- Consumes: `admin_lead_remove(p_rfq_id, p_reason)`, `admin_lead_detail -> removal`, `admin_leads_summary -> window.removed`, `admin_flag_add('rfq', …)`.
- Produces: `useRemoveLead(): UseMutationResult<void, Error, { id: string; reason: string }>`; `FlagLog` prop `canAdd?: boolean` (default `true`); `FlagEntity` includes `"rfq"`.

- [ ] **Step 1: Add the failing spec** (admin half) — append to the buyer repo's `tests/local/rfq-leads.spec.ts`:

```ts
import { ADMIN_URL } from "./stack";

test("an admin removes a lead with a reason and flags another, and the Leads page shows it", async ({ browser }) => {
  const db = service();
  const { data: rows } = await db.from("rfqs").insert([
    { buyer_id: "11111111-1111-1111-1111-111111111111", title: "R3 spec admin remove", status: "active" },
    { buyer_id: "11111111-1111-1111-1111-111111111111", title: "R3 spec admin flag", status: "active",
      vendor_id: "22222222-2222-2222-2222-222222222222" },
  ]).select("id, title");
  try {
    const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${ADMIN_URL}/leads`);
    await page.getByLabel("Search").fill("R3 spec admin remove");
    await page.getByRole("row", { name: /R3 spec admin remove/ }).getByRole("button", { name: "View" }).click();
    await page.getByRole("button", { name: "Remove lead" }).click();
    await expect(page.getByRole("button", { name: "Remove for good" })).toBeDisabled();
    await page.getByPlaceholder("Why is this being removed? The buyer will read this.").fill("Spam posting");
    await page.getByRole("button", { name: "Remove for good" }).click();
    await expect(page.getByText("Removed by")).toBeVisible();
    await expect(page.getByText("Spam posting")).toBeVisible();
    expect(sql(`select status || '|' || removed_reason from public.rfqs where title = 'R3 spec admin remove'`)).toBe("closed|Spam posting");

    await page.keyboard.press("Escape");
    await page.getByLabel("Search").fill("R3 spec admin flag");
    await page.getByRole("row", { name: /R3 spec admin flag/ }).getByRole("button", { name: "View" }).click();
    await page.getByPlaceholder("Add an internal note…").fill("Same buyer posted this twice");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Same buyer posted this twice")).toBeVisible();
    await ctx.close();
  } finally {
    sql(`delete from admin.admin_flags where entity_type = 'rfq' and note = 'Same buyer posted this twice';
         delete from public.rfqs where title like 'R3 spec admin %'`);
  }
});
```

(The admin app at :5184 must run from the Cosora-Admin worktree on this branch.)

- [ ] **Step 2: Run it to see it fail** — expected FAIL: no "Remove lead" button.

- [ ] **Step 3: `src/lib/leads.ts`** — `LeadStage` becomes `"new" | "unanswered" | "quoted" | "won" | "closed" | "removed"`; `STAGE_LABELS.removed = "Removed"`; `STAGE_RULES.removed = "Taken down by Cosora, with a reason the buyer reads."`; `STAGE_RULES.closed = "Closed by the buyer without accepting a quote."`; `LeadsSummary.window.removed: number`; `LeadDetail.removal: { at: string; by: string | null; reason: string } | null`; the module comment's stage table gains "removed  taken down by an admin (admin_lead_remove), whatever its stage was" and "Read-only" becomes "super_admin and product_moderator may remove or flag a lead; the database checks again." Add:

```ts
/** Take a lead down (super_admin, product_moderator). The reason is shown to the buyer. */
export function useRemoveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      assertWrote(await supabase.rpc("admin_lead_remove", { p_rfq_id: id, p_reason: reason.trim() }), "remove lead");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}
```

(import `useMutation, useQueryClient` from `@tanstack/react-query` and `assertWrote` from `@/lib/supabase`).

- [ ] **Step 4: `FlagLog.tsx`** — `export type FlagEntity = "vendor" | "product" | "ad" | "conversation" | "rfq";` (update the comment: "'rfq' by RFQ/leads R3, written by super_admin and product_moderator only"). Signature `FlagLog({ entityType, entityId, canAdd = true }: { entityType: FlagEntity; entityId: string; canAdd?: boolean })`; render the Textarea/Add row only when `canAdd`, else `<p className="text-xs text-ink-faint">Only super admins and product moderators can add a note here.</p>`.

- [ ] **Step 5: `roles.ts`** — `leads: ["super_admin", "product_moderator"],` with comment "Remove (admin_lead_remove) and flag ('rfq'): super_admin and product_moderator; the database refuses everyone else." and the `SECTION_READ` comment "Read-only" changed to "Remove and flag for super_admin and product_moderator".

- [ ] **Step 6: `Leads.tsx`**:
  - `STAGE_TONE.removed = "critical"`; `STAGE_FILTERS` gains `"removed"` after `"closed"`;
  - the header subtitle becomes "Every buyer request (RFQ) and where it stands: waiting for a first quote, quoted, won, closed or removed. Super admins and product moderators can remove or flag a lead.";
  - the file comment's "Read-only for every role" paragraph is replaced to match;
  - the Note gains `, ${s.window.removed} removed` after the closed count;
  - `LeadDetailModal` reads `const role = useRole(); const writable = canWrite(role, "leads");` and renders, after the stage row:

```tsx
          {d.removal && (
            <div className="rounded-md border border-critical/30 bg-critical-tint p-3 text-xs">
              <span className="font-semibold text-ink">Removed by {d.removal.by ?? "an admin"}</span>{" "}
              <span className="text-ink-faint">{format(new Date(d.removal.at), "d MMM yyyy, HH:mm")}</span>
              <p className="mt-1 whitespace-pre-line text-ink" data-no-translate>{d.removal.reason}</p>
            </div>
          )}
          {writable && !d.removal && <RemoveLead id={d.id} />}
```

    and, after the quotes table, `<FlagLog entityType="rfq" entityId={d.id} canAdd={writable} />`.
  - Add the component:

```tsx
function RemoveLead({ id }: { id: string }) {
  const remove = useRemoveLead();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Remove lead
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-line bg-surface-2 p-3">
      <p className="text-xs text-ink-muted">
        Removing takes this request out of every vendor's leads and closes it for good. Quotes already sent stay as
        history. The buyer sees "Removed by Cosora" and this reason.
      </p>
      <Textarea
        rows={3}
        autoFocus
        value={reason}
        placeholder="Why is this being removed? The buyer will read this."
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          variant="danger"
          size="sm"
          disabled={!reason.trim() || remove.isPending}
          onClick={() =>
            remove.mutate({ id, reason }, {
              onSuccess: () => { setOpen(false); toast.success("Lead removed"); },
              onError: (e) => toast.error(e.message),
            })
          }
        >
          Remove for good
        </Button>
      </div>
    </div>
  );
}
```

    (imports: `useRole` from `@/hooks/useAdminSession`, `canWrite` from `@/lib/roles`, `FlagLog` from `@/components/FlagLog`, `Textarea` from `@/components/ui`, `toast` from `sonner`, `useRemoveLead` from `@/lib/leads`). Check `Tone` has `"critical"` and the `critical` colour tokens exist in the admin Tailwind config; if `bg-critical-tint` doesn't exist, use the classes `Badge tone="critical"` uses.

- [ ] **Step 7: Admin types** — add `admin_lead_remove` to `src/lib/database.types.ts` `Functions` (same shape as Task 8 Step 3).

- [ ] **Step 8: Checks and spec** — in Cosora-Admin: `npm run typecheck && npm run build`. In the buyer worktree: run the local spec. Expected: all pass.

- [ ] **Step 9: Commit (Cosora-Admin)** — `git commit -m "Leads: remove (with a reason) and flag a lead; removed stage"`; commit the spec in the buyer repo: `git commit -m "R3: local spec for the admin remove and flag flow"`.

### Task 10: R3 cleanup path, docs and release

**Files:**
- Modify: `scripts/suspension-gate-check.mjs` (cleanup of its RFQ fixture through a service-role client)
- Modify: `documentation/claude.md`, `documentation/technicalimplementation.md`, `documentation/sides.md` (if it lists the Leads page as read-only), `MIGRATIONS.md`, `documentation/changelog.md`
- Modify (Cosora-Admin): `documentation`/changelog if it keeps one for the Leads page.

- [ ] **Step 1: suspension-gate-check.mjs** — its `cleanup: () => vendor.db.from("rfqs").delete().eq("title", TAG)` now errors (DELETE revoked). Change it to delete with the service-role client the script already builds for other cleanups (or, if it has none, mark the RFQ `closed` through the vendor's own client and note that the row stays, as quotes and chats already do).
- [ ] **Step 2: claude.md** — a new rule under the RFQ rules: "**An admin removes a lead; nobody deletes one (Mitra, 2026-10-02).** `admin_lead_remove()` (super_admin, product_moderator, reason required) closes it and records `removed_at/by/reason`; the buyer sees the reason. `trg_rfqs_removal_guard` freezes a removed RFQ for every browser client. No browser role may DELETE an RFQ. Admins may flag a lead (`admin_flags` 'rfq'). Leads (`admin.lead_rows`) has a `removed` stage, checked before won." Update the Leads paragraph ("the one definition of an RFQ's stage") to include removed.
- [ ] **Step 3: technicalimplementation.md, MIGRATIONS.md, changelog** — entries naming the migration, harness result, spec result.
- [ ] **Step 4: Commit** — `git commit -m "R3: suspension check cleanup; docs"`.
- [ ] **Step 5: Release** — rehearsal and permission exactly as Task 3 Steps 4–5 (name `rfq_admin_oversight`, harness `r3_oversight.sql`, expect 27 PASS live). After the apply: regenerate types from production (MCP `generate_typescript_types`) into both repos' `src/lib/database.types.ts` and confirm the diff against the hand edits is only ordering; merge Cosora-Admin `rfq-leads/r3-oversight` and buyer `rfq-leads/r3-oversight` to their `main`s (buyer first: the admin page calls the new RPC), push both, check both Vercel production deploys.

---

## Self-review notes

- Spec coverage: R1 policy (T1), R1 UI (T2), R1 docs (T3); R2 cap (T4), ranking (T5), copy (T5), FAQ (T4, T6), docs and scripts (T6); R3 columns/guard/audit/delete/flags/RPC/lead_rows/list/summary/detail (T7), buyer view (T8), admin page and roles (T9), suspension script and docs (T10). R4 is out of scope by decision.
- Spec wording fixed here: the FAQ answer "every plan sees the same requirements in the same order" became "your plan doesn't change which requirements you see or the order they're in", because the order depends on each vendor's catalogue, not on the plan. The spec's FAQ table is updated to match.
