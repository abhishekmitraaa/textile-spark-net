-- Targeted requests are never gated by the lead cap (Master Prompt 12, Part A).
--
-- Decision (Andy, 2026-09-22): a quote on a request addressed DIRECTLY to the
-- vendor (rfqs.vendor_id = that vendor) is exempt from the lead cap entirely —
-- not only left out of the count, which 20260916181213 already did, but never
-- refused by the cap check, even when the vendor has used every
-- open-marketplace lead. The open-marketplace side stays capped, unchanged.
--
-- The bug, reproduced live immediately before this migration over real HTTP
-- sign-ins (scripts/targeted-lead-cap-check.mjs): loadtest-vendor-3, free plan,
-- 10/10 open-marketplace leads used; loadtest-buyer-1 addresses a new request
-- to them; the vendor's quote on it was refused with "P0001 Monthly lead limit
-- reached ... you have already quoted 10". The inbox 20260726185436 calls
-- "intentionally not gated by the cap" was gated by the cap.
--
-- ── Why a SECURITY DEFINER helper, not a lookup inside the trigger ─────────
-- enforce_lead_cap() is SECURITY INVOKER and must stay so: its first line,
-- `if current_user <> 'authenticated' then return new`, is how it tells a
-- signed-in request from a migration or service_role, and inside a definer
-- function current_user is the owner, so the cap would silently switch off
-- for everyone. Running as the vendor, a `select vendor_id from rfqs` is
-- filtered by rfqs_select, which shows a targeted RFQ to its vendor only while
-- `status = 'active'`. quotes_insert does not check RFQ status, so a vendor can
-- quote a request the buyer has since closed; the lookup would then see no row,
-- read the target as NULL, and refuse a targeted quote at the cap — the Part 1
-- bug inverted. The helper reads rfqs with definer rights, so visibility
-- cannot change the answer.
--
-- ── Why boolean + caller guard, not "return the target vendor id" ──────────
-- A definer function returning rfqs.vendor_id for any id would tell any
-- signed-in user which vendor any RFQ is addressed to — exactly what
-- rfqs_select hides from everyone but that vendor and the buyer. This answers
-- only "is this RFQ addressed to THIS vendor?", and only for the caller (or an
-- admin), with the same fail-closed 42501 guard as lead_cap_used().
-- `is distinct from` keeps the guard closed when auth.uid() is NULL.
--
-- Unchanged: get_vendor_plan(); lead_cap_used(); the window rule; the
-- "already quoted this RFQ" early return; the cap/used arithmetic and message.
-- The only edit to enforce_lead_cap() is the targeted early return below.

create or replace function public.rfq_targets_vendor(p_rfq uuid, p_vendor uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if p_vendor is distinct from auth.uid() and not coalesce(public.is_admin(), false) then
    raise exception 'rfq_targets_vendor: not permitted for another vendor' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.rfqs r
     where r.id = p_rfq and r.vendor_id = p_vendor
  );
end;
$function$;

-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon/authenticated/service_role by name, so revoking PUBLIC alone does
-- nothing; both are revoked and the result is asserted below.
revoke all on function public.rfq_targets_vendor(uuid, uuid) from public, anon;
grant execute on function public.rfq_targets_vendor(uuid, uuid) to authenticated, service_role;

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

  -- A request addressed directly to this vendor is never gated by the cap
  -- (Master Prompt 12). Looked up with definer rights: rfqs_select hides a
  -- closed RFQ from its own vendor, so an in-trigger read could miss it.
  if public.rfq_targets_vendor(new.rfq_id, new.vendor_id) then
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

-- Abort the whole migration if the privileges or the invoker rights are not
-- exactly what the reasoning above depends on.
do $$
declare f oid := 'public.rfq_targets_vendor(uuid, uuid)'::regprocedure;
begin
  if has_function_privilege('anon', f, 'EXECUTE') then
    raise exception 'rfq_targets_vendor must not be executable by anon';
  end if;
  if not has_function_privilege('authenticated', f, 'EXECUTE') then
    raise exception 'rfq_targets_vendor must be executable by authenticated (the trigger runs as the vendor)';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.enforce_lead_cap()'::regprocedure) then
    raise exception 'enforce_lead_cap must stay SECURITY INVOKER, or its current_user guard disables the cap';
  end if;
end $$;
