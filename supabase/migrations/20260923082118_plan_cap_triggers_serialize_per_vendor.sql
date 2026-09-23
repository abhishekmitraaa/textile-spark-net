-- Serialize each vendor's plan-cap checks with a transaction-scoped advisory
-- lock (Master Prompt 12, Part E).
--
-- enforce_product_cap() and enforce_lead_cap() COUNT the vendor's rows, then
-- decide. Two transactions that count before either commits both see the same
-- free slot, and both insert. The 2026-09-16 probe reported no race because
-- its "concurrent" inserts ran one after another in a single SQL session. Real
-- concurrent HTTP requests (scripts/cap-race-check.mjs, 10 at once, 5 rounds,
-- immediately before this migration) broke both caps:
--   product cap, loadtest-vendor-36, free plan at 1/2:
--     accepted 2, 3, 2, 2, 5 per round  -> over the cap in 5 of 5 rounds (peak 6/2)
--   lead cap, loadtest-vendor-61, free plan at 9/10:
--     accepted 2, 2, 1, 2, 2 per round  -> over the cap in 4 of 5 rounds (11/10)
--
-- The fix: pg_advisory_xact_lock(hashtext(vendor_id::text)) before the count.
-- A second insert for the same vendor waits until the first one's transaction
-- ends. Its count is a new statement in a VOLATILE plpgsql function under READ
-- COMMITTED (PostgREST's default), so it takes a fresh snapshot, sees the row
-- just committed, and refuses. The lock is keyed per vendor, so different
-- vendors never wait on each other. It is released at commit or rollback.
-- Nothing else in this database takes advisory locks (checked in pg_proc).
-- Both triggers share the key, so one vendor's product and quote inserts also
-- queue behind each other; each holds the lock for milliseconds.
--
-- Placement:
--   enforce_product_cap: after the "does this write take a slot" early
--     return, so editing a listing's text never waits;
--   enforce_lead_cap: after the INSERT-only early return and before the
--     "already quoted" and targeted-request checks, so it covers every read
--     the decision depends on.
-- Rows written by postgres/service_role still return before the lock, as they
-- always have.
--
-- NOT changed: enforce_ad_location_scope() and enforce_catalogue_plan(). Each
-- checks only the row being written (its own target_cities against the plan's
-- allowance, or a plan feature flag) and counts nothing, so no two writes can
-- race on shared state; a lock there would add waiting and protect nothing.
--
-- The only difference in either function is the lock_block below. The DO
-- block at the end proves it: removing lock_block from each new definition must
-- give back the exact md5 recorded before the change, and both must still be
-- SECURITY INVOKER (their current_user guard depends on it).

create temp table _part_e_before on commit drop as
select p.proname::text as fn, md5(pg_get_functiondef(p.oid)) as def_md5
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('enforce_product_cap', 'enforce_lead_cap');

create or replace function public.enforce_product_cap()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  cap        integer;
  used       integer;
  eff_plan   text := 'free';
  sub_plan   text;
  sub_status text;
  sub_end    timestamptz;
  adds_slot  boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    adds_slot := new.status::text in ('under_review', 'live');
  else
    adds_slot := new.status::text in ('under_review', 'live')
                 and coalesce(old.status::text, '') not in ('under_review', 'live');
  end if;

  if not adds_slot then
    return new;
  end if;

  -- One cap check per vendor at a time. Without it, concurrent writes all
  -- count the same free slot (proven over HTTP: Master Prompt 12, Part E).
  perform pg_advisory_xact_lock(hashtext(new.vendor_id::text));

  select vs.plan_id, vs.status, vs.current_period_end
    into sub_plan, sub_status, sub_end
    from public.vendor_subscriptions vs
   where vs.vendor_id = new.vendor_id;

  if sub_plan is not null and sub_status = 'active'
     and sub_end is not null and sub_end > now() then
    eff_plan := sub_plan;
  end if;

  select coalesce((limits->>'product_cap')::int, -1)
    into cap
    from public.subscription_plans
   where id = eff_plan;

  cap := coalesce(cap, -1);

  if cap < 0 then
    return new;
  end if;

  select count(*)
    into used
    from public.products
   where vendor_id = new.vendor_id
     and status::text in ('under_review', 'live')
     and id <> new.id;

  if used >= cap then
    raise exception
      'Product limit reached: your % plan allows % listed product(s); you already have %. Upgrade your plan or remove a listing.',
      eff_plan, cap, used
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

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

  -- One cap check per vendor at a time. Without it, concurrent writes all
  -- count the same free slot (proven over HTTP: Master Prompt 12, Part E).
  perform pg_advisory_xact_lock(hashtext(new.vendor_id::text));

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

do $$
declare
  lock_block constant text :=
    E'  -- One cap check per vendor at a time. Without it, concurrent writes all\n'
    || E'  -- count the same free slot (proven over HTTP: Master Prompt 12, Part E).\n'
    || E'  perform pg_advisory_xact_lock(hashtext(new.vendor_id::text));\n'
    || E'\n';
  r record;
  new_def text;
begin
  if (select count(*) from _part_e_before) <> 2 then
    raise exception 'expected enforce_product_cap and enforce_lead_cap to exist before the change';
  end if;
  for r in select fn, def_md5 from _part_e_before loop
    new_def := pg_get_functiondef(('public.' || r.fn || '()')::regprocedure);
    if position(lock_block in new_def) = 0 then
      raise exception '%: advisory lock block not found', r.fn;
    end if;
    if md5(replace(new_def, lock_block, '')) <> r.def_md5 then
      raise exception '%: changed beyond the advisory lock block', r.fn;
    end if;
    if (select prosecdef from pg_proc where oid = ('public.' || r.fn || '()')::regprocedure) then
      raise exception '%: must stay SECURITY INVOKER', r.fn;
    end if;
  end loop;
end $$;
