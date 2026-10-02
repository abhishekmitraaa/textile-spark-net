# RFQ / Leads pipeline — design (R1–R3)

**Status:** design approved by Mitra, 2026-10-02. Not built.
**Source:** Mitra's "RFQ / Leads Pipeline — Target Design" (2026-10-02, revised twice that day). This document
replaces it as the build spec: it keeps its three decisions, corrects the facts that turned out different in
the live database, and records the choices made while designing.

Only buyers post RFQs; vendors quote on them. "Lead" means an RFQ a vendor can quote on.

## The decisions

1. **Signed-out visitors see no RFQ data**, through the UI or the API.
2. **Leads are the same on every plan.** Every vendor gets the same ranked feed and can quote on any number
   of leads. The lead cap goes. This removes the one piece of plan-based monetisation in this feature, on
   purpose: plans keep their value through listing caps, ad reach, search boost and the trust seal.
3. **No pre-publish approval.** An RFQ is live the moment it's posted, as today. Admins get oversight after
   the fact: **remove** a lead (reason required) or **flag** it (a note, no effect on visibility).

Settled while designing (Mitra, 2026-10-02):

| Question | Decision |
|---|---|
| Scope | R1, R2 and R3 now, as separate releases. Personalisation (R4) gets its own spec later. |
| Direct requests (an RFQ sent to one named vendor) | Admins can remove and flag them too. |
| What the buyer sees after a removal | "Removed by Cosora" plus the admin's reason, in My Quotes. |
| Leads in plan copy | Removed from plan cards, the comparison table and the usage tiles. |
| How a removal is stored | `status = 'closed'` plus removal columns (approach A below). |
| Hard delete | No browser client, buyer or admin, may DELETE an RFQ. |
| "Universal leads page" | Means the open-marketplace pool. Direct requests stay in their own inbox on `/leads`. |

## What the live database shows (checked 2026-10-02)

| Claim in the source spec | Finding |
|---|---|
| Anon can read open RFQs | **True.** As `anon`: 3 RFQs, all 3 open-marketplace. `rfqs_select` is `TO public` and its open-marketplace branch has no signed-in check. |
| `quotes_select` may leak to anon | **False.** As `anon`: 0 quotes. `owns_rfq()` compares with `auth.uid()`, which is null for anon. |
| Other API paths | `match_vendor_rfqs` is not executable by anon. `get_vendor_plan` and `owns_rfq` are, but return null / false for anon. No view exposes `rfqs`. |
| Signed-out UI | Leaks nothing (the queries are disabled without a user), but `/leads` renders the vendor shell with a false "No open buyer requirements right now". No vendor route asks visitors to sign in. |
| Ranking is inert for everyone | **No.** 6 of 11 vendors have a catalogue embedding and all 4 RFQs have one. Only the single paid vendor lacks one, so today nobody sees ranking; without the paywall, 6 free vendors would. |
| The cap is live | **True.** `trg_quotes_lead_cap` → `enforce_lead_cap()`. Plans allow 10 / 150 / 360 / 600 / 6,000 leads a month. The trigger already treats `leads_per_month < 0` as unlimited. |
| Deleting an RFQ is destructive | **True.** `quotes.rfq_id` is `ON DELETE CASCADE`; `messages.rfq_id` is `NO ACTION`. |
| Delete is only a risk if someone writes it | **No: it's open today.** `rfqs_delete` lets the buyer, super_admin and product_moderator DELETE from a browser. No screen uses it. |
| Admin writes reach the Admin Log | Flags do (`admin.admin_flags` has `trg_admin_audit`). Changes to `rfqs` do not: it has no audit trigger. |
| Flag types | `'vendor','product','ad','conversation'`. `admin_flag_add` lets any admin role write a flag. |
| A removal stays removed | Not by itself: `rfqs_update` lets a buyer change any column of their own RFQ, `status` included. |

## R1 — No RFQ data for signed-out visitors

**Database.** Recreate `rfqs_select` with `TO authenticated` and the same predicate, written the Phase 12 way
(one policy per command, wrapped calls):

```sql
create policy rfqs_select on public.rfqs for select to authenticated using (
  (status = 'active' and (vendor_id is null or vendor_id = (select auth.uid())))
  or buyer_id = (select auth.uid())
  or (select public.is_admin())
);
```

Anon then matches no policy and reads nothing. Every signed-in user keeps exactly today's access. That
includes a signed-in non-vendor reading the open board, which `claude.md` records as deliberate. `quotes_select` is
unchanged; a test pins its anon result at 0.

**UI.** When nobody is signed in, `/leads` and the RFQ card on `/seller-home` show "Sign in to see buyer
requirements" with a link to the existing login page, instead of the empty state. The sign-in flow itself is
not touched (`claude.md`, "Mobile number + OTP login").

**Docs.** `claude.md`'s "Any signed-in user may read any ACTIVE open-marketplace RFQ" gains: anon reads none,
enforced by `TO authenticated` (date and migration).

## R2 — The same leads on every plan

**Turning the cap off.** One data change: `subscription_plans.limits.leads_per_month = -1` on all five plans,
and `display.leads = 'Unlimited'` so nothing that still reads it says a number. `enforce_lead_cap()` stays
installed and lets every quote through at `-1`, so a cap could come back later as a data change. (Dropping
it is also refused by the migration tool here.) `get_vendor_plan()` is unchanged; its `leads_used` simply
stops being shown. The two targeted-request exemptions stay in the code as they are.

**Ranking for everyone.** `fetchOpenRfqs()` (`src/lib/queries/rfqs.ts`) stops reading the plan. Every vendor
gets `match_vendor_rfqs` scores, the "Matches your category" and "Strong match" badges, and the ranked order.
The comment calling the paywall "the business model" goes. A failed scoring call still falls back to the
chronological list.

**Copy that has to go.**

| Where | Change |
|---|---|
| `OpenRfqLeads.tsx` | Remove the "N/M leads used" counter, the cap banner, the cap toast and "Upgrade to quote". Drop its `useVendorPlan` read. |
| `Subscription.tsx` | Remove the "Monthly Leads" usage tile (the row goes from three tiles to two), the "leads / month" line on plan cards and the "Leads / month (est.)" comparison row. "Upgrade for more leads & products" becomes "Upgrade for more products". |
| `src/lib/plan.ts` | The `leads_per_month` comment says the cap is off (-1 on every plan) and why. |
| i18n | New strings get Hindi and Gujarati; strings no longer used are left alone, as elsewhere. |

**FAQ answers.** Seven live rows promise a cap, pay-per-lead plans or plan-dependent lead access. Proposed
English below; Hindi and Gujarati are written with it and checked in review. Row `d49f0fa9` is already inactive
and stays so.

| Row | Today | Proposed |
|---|---|---|
| `8df64c7b` subscription · "What happens when I reach my lead limit?" | Notifications near the limit; upgrade or wait. | **Q:** "Is there a limit on how many leads I can quote on?" **A:** "No. Every plan, Free included, can quote on as many buyer requirements as you like, and every plan sees the same requirements in the same order." |
| `28d6da8b` seller help · same question | Can't quote until the next period or an upgrade. | Same new question and answer as above. |
| `8b7e9d19` seller help · "What counts as a lead?" | Counts once towards the plan's limit. | "A lead is a buyer's open requirement that you can quote on. There's no limit on any plan. Requests a buyer sends to you directly have their own list on the Leads page." |
| `8394ec5f` subscription · "Lowest billing plan?" | "…Basic: 10 product listings and 150 leads a month… Free… 2 listings and 10 leads a month." | "Yes! Plans start at just ₹699/month (or ₹6,990/year) with Basic: 10 product listings. Just getting started? Our Free plan costs nothing and gives you 2 listings. Every plan can quote on unlimited buyer leads. Prices exclude GST." |
| `92465a9f` registration · "Is there any cost to register?" | Bullets include "Pay-per-lead access". | Remove that bullet; the rest unchanged. |
| `74229530` registration · "How are leads managed on Cosora?" | Notified "via dashboard, email, or WhatsApp"; "pay-per-lead plans" in future. | "Buyer requirements appear on your Leads page, ranked to fit your catalogue. Every plan sees the same requirements and can quote on all of them." (This also drops the email and WhatsApp claim: no RFQ event notifies anyone today, per `claude.md`.) |
| `0bcaaa6a` registration · "I don't have a GST number…" | "…may affect visibility and lead access." | "…may affect visibility." |

The FAQ edits ship as a migration (rows are audited; translations live in `faqs.translations`).
`documentation/seller-registration-and-subscription-faq-content.md` is updated to match.

**Docs.** `claude.md`: the "Subscription tiers determine vendor lead volume" line and the lead-cap rule are
marked superseded (Mitra, 2026-10-02), keeping the targeted-request exemption note for the record.
`technicalimplementation.md` → "Plan caps": the lead cap is off at `-1`. `scripts/cap-race-check.mjs` and
`scripts/targeted-lead-cap-check.mjs` test the lead cap: each gets a header saying the cap is off and what it
would test if one came back. The product-cap race check stays live.

**Not built here.** The paid vendor's catalogue has no embedding, and `vendor_catalog_recompute` is off on
purpose. Turning that job on is Mitra's call on cron jobs, not part of this release.

## R3 — Admin oversight: remove and flag

### How a removal is stored (approach A)

```sql
alter table public.rfqs
  add column removed_at     timestamptz,
  add column removed_by     uuid references public.profiles(id) on delete set null,
  add column removed_reason text,
  add constraint rfqs_removal_shape check (
    (removed_at is null and removed_reason is null)
    or (removed_at is not null and status = 'closed' and length(btrim(removed_reason)) > 0)
  );
```

A removed RFQ is `closed`, so everything that already shows only active RFQs drops it with no change:
`rfqs_select`, `trg_quotes_accepting_rfq` (no new quotes), `match_vendor_rfqs`, the vendor pool and the Direct
inbox. "Closed by the buyer" and "removed by Cosora" stay distinguishable through `removed_at`. The enum and the
TypeScript status unions don't change.

Rejected: a new `removed` enum value (needs two migrations, since a new enum value can't be used in the
transaction that adds it, and touches every status union); a separate `admin.rfq_removals` table (the buyer
must read the reason, so it would need its own reader for no gain).

### Writes

- **`admin_lead_remove(p_rfq_id uuid, p_reason text)`**: `SECURITY DEFINER`, `search_path ''`.
  - Allowed for super_admin and product_moderator, otherwise `42501`.
  - A blank reason gets `22023`; an unknown RFQ gets `P0002`; an RFQ that is already removed gets `55000`.
  - Works on an active or a buyer-closed RFQ.
  - Sets `cosora.audit_reason` (transaction-local), then writes `status`, `removed_at`, `removed_by` and `removed_reason`.
  - `EXECUTE` is granted to authenticated only.
- **Guard: `trg_rfqs_removal_guard`** (BEFORE INSERT OR UPDATE, invoker). It applies only when
  `current_user = 'authenticated'`, the same opening as the plan-cap triggers. `admin_lead_remove` is a definer
  function, so its update runs as the owner and passes.
  - For `authenticated`, the `removed_*` columns can't be set on insert or changed on update.
  - A removed RFQ can't be updated at all. That stops a buyer reopening it or editing its text.
- **Admin Log:** `trg_admin_audit` is added to `public.rfqs` with owner column `buyer_id`. It records admin
  actors only, so buyer activity isn't logged. A removal lands with its reason; the embedding worker's writes
  are skipped already.
- **Flags:**
  - `admin.admin_flags`'s type check gains `'rfq'`, and `FlagLog`'s `FlagEntity` type is changed to match.
  - `admin_flag_add` refuses an `'rfq'` flag from anyone but super_admin and product_moderator; other flag types keep their current roles.
  - Flags already reach the Admin Log.
- **No browser deletes:** `rfqs_delete` is dropped and `DELETE` on `rfqs` revoked from anon and authenticated,
  so an attempt errors loudly instead of quietly affecting 0 rows. Service-role jobs and `scripts/loadtest-cleanup.sql`
  (postgres) are unaffected. `scripts/suspension-gate-check.mjs` cleans up with a client-side delete and moves to
  a service-role cleanup.

### Reads and screens

- **`admin.lead_rows`** gains the stage `removed`, checked before `won`, plus `removed_at`, `removed_by` and
  `removed_reason`. `removed` is not `overdue`. `admin_leads_list` accepts `removed` as a stage filter;
  `admin_leads_summary` counts removed RFQs on their own instead of as closed; `admin_lead_detail` returns the
  removal (when, who by name, reason). Cosora-Admin's `lib/leads.ts` stage rules change in the same release.
- **Cosora-Admin Leads page:**
  - The detail modal gets "Remove lead" (reason required, confirm step) and a `FlagLog` for both open and direct requests. Both are shown only to super_admin and product_moderator.
  - `roles.ts` `leads` write list becomes `["super_admin", "product_moderator"]`, and the "Read-only" header copy is updated.
  - A removed lead shows its own badge and the reason.
- **Buyer, My Quotes:** an RFQ with `removed_at` shows **"Removed by Cosora"** and the reason. `RFQ_COLUMNS`
  gains `removed_at` and `removed_reason`; the buyer reads them through the existing `buyer_id` branch of
  `rfqs_select`.
- **Vendor:** a removed RFQ leaves the pool or the Direct inbox. A vendor's quote on it stays as history, the
  same as on a closed RFQ, and accepted quotes keep counting toward Total Order Value.

## Testing

Each migration is rehearsed on the local stack (`scripts/local-stack/`), then in a rolled-back transaction on
production where the tool allows it. Anything the tool refuses to rehearse is named, never skipped quietly.

- **R1:**
  - anon reads 0 RFQs and 0 quotes;
  - a signed-in buyer who isn't a vendor still reads every active open RFQ;
  - vendor, buyer and admin access is otherwise unchanged (`scripts/admin-completion/16_rls_equivalence.sql`);
  - `/leads` signed out shows the sign-in prompt.
- **R2:**
  - a free vendor quotes on more leads than the old free cap (10) in one period;
  - a free vendor gets the same scores as a paid one;
  - no cap text renders on `/leads` or `/subscription`;
  - the FAQ rows read as approved in all three languages.
- **R3:**
  - removal works for super_admin and product_moderator and is refused for vendor_ops, support, vendors and buyers;
  - a blank reason is refused, and so is removing twice;
  - the buyer can't reopen, edit or un-remove a removed RFQ;
  - a removed RFQ disappears from the pool and the Direct inbox and refuses quotes;
  - each removal writes one Admin Log row with its reason;
  - the `'rfq'` flag role matrix holds;
  - DELETE is refused for buyer and admin;
  - removed RFQs show up correctly in the list, summary and detail (stage, counts, removal info);
  - My Quotes shows the removal.

## Delivery

R1, then R2, then R3, each on its own branches (`rfq-leads/r1-anon`, `-r2-plan-independent`, `-r3-oversight`) in
the buyer repo and, for R3, Cosora-Admin. Each migration is committed under its live version name. Generated
types are regenerated from production after each apply. Mitra is asked before every merge to `main` (that deploys
production) and before every production apply.

## R4 — Personalisation (later, own spec)

Recorded so it isn't lost:

- **Type:** `match_vendor_rfqs`, live for everyone after R2.
- **Location:** vendor city is filled for 10 of 11 vendors, state for only 3. Buyer location is known for 2 of 4
  RFQs. RFQs have no location field of their own.
- **Scale:** `vendor_profiles.capacity` is filled for 1 of 11 vendors, and it's a size label ("Large"), not a
  number that can be compared with an RFQ's quantity.
- **Vendor review:** it can't rank one vendor's own feed, because their rating is the same on every lead they
  see. It could only decide *which vendors see a lead*, and decision 2 rules that out. It needs redefining before
  it can be built.
