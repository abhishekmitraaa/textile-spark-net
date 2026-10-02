-- ─────────────────────────────────────────────────────────────────────────────
-- Admin completion Phase 11: least-privilege admin reads (2026-10-02).
--
-- Seven tables let EVERY admin role read every row (`... or is_admin()`). Each now
-- names the roles whose Cosora-Admin sections read it (roles.ts SECTION_READ):
--
--   vendor_documents, vendor_contracts      super_admin, vendor_ops, support      (Vendors)
--   subscription_invoices,
--   vendor_subscriptions                    super_admin, finance_admin, support   (Subscriptions)
--   ad_orders                               super_admin, ads_moderator,
--                                           finance_admin, support                (Ads, Payments)
--   certificate_orders                      super_admin, finance_admin            (Certificates)
--   engagement_events                       super_admin                           (no page reads it)
--
-- buyer_profiles was already super_admin and support (Phase 1). A vendor still reads its
-- own rows. Every admin page that reports across these tables (Reports, Payments,
-- Customers, Leads, Live Activity, Support) reads them through SECURITY DEFINER
-- functions, which RLS doesn't filter, so none of them changes. The two `admin.support_*`
-- helpers that read them are INVOKER but are only reached through definer functions.
--
-- One reader did depend on the old breadth: the plan-cap triggers on products and
-- catalogues read the vendor's subscription with the CALLER's rights. Cosora-Admin's
-- Products page updates `status` directly, so a product moderator re-approving a
-- rejected listing ran the cap as the moderator; without SELECT on
-- vendor_subscriptions it would see "free plan" and refuse a paying vendor. The lookup
-- moves into `public.vendor_cap_plan()`, a definer helper that answers only for the
-- caller's own vendor id or for an admin (any role, as before), with the same rule the
-- triggers had: an active subscription whose period hasn't ended, else 'free'. The
-- triggers stay INVOKER (claude.md: a definer trigger would see current_user as the
-- owner and skip the cap for everyone). Nothing else in them changes.
-- enforce_ad_location_scope and enforce_lead_cap keep their direct read: no admin
-- writes `advertisements` (Phase 1: review RPCs only, which run as the owner) or inserts
-- `quotes`, so only the vendor ever reaches them.
--
-- Policies use `(select auth.uid())` / `(select public.is_admin())`, so each is
-- evaluated once per statement, not per row (the Phase 12 advisor fix, done here for
-- the policies this migration writes anyway).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The plan lookup the cap triggers need ─────────────────────────────────
create or replace function public.vendor_cap_plan(p_vendor uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text;
begin
  if not (coalesce(p_vendor = auth.uid(), false) or coalesce(public.is_admin(), false)) then
    raise exception 'Only the vendor or an admin can read this plan.' using errcode = '42501';
  end if;

  -- vendor_subscriptions.vendor_id is unique, so this is the triggers' old lookup.
  select vs.plan_id
    into v_plan
    from public.vendor_subscriptions vs
   where vs.vendor_id = p_vendor
     and vs.status = 'active'
     and vs.current_period_end is not null
     and vs.current_period_end > now();

  return coalesce(v_plan, 'free');
end;
$$;

comment on function public.vendor_cap_plan(uuid) is
  'The plan a vendor''s caps follow: an active, unexpired subscription''s plan, else free. For the plan-cap triggers, which run with the caller''s rights (admin completion Phase 11).';

revoke all on function public.vendor_cap_plan(uuid) from public, anon, authenticated;
grant execute on function public.vendor_cap_plan(uuid) to authenticated;

create or replace function public.enforce_product_cap()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  cap        integer;
  used       integer;
  eff_plan   text := 'free';
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

  -- With definer rights: a moderator approving a listing can't read the
  -- vendor's subscription (admin completion Phase 11).
  eff_plan := public.vendor_cap_plan(new.vendor_id);

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

create or replace function public.enforce_catalogue_plan()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  eff_plan   text := 'free';
  allowed    boolean;
  guard      boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    guard := true;
  else
    guard := new.status::text in ('under_review','live')
             and coalesce(old.status::text,'') not in ('under_review','live');
  end if;

  if not guard then
    return new;
  end if;

  -- With definer rights: a moderator approving a catalogue can't read the
  -- vendor's subscription (admin completion Phase 11).
  eff_plan := public.vendor_cap_plan(new.vendor_id);

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
$function$;

-- ── 2. Admin reads by role ───────────────────────────────────────────────────
alter policy vendor_documents_admin_read on public.vendor_documents
  using ((select public.is_admin())
         and (select public.admin_role()) = any (array['super_admin', 'vendor_ops', 'support']::public.admin_role_type[]));

alter policy vendor_contracts_select on public.vendor_contracts
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'vendor_ops', 'support']::public.admin_role_type[])));

alter policy subscription_invoices_select on public.subscription_invoices
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[])));

alter policy vendor_subscriptions_select on public.vendor_subscriptions
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[])));

alter policy ad_orders_select_own on public.ad_orders
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'ads_moderator', 'finance_admin', 'support']::public.admin_role_type[])));

alter policy certificate_orders_read on public.certificate_orders
  using (coalesce(vendor_id = (select auth.uid()), false)
         or (coalesce((select public.is_admin()), false)
             and (select public.admin_role()) = any (array['super_admin', 'finance_admin']::public.admin_role_type[])));

alter policy engagement_events_select on public.engagement_events
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = 'super_admin'::public.admin_role_type));

-- ── 3. Self-check ────────────────────────────────────────────────────────────
do $check$
declare
  r record;
  bad text := '';
begin
  -- Every read policy on the seven tables names its admin roles.
  for r in
    select tablename, policyname, qual
      from pg_policies
     where schemaname = 'public'
       and cmd in ('SELECT', 'ALL')
       and tablename in ('vendor_documents', 'vendor_contracts', 'subscription_invoices', 'vendor_subscriptions',
                         'ad_orders', 'certificate_orders', 'engagement_events')
       and qual ~ 'is_admin\(\)'
       and qual !~ 'admin_role\(\)'
  loop
    bad := bad || format(' %s.%s', r.tablename, r.policyname);
  end loop;
  if bad <> '' then
    raise exception 'Phase 11 self-check: a read policy still admits every admin role:%', bad;
  end if;

  -- The helper is definer with a pinned path, and only signed-in callers run it.
  if not (select p.prosecdef and p.proconfig @> array['search_path=public']
            from pg_proc p where p.oid = 'public.vendor_cap_plan(uuid)'::regprocedure) then
    raise exception 'Phase 11 self-check: vendor_cap_plan must be SECURITY DEFINER with search_path=public';
  end if;
  if has_function_privilege('anon', 'public.vendor_cap_plan(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.vendor_cap_plan(uuid)', 'EXECUTE') then
    raise exception 'Phase 11 self-check: vendor_cap_plan EXECUTE must be authenticated only';
  end if;

  -- The cap triggers stay INVOKER and no longer read the subscription themselves.
  for r in
    select p.proname, p.prosecdef, p.prosrc
      from pg_proc p
     where p.oid in ('public.enforce_product_cap()'::regprocedure, 'public.enforce_catalogue_plan()'::regprocedure)
  loop
    if r.prosecdef then
      raise exception 'Phase 11 self-check: % must stay SECURITY INVOKER', r.proname;
    end if;
    if r.prosrc ~ 'vendor_subscriptions' or r.prosrc !~ 'vendor_cap_plan' then
      raise exception 'Phase 11 self-check: % must read the plan through vendor_cap_plan()', r.proname;
    end if;
  end loop;
end
$check$;
