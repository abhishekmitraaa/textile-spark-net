-- ─────────────────────────────────────────────────────────────
-- Server-side enforcement for the three remaining client-only ("bypassable")
-- subscription limits, mirroring the proven enforce_product_cap() pattern:
--   * SECURITY INVOKER + `current_user <> 'authenticated'` guard, so real
--     end-user (PostgREST) writes are enforced while service-role / SECURITY
--     DEFINER paths (seeds, the ad-publish edge function, admin RPCs) bypass —
--     exactly like enforce_product_cap() / enforce_products_moderation().
--   * Effective plan resolved from vendor_subscriptions (status='active' AND
--     current_period_end > now()), else fall back to 'free'.
--   * Clear P0001 error messages.
--
-- Scope of this migration is blocking OVER-LIMIT CREATION only. It does NOT
-- build buyer-geography ad delivery, and it does NOT wire up subscription_usage
-- (lead usage is live-counted, same as get_vendor_plan / product_cap).
-- enforce_product_cap() and trg_products_cap are left untouched.
-- ─────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════
-- 1. has_auto_catalog — block Free (has_auto_catalog=false) from creating a
--    catalogue. Free = manual only per the plan table; Basic+ unaffected.
--    Insert of any status is blocked for a plan without the feature (the only
--    UI path inserts under_review anyway); an UPDATE that transitions a held
--    draft INTO a visible state (draft -> under_review/live) is also blocked,
--    while editing an already-visible catalogue is left alone (no collateral).
-- ══════════════════════════════════════════════════════════════
create or replace function public.enforce_catalogue_plan()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  eff_plan   text := 'free';
  sub_plan   text;
  sub_status text;
  sub_end    timestamptz;
  allowed    boolean;
  guard      boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    guard := true;  -- any new catalogue for a feature-less plan is blocked
  else
    -- Only a transition INTO a moderation-visible state is a "publish".
    guard := new.status::text in ('under_review','live')
             and coalesce(old.status::text,'') not in ('under_review','live');
  end if;

  if not guard then
    return new;
  end if;

  select vs.plan_id, vs.status, vs.current_period_end
    into sub_plan, sub_status, sub_end
    from public.vendor_subscriptions vs
   where vs.vendor_id = new.vendor_id;

  if sub_plan is not null and sub_status = 'active'
     and sub_end is not null and sub_end > now() then
    eff_plan := sub_plan;
  end if;

  select coalesce((limits->>'has_auto_catalog')::boolean, false)
    into allowed
    from public.subscription_plans
   where id = eff_plan;

  if not coalesce(allowed, false) then
    raise exception
      'Catalogue upload is a paid feature: your % plan does not include automatic catalogue upload. Upgrade to Basic or above.',
      eff_plan
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_catalogues_plan on public.catalogues;
create trigger trg_catalogues_plan
  before insert or update on public.catalogues
  for each row execute function public.enforce_catalogue_plan();


-- ══════════════════════════════════════════════════════════════
-- 2. ad_location_scope — two rules on `advertisements`:
--    (a) Free (scope 'none') cannot create an ad at all.
--    (b) Paid tiers may target at most N locations (target_cities array length):
--        state_1 -> 1, state_4 -> 4, pan_india / global -> unlimited.
--    On UPDATE only an INCREASE in target-location count beyond the allowance is
--    blocked, so same-scope edits (pause/resume, budget, reducing cities) are
--    never collaterally blocked.
--
--    NOTE: the primary active-campaign publish path is the Razorpay
--    verify/webhook edge function, which inserts via the service role and — like
--    seeds — is intentionally bypassed by the current_user guard (same as
--    product_cap). This trigger hardens the direct authenticated insert/update
--    surface that RLS exposes (any non-'active' ad). It does not build geo
--    delivery.
-- ══════════════════════════════════════════════════════════════
create or replace function public.enforce_ad_location_scope()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  eff_plan   text := 'free';
  sub_plan   text;
  sub_status text;
  sub_end    timestamptz;
  scope      text;
  allowance  integer;  -- max target locations; null = unlimited
  new_n      integer;
  old_n      integer;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  select vs.plan_id, vs.status, vs.current_period_end
    into sub_plan, sub_status, sub_end
    from public.vendor_subscriptions vs
   where vs.vendor_id = new.vendor_id;

  if sub_plan is not null and sub_status = 'active'
     and sub_end is not null and sub_end > now() then
    eff_plan := sub_plan;
  end if;

  select limits->>'ad_location_scope'
    into scope
    from public.subscription_plans
   where id = eff_plan;
  scope := coalesce(scope, 'none');

  allowance := case scope
                 when 'none'    then 0
                 when 'state_1' then 1
                 when 'state_4' then 4
                 else null            -- pan_india / global => unlimited
               end;

  new_n := coalesce(jsonb_array_length(
             case when jsonb_typeof(new.target_cities) = 'array'
                  then new.target_cities else '[]'::jsonb end), 0);

  if tg_op = 'INSERT' then
    if scope = 'none' then
      raise exception
        'Advertising is a paid feature: your % plan cannot create ad campaigns. Upgrade to a paid plan.',
        eff_plan
        using errcode = 'P0001';
    end if;
    if allowance is not null and new_n > allowance then
      raise exception
        'Ad targeting exceeds your plan: % (%) allows up to % target location(s); this ad targets %.',
        eff_plan, scope, allowance, new_n
        using errcode = 'P0001';
    end if;
  else -- UPDATE: block only an increase in target locations beyond the allowance
    old_n := coalesce(jsonb_array_length(
               case when jsonb_typeof(old.target_cities) = 'array'
                    then old.target_cities else '[]'::jsonb end), 0);
    if allowance is not null and new_n > allowance and new_n > old_n then
      raise exception
        'Ad targeting exceeds your plan: % (%) allows up to % target location(s); this ad targets %.',
        eff_plan, scope, allowance, new_n
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ads_location_scope on public.advertisements;
create trigger trg_ads_location_scope
  before insert or update on public.advertisements
  for each row execute function public.enforce_ad_location_scope();


-- ══════════════════════════════════════════════════════════════
-- 3. leads_per_month — block a vendor who is already at their plan's monthly
--    lead allowance from quoting a NEW RFQ. A "lead used" = a distinct RFQ the
--    vendor has quoted in the current period, matching get_vendor_plan's
--    leads_used (count(distinct rfq_id) where created_at >= period start).
--
--    Period window mirrors get_vendor_plan: an active paid subscription uses its
--    current_period_start; otherwise the calendar month (Free behaviour).
--
--    Re-quoting / editing an existing quote never consumes a new lead: quotes
--    upsert on (rfq_id, vendor_id), so an INSERT whose pair already exists will
--    become an ON CONFLICT UPDATE — detected and allowed. UPDATEs are allowed
--    outright (the lead was consumed at first quote; created_at is unchanged).
-- ══════════════════════════════════════════════════════════════
create or replace function public.enforce_lead_cap()
returns trigger
language plpgsql
set search_path to 'public'
as $$
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

  -- Editing an existing quote is not a new lead.
  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- An INSERT for an already-quoted (rfq_id, vendor_id) is an upsert that will
  -- UPDATE the existing quote — not a new lead.
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
    eff_plan  := sub_plan;
    win_start := sub_start;
  else
    win_start := date_trunc('month', now());
  end if;
  win_start := coalesce(win_start, date_trunc('month', now()));

  select coalesce((limits->>'leads_per_month')::int, 0)
    into cap
    from public.subscription_plans
   where id = eff_plan;
  cap := coalesce(cap, 0);

  -- Negative would mean unlimited (none today); guard anyway.
  if cap < 0 then
    return new;
  end if;

  select count(distinct q.rfq_id)
    into used
    from public.quotes q
   where q.vendor_id = new.vendor_id
     and q.created_at >= win_start;

  if used >= cap then
    raise exception
      'Monthly lead limit reached: your % plan allows % lead(s) per period; you have already quoted % this period. Upgrade your plan to quote more.',
      eff_plan, cap, used
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_quotes_lead_cap on public.quotes;
create trigger trg_quotes_lead_cap
  before insert or update on public.quotes
  for each row execute function public.enforce_lead_cap();
