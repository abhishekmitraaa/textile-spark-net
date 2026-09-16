-- Lead cap: enforce the same count the vendor is shown.
--
-- ── The bug ────────────────────────────────────────────────────────────────
-- get_vendor_plan() reports `usage.leads_used` as quotes on OPEN-MARKETPLACE
-- RFQs only (`join rfqs r … where r.vendor_id is null`). Migration
-- exclude_targeted_rfqs_from_leads_used set that rule deliberately: a Direct
-- Quote Request is addressed to one vendor, so answering it must not spend a
-- lead slot.
--
-- enforce_lead_cap(), the BEFORE INSERT trigger that actually refuses a quote,
-- never got the same rule. It counted every quote in the period, targeted or
-- not. Reproduced live on 2026-09-16 with a real login as
-- loadtest-vendor-3@cosora.test (db85f246-0067-441d-9214-2e0b86eee4a1), free
-- plan, cap 10:
--   dashboard:  leads_used = 7        (7 open-marketplace quotes)
--   trigger:    P0001 "Monthly lead limit reached … you have already quoted 171"
--                                      (7 open + 164 targeted)
-- The vendor saw three slots left and could use none of them.
--
-- ── Why the count lives in a SECURITY DEFINER helper ───────────────────────
-- The obvious fix, adding the join inside the trigger, is subtly wrong.
-- enforce_lead_cap() is SECURITY INVOKER, so a join to `rfqs` runs under the
-- vendor's RLS, and rfqs_select only shows a vendor RFQs whose
-- `status = 'active'`. Once a buyer closes an open RFQ the vendor quoted, that
-- quote would drop out of the count and hand the slot back. Quote ten open
-- RFQs, let them close, quote ten more: a cap bypass. (Not visible on today's
-- data only because every RFQ that vendor quoted is still active; checked by
-- running the naive count as the vendor under RLS.) get_vendor_plan() is
-- SECURITY DEFINER and sees every row, so matching it means counting with
-- definer rights too.
--
-- The trigger itself cannot simply become SECURITY DEFINER: its first check is
-- `if current_user <> 'authenticated' then return new`, and under definer
-- rights current_user is the function owner, so the cap would silently stop
-- applying to everyone. Hence a separate helper for the count, and the trigger
-- keeps its invoker rights and its guard unchanged.
--
-- ── What else changes, and what does not ───────────────────────────────────
-- * The period window now matches get_vendor_plan() exactly: the subscription's
--   own period is used only for a PAID plan; otherwise the calendar month. The
--   trigger previously used the subscription period for any active row. Every
--   active subscription today is paid (basic / gold / silver), so this changes
--   no current result; it removes a divergence rather than fixing an observed
--   one.
-- * get_vendor_plan() is not modified. It is the documented source of truth.
-- * NOT changed, and flagged for a product decision instead: a vendor whose
--   OPEN quotes have reached the cap is still refused when answering a TARGETED
--   request, even though targeted replies do not count and that migration's
--   comment calls the Direct Quote Request inbox "intentionally not gated by the
--   cap". Exempting targeted quotes would loosen a paid limit, which is not this
--   migration's call to make.

create or replace function public.lead_cap_used(p_vendor uuid, p_since timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  n integer;
begin
  -- Callable only for yourself (the trigger always passes the inserting
  -- vendor's own id, enforced by quotes_insert's `vendor_id = auth.uid()`), or
  -- by an admin. Fails closed: a NULL here would make `used >= cap` NULL and
  -- let the insert through.
  if p_vendor is distinct from auth.uid() and not coalesce(public.is_admin(), false) then
    raise exception 'lead_cap_used: not permitted for another vendor'
      using errcode = '42501';
  end if;

  -- Identical to get_vendor_plan()'s leads_used query.
  select count(distinct q.rfq_id)
    into n
    from public.quotes q
    join public.rfqs r on r.id = q.rfq_id
   where q.vendor_id = p_vendor
     and q.created_at >= p_since
     and r.vendor_id is null;

  return coalesce(n, 0);
end;
$function$;

comment on function public.lead_cap_used(uuid, timestamptz) is
  'Open-marketplace lead usage for the lead cap. SECURITY DEFINER so closed RFQs still count; self or admin only. Same query as get_vendor_plan().usage.leads_used.';

-- The trigger runs as `authenticated`, so that role needs EXECUTE. The function
-- itself refuses any vendor but the caller.
revoke all on function public.lead_cap_used(uuid, timestamptz) from public, anon;
grant execute on function public.lead_cap_used(uuid, timestamptz) to authenticated, service_role;

create or replace function public.enforce_lead_cap()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  eff_plan   text := 'free';
  sub_plan   text;
  sub_status text;
  sub_start  timestamptz;
  sub_end    timestamptz;
  cap        integer;
  used       integer;
  win_start  timestamptz;
  already    boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op <> 'INSERT' then
    return new;
  end if;

  select exists(
    select 1 from public.quotes q
     where q.rfq_id = new.rfq_id and q.vendor_id = new.vendor_id
  ) into already;
  if already then
    return new;
  end if;

  select vs.plan_id, vs.status, vs.current_period_start, vs.current_period_end
    into sub_plan, sub_status, sub_start, sub_end
    from public.vendor_subscriptions vs
   where vs.vendor_id = new.vendor_id;

  if sub_plan is not null and sub_status = 'active'
     and sub_end is not null and sub_end > now() then
    eff_plan := sub_plan;
    -- Same window rule as get_vendor_plan(): subscription period for a paid
    -- plan only, otherwise the calendar month.
    if sub_plan <> 'free' then
      win_start := sub_start;
    end if;
  end if;
  win_start := coalesce(win_start, date_trunc('month', now()));

  select coalesce((limits->>'leads_per_month')::int, 0)
    into cap
    from public.subscription_plans
   where id = eff_plan;
  cap := coalesce(cap, 0);

  if cap < 0 then
    return new;
  end if;

  -- Open-marketplace quotes only, counted with definer rights.
  used := public.lead_cap_used(new.vendor_id, win_start);

  if used >= cap then
    raise exception
      'Monthly lead limit reached: your % plan allows % lead(s) per period; you have already quoted % this period. Upgrade your plan to quote more.',
      eff_plan, cap, used
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;
